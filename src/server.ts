import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./router.js";
import { logger } from "./logger.js";

const server = new McpServer({
  name: "mcp-github-issues",
  version: "1.2.0",
});

registerAllTools(server);

logger.info("mcp-github-issues MCP server starting", { logFile: logger.logFile });

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("mcp-github-issues MCP server connected via stdio");
