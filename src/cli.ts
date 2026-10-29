#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge } from './bridge.js';
import { createRemote, readToken, MAX_REQUEST_BYTES } from './remote.js';

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('This bridge accepts no command-line arguments. Configure LINKSRF_MCP_TOKEN in the client environment.');
  const remote = createRemote(readToken(process.env));
  const server = createBridge(remote);
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: MAX_REQUEST_BYTES });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await remote.close().catch(() => {});
    await server.close().catch(() => {});
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  process.stdin.once('end', () => { void shutdown(); });
  server.onerror = () => { process.stderr.write('LinksRF MCP protocol request failed.\n'); };
  await server.connect(transport);
}

main().catch(() => {
  process.stderr.write('LinksRF MCP could not start. Use Node.js 22 and configure a valid LINKSRF_MCP_TOKEN environment variable. No token arguments are accepted.\n');
  process.exitCode = 1;
});
