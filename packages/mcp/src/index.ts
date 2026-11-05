#!/usr/bin/env node
// Lanes MCP server — the bridge Claude uses to add and read tasks (docs/05-CLAUDE-INTEGRATION.md).
// stdio transport: stdout belongs to the protocol, so anything else goes to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient, tokenReader } from './client.js';
import { loadConfig } from './config.js';
import { createLanesServer } from './server.js';

const config = loadConfig();
const server = createLanesServer({
  client: createClient({ url: config.url, readToken: tokenReader(config.dataDir) }),
  linkBase: config.linkBase,
});

await server.connect(new StdioServerTransport());
console.error(`lanes-mcp ready → ${config.url}`);
