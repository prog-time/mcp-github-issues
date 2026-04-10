import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, getOctokit } from "../config.js";
import { logger } from "../logger.js";

export function register(server: McpServer): void {
  server.tool(
    "list_issues",
    "List GitHub Issues for a project with optional filters",
    {
      project: z.string().describe("Project name from projects.yaml"),
      state: z
        .enum(["open", "closed", "all"])
        .default("open")
        .describe("Issue state filter (default: open)"),
      label: z.string().optional().describe("Filter by label name"),
      assignee: z.string().optional().describe("Filter by assignee username"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("Max number of issues to return (default: 30)"),
    },
    async (input) => {
      logger.info("tool called: list_issues", {
        project: input.project,
        state: input.state,
        label: input.label,
        assignee: input.assignee,
      });

      try {
        const project = getProject(input.project);
        const octokit = getOctokit(project);

        const response = await octokit.issues.listForRepo({
          owner: project.owner,
          repo: project.repo,
          state: input.state,
          ...(input.label ? { labels: input.label } : {}),
          ...(input.assignee ? { assignee: input.assignee } : {}),
          per_page: input.limit,
        });

        const issues = response.data.filter((i) => !i.pull_request);

        logger.info("list_issues done", { count: issues.length });

        if (issues.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No ${input.state} issues found in ${project.owner}/${project.repo}.`,
              },
            ],
          };
        }

        const lines = [
          `## Issues in ${project.owner}/${project.repo} (${input.state})`,
          ``,
          ...issues.map((issue) => {
            const labelStr = issue.labels
              .map((l) => (typeof l === "string" ? l : l.name ?? ""))
              .filter(Boolean)
              .map((l) => `\`${l}\``)
              .join(" ");
            const assigneeStr =
              issue.assignees && issue.assignees.length > 0
                ? issue.assignees.map((a) => `@${a.login}`).join(", ")
                : "";
            const meta = [labelStr, assigneeStr].filter(Boolean).join(" — ");
            return `- **#${issue.number}** [${issue.title}](${issue.html_url})${meta ? `  \n  ${meta}` : ""}`;
          }),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("list_issues failed", { error: String(err) });
        throw err;
      }
    }
  );
}
