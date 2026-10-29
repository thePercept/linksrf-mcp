import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { RemoteTools } from './remote.js';
import { SafeRemoteError } from './remote.js';
import { CONTENT_NOTICE, toolDefinitions, validateToolCall } from './tools.js';

export function createBridge(remote: RemoteTools): Server {
  const server = new Server({ name: 'linksrf-mcp', version: '0.1.0' }, {
    capabilities: { tools: { listChanged: false } },
    instructions: `Read-only access to the connected LinksRF account. Paid-plan access, ownership, revocation and analytics quotas are enforced by LinksRF on every remote request. ${CONTENT_NOTICE}`
  });
  server.setRequestHandler(ListToolsRequestSchema, async request => {
    if (request.params?.cursor !== undefined) throw new Error('Tool pagination is unsupported');
    return { tools: toolDefinitions() };
  });
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const input = validateToolCall(request.params.name, request.params.arguments ?? {});
      return await remote.call(input.name, input.arguments);
    } catch (error) {
      return { content: [{ type: 'text' as const, text: error instanceof SafeRemoteError ? error.message : 'The read-only tool request is invalid or unavailable.' }], isError: true };
    }
  });
  return server;
}
