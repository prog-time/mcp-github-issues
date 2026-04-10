import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as listProjects from "./tools/listProjects.js";
import * as draft from "./tools/draft.js";
import * as publish from "./tools/publish.js";
import * as fetchIssue from "./tools/fetchIssue.js";
import * as listIssues from "./tools/listIssues.js";
import * as listDrafts from "./tools/listDrafts.js";
import * as addComment from "./tools/addComment.js";
import * as updateIssue from "./tools/updateIssue.js";

export function registerAllTools(server: McpServer): void {
  listProjects.register(server);
  draft.register(server);
  publish.register(server);
  fetchIssue.register(server);
  listIssues.register(server);
  listDrafts.register(server);
  addComment.register(server);
  updateIssue.register(server);
}
