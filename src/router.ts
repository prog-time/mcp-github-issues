import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as listProjects from "./tools/listProjects.js";
import * as draft from "./tools/draft.js";
import * as publish from "./tools/publish.js";

export function registerAllTools(server: McpServer): void {
  listProjects.register(server);
  draft.register(server);
  publish.register(server);
}
