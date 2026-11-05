// Adds the demo task through the real Lanes MCP server (stdio), like Claude's /task does.
import path from 'node:path';
import { Client } from '../../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve(import.meta.dirname, '../../packages/mcp/dist/index.js')],
  env: { ...process.env },
});
const client = new Client({ name: 'readme-demo', version: '0' });
await client.connect(transport);
await client.callTool({
  name: 'add_task',
  arguments: {
    title: 'Send Kitebird the final banners',
    project: 'Kitebird',
    priority: 'urgent',
    due: 'tomorrow 3pm',
    reminders: [{ at: '1pm' }],
  },
});
await client.close();
