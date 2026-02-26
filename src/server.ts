import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./router.js";
import { logger } from "./logger.js";

const server = new McpServer({
  name: "github-issues-server",
  version: "1.0.0",
});

registerAllTools(server);

logger.info("github-issues-server MCP server starting", { logFile: logger.logFile });

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("github-issues-server MCP server connected via stdio");
