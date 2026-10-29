import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { projectResult } from './projection.js';
import { validateToolCall } from './tools.js';

export const ENDPOINT = 'https://linksrf.com/api/v1/mcp';
export const MAX_REQUEST_BYTES = 16_384;
export const MAX_RESPONSE_BYTES = 524_288;
const TIMEOUT_MS = 15_000;

export class SafeRemoteError extends Error {
  constructor(public readonly reason: 'authentication' | 'subscription' | 'quota' | 'unavailable' = 'unavailable') {
    super(reason === 'authentication' ? 'The LinksRF token is invalid, expired or revoked. Create a token in LinksRF and restart the bridge.'
      : reason === 'subscription' ? 'An active paid Growth or higher subscription is required.'
        : reason === 'quota' ? 'A LinksRF request or analytics limit was reached. Try again later or review your plan.'
          : 'LinksRF MCP is temporarily unavailable. Try again later.');
  }
}

export function readToken(env: NodeJS.ProcessEnv): string {
  const token = env.LINKSRF_MCP_TOKEN;
  if (!token || !/^lrf_mcp_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Set LINKSRF_MCP_TOKEN to a valid LinksRF MCP token in your client environment.');
  return token;
}

export function pinnedFetch(token: string, fetchImpl: FetchLike = globalThis.fetch): FetchLike {
  return async (input, init = {}) => {
    if (String(input) !== ENDPOINT) throw new SafeRemoteError();
    // The LinksRF endpoint uses stateless JSON responses; no background SSE stream.
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (init.method !== 'POST' || typeof init.body !== 'string' || Buffer.byteLength(init.body, 'utf8') > MAX_REQUEST_BYTES) throw new SafeRemoteError();
    const source = new Headers(init.headers);
    const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' });
    const version = source.get('mcp-protocol-version');
    if (version) headers.set('mcp-protocol-version', version);
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, { method: 'POST', headers, body: init.body, signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
    } catch { throw new SafeRemoteError(); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SafeRemoteError(response.status === 401 ? 'authentication' : response.status === 403 || response.status === 402 ? 'subscription' : response.status === 429 ? 'quota' : 'unavailable');
    }
    if (response.status === 202 || response.status === 204) {
      await response.body?.cancel();
      return new Response(null, { status: response.status });
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')
      || Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES || !response.body) {
      await response.body?.cancel();
      throw new SafeRemoteError();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new SafeRemoteError(); }
        chunks.push(item.value);
      }
    } catch { throw new SafeRemoteError(); }
    finally { reader.releaseLock(); }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  };
}

export interface RemoteTools { call(name: string, args: unknown): Promise<CallToolResult>; close(): Promise<void> }

export function createRemote(token: string, fetchImpl: FetchLike = globalThis.fetch): RemoteTools {
  let client: Client | undefined;
  let connecting: Promise<Client> | undefined;
  let closed = false;
  let active = 0;
  const safeFetch = pinnedFetch(token, fetchImpl);
  async function connection(): Promise<Client> {
    if (closed) throw new SafeRemoteError();
    if (client) return client;
    if (connecting) return connecting;
    connecting = (async () => {
      const next = new Client({ name: 'linksrf-mcp-bridge', version: '0.1.0' }, { capabilities: {} });
      next.onerror = () => {}; // Do not expose upstream exception strings or headers.
      try {
        await next.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT), {
          fetch: safeFetch, requestInit: { redirect: 'error' },
          reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 }
        }), { timeout: TIMEOUT_MS });
        if (closed) { await next.close(); throw new SafeRemoteError(); }
        client = next;
        return next;
      } catch (error) { await next.close().catch(() => {}); throw error; }
    })();
    try { return await connecting; } finally { connecting = undefined; }
  }
  return {
    async call(name, args) {
      const input = validateToolCall(name, args);
      if (active >= 2) throw new SafeRemoteError();
      active++;
      try {
        const upstream = await connection();
        const result = await upstream.callTool(input, undefined, { timeout: TIMEOUT_MS });
        if (result.isError) throw new SafeRemoteError();
        const blocks: unknown[] = Array.isArray(result.content) ? result.content : [];
        const firstText = blocks.find((item): item is { type: 'text'; text: string } => Boolean(item) && typeof item === 'object'
          && (item as Record<string, unknown>).type === 'text' && typeof (item as Record<string, unknown>).text === 'string');
        const data = result.structuredContent ?? JSON.parse(firstText?.text || 'null');
        const projected = projectResult(input.name, data);
        return { content: [{ type: 'text', text: JSON.stringify(projected) }], structuredContent: projected, isError: false };
      } catch (error) {
        if (error instanceof SafeRemoteError) throw error;
        throw new SafeRemoteError();
      } finally { active--; }
    },
    async close() { closed = true; await client?.close(); }
  };
}
