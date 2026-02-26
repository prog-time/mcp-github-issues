import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

export function register(server: McpServer): void {
  server.tool("list_projects", "List all available projects", {}, async () => {
    logger.info("tool called: list_projects");

    const projects = Object.entries(config.projects).map(([name, p]) => ({
      name,
      owner: p.owner,
      repo: p.repo,
      tasksDir: p.tasksDir,
    }));

    logger.info("list_projects done", { count: projects.length });

    const lines = projects.map(
      (p) => `- **${p.name}**: ${p.owner}/${p.repo} (tasks: ${p.tasksDir})`
    );

    return {
      content: [
        {
          type: "text",
          text: `## Available Projects\n\n${lines.join("\n")}`,
        },
      ],
    };
  });
}
