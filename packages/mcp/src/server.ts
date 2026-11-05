import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { APP_VERSION } from '@lanes/shared';
import { INSTRUCTIONS } from './instructions.js';
import { registerTools, type ToolDeps } from './tools.js';

export function createLanesServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: 'lanes', title: 'Lanes', version: APP_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, deps);
  return server;
}
