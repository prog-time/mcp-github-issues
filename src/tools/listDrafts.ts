import fs from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, resolveTasksDir } from "../config.js";
import { logger } from "../logger.js";
import { extractTitle } from "./publish.js";

export function register(server: McpServer): void {
  server.tool(
    "list_drafts",
    "List unpublished local draft .md files for a project",
    {
      project: z.string().describe("Project name from projects.yaml"),
    },
    async (input) => {
      logger.info("tool called: list_drafts", { project: input.project });

      try {
        const project = getProject(input.project);
        const tasksDir = resolveTasksDir(project);

        if (!fs.existsSync(tasksDir)) {
          return {
            content: [
              {
                type: "text",
                text: `No drafts found. Directory does not exist: \`${tasksDir}\``,
              },
            ],
          };
        }

        const files = fs
          .readdirSync(tasksDir)
          .filter((f) => f.endsWith(".md"))
          .sort();

        logger.info("list_drafts done", { count: files.length });

        if (files.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No drafts found in \`${tasksDir}\`.`,
              },
            ],
          };
        }

        const lines = [
          `## Drafts for project "${input.project}"`,
          ``,
          `Directory: \`${tasksDir}\``,
          ``,
          ...files.map((file) => {
            const filePath = path.join(tasksDir, file);
            const content = fs.readFileSync(filePath, "utf-8");
            const title = extractTitle(content);
            return `- **${title}**  \n  \`${filePath}\``;
          }),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("list_drafts failed", { error: String(err) });
        throw err;
      }
    }
  );
}
