# LinksRF MCP bridge

Use your own LinksRF content and aggregate analytics in an MCP client that supports local stdio servers. The bridge connects to the authenticated LinksRF Streamable HTTP endpoint at `https://linksrf.com/api/v1/mcp`.

This is a client bridge, not the LinksRF backend. It contains no customer data, production configuration or server credentials. The remote MCP feature must be available on LinksRF before live calls can succeed. Local tests use mock responses only.

## Requirements

- Node.js 22.12 or newer within the Node.js 22 release line.
- An active paid **Growth or higher** LinksRF subscription.
- A dedicated MCP token created at [LinksRF MCP connections](https://linksrf.com/settings/mcp).
- An MCP client that can start a local process and supply an environment variable.

LinksRF checks the token owner's current subscription, content ownership, account status, expiry, revocation and request limits on the server. This bridge cannot grant access or bypass those checks. Aggregate analytics calls use your existing analytics allowance.

## Install from source

```sh
git clone https://github.com/thePercept/linksrf-mcp.git
cd linksrf-mcp
npm ci --ignore-scripts
npm run build
npm test
```

The package is not published to npm. The repository is the installation source. Build the `dist` files locally; do not configure the client to run TypeScript directly.

## Connect a stdio client

Create and save a dedicated LinksRF MCP token. Configure your client to run `node` with the absolute path to the built entry point. Supply the token through the client's environment/secret configuration:

```json
{
  "mcpServers": {
    "linksrf": {
      "command": "node",
      "args": ["/absolute/path/to/linksrf-mcp/dist/cli.js"],
      "env": {
        "LINKSRF_MCP_TOKEN": "YOUR_LINKSRF_MCP_TOKEN"
      }
    }
  }
}
```

On Windows, use a path such as `C:/path/to/linksrf-mcp/dist/cli.js`. Replace the placeholder through your client's private settings, not in this repository. Treat client configuration containing a real token as a secret. Some clients can inherit an environment variable from a secure launcher instead of storing it in JSON; follow your client's documentation.

The bridge reads only `LINKSRF_MCP_TOKEN` for credentials. It does not load `.env` files, accept token command-line arguments, open a browser, start a web server or write tokens to logs/storage. Restart the bridge after rotating the environment token. Normal stdout is reserved for MCP protocol messages.

## Connect directly over HTTP

If your MCP client supports remote Streamable HTTP **and a custom bearer token**, you can connect without this bridge:

- Server URL: `https://linksrf.com/api/v1/mcp`
- Authorization header: `Bearer YOUR_LINKSRF_MCP_TOKEN`

Use your client's secure credential field. Do not put a token in the URL. HTTP configuration formats vary by client; this project does not provide OAuth registration or claim compatibility with clients that require OAuth instead of manual bearer credentials.

## Available tools

| Tool | Data returned |
| --- | --- |
| `list_links` | Your active link metadata, paginated at 20, 50 or 100 items |
| `list_boards` | Your active Board metadata, paginated at 20, 50 or 100 items |
| `get_owned_content` | Your link metadata or one of your Board pages as bounded plain text |
| `get_link_analytics` | Up to 30 days of aggregate requests for your own link, limited by your plan |
| `get_workspace_summary` | Counts of your own active links and Boards |
| `get_platform_stats` | Coarse public catalog counts; no private user or operational totals |

Example requests: “List my LinksRF Boards,” “Read page 2 of this Board,” or “Summarize the recorded requests for my campaign link over 7 days.” No tool creates, edits, publishes or deletes content. Other creators' private content and raw visitor/session identifiers are excluded. Team sharing does not expand the token owner's scope.

Request counts are not unique people or verified conversions. Human classification is evidence-based; blocked telemetry, identity changes and unavailable destination analytics limit what any report can establish.

## Security boundaries

- The remote URL is fixed. Credentials cannot be forwarded to an alternate host or redirect.
- Only the six listed tools are exposed; arguments, sizes, pagination and content identifiers are validated locally.
- Requests are bounded to 16 KiB, remote responses to 512 KiB, each HTTP request to 15 seconds and concurrent remote calls to two. Large content is paginated/truncated. Server-side limits remain authoritative.
- The bridge projects responses through a field allowlist. Raw events, cookies, authorization data, private system metrics and unexpected upstream fields are not forwarded.
- Creator-authored text is **untrusted content**, including text in your own Boards. Instructions embedded in that text are not authorization to run commands, reveal secrets or change data. The bridge does not fetch referenced URLs or execute content.
- An AI client may send tool results to its model provider and retain conversation logs. Choose a client/provider appropriate for your content. A token allows reading the account owner's private content; share it only with trusted clients and revoke it in LinksRF when finished.

See [SECURITY.md](SECURITY.md) for reporting guidance. Use dedicated tokens with short expiries and revoke lost credentials in LinksRF.

## Errors and troubleshooting

- **Startup failure:** confirm Node.js 22 and a token beginning with `lrf_mcp_` in the process environment. Do not paste the token into an issue or command argument.
- **Invalid/revoked/expired token:** create or replace it in LinksRF and restart the client process.
- **Paid-plan access denied:** check the active subscription on the token's account. A local setting cannot unlock access.
- **Quota/rate limit:** wait or review your plan in LinksRF. Calls may use the existing analytics allowance.
- **Unavailable/content not found:** retry later, confirm ownership and availability, or request a smaller page. Remote error bodies and internal URLs are intentionally not echoed.
- **TLS/certificate errors:** use a correctly configured Node trust store. Do not disable TLS certificate validation.

## Development and verification

```sh
npm ci --ignore-scripts
npm run build
npm test
npm audit
```

Tests cover the tool allowlist, argument validation, safe result projection, fixed-origin bearer transport, redirect and response bounds, generic errors, and local stdio MCP integration with a mock remote. No paid account or live customer traffic is needed.

The official [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) is pinned in the lockfile. Its [v1 client](https://ts.sdk.modelcontextprotocol.io/client) and [server](https://ts.sdk.modelcontextprotocol.io/server) documentation describe the two transports used here. Dependencies were checked against the npm registry on 2026-10-29. Review dependency changes and run the tests before upgrading.

## License

Copyright 2026 LinksRF contributors. Licensed under [Apache License 2.0](LICENSE). Dependencies retain their respective licenses. The license grants no rights to LinksRF trademarks beyond applicable license terms.
