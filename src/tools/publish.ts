import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, getOctokit } from "../config.js";
import { logger } from "../logger.js";

// ─── mappings ────────────────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  bug: "bug",
  feature: "enhancement",
  task: "task",
};

const GENERATED_BADGE =
  "> [!NOTE]\n" +
  "> The task was generated using the MCP server — [prog-time/mcp-github-issues](https://github.com/prog-time/mcp-github-issues)";

// ─── schema ──────────────────────────────────────────────────────────────────

export const PublishInput = z.object({
  project: z.string().describe("Project name from projects.yaml"),
  title: z.string().describe("Issue title (without type prefix)"),
  context: z.string().describe("Task context and description"),
  files: z.array(z.string()).default([]).describe("Affected file paths"),
  checklist: z.array(z.string()).default([]).describe("Checklist items"),
  assignee: z
    .string()
    .optional()
    .describe("GitHub username to assign (leave empty to skip assignment)"),
  type: z
    .enum(["bug", "feature", "task"])
    .default("task")
    .describe("Issue type / label"),
});

// ─── helpers ─────────────────────────────────────────────────────────────────

export function buildTitle(rawTitle: string, type: string): string {
  return `[${type.toUpperCase()}] ${rawTitle}`;
}

export function buildBody(input: z.infer<typeof PublishInput>): string {
  const filesList =
    input.files.length > 0
      ? input.files.map((f) => `- \`${f}\``).join("\n")
      : "_No files specified_";

  const checklistItems =
    input.checklist.length > 0
      ? input.checklist.map((item) => `- [ ] ${item}`).join("\n")
      : "_No checklist items_";

  const meta = [
    `**Type**: ${input.type}`,
    input.assignee ? `**Assignee**: @${input.assignee}` : null,
  ]
    .filter(Boolean)
    .join("  \n");

  return `${GENERATED_BADGE}

${meta}

## Context

${input.context}

## Affected Files

${filesList}

## Checklist

${checklistItems}
`;
}

// ─── tool ─────────────────────────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    "publish_issue",
    "Create a new GitHub Issue with task context. Only call this after user confirmation.",
    PublishInput.shape,
    async (input) => {
      logger.info("tool called: publish_issue", {
        project: input.project,
        title: input.title,
        type: input.type,
      });

      try {
        const title = buildTitle(input.title, input.type);
        const label = LABEL_MAP[input.type];
        const labels: string[] = label ? [label] : [];
        const body = buildBody(input);

        const project = getProject(input.project);
        const octokit = getOctokit(project);

        logger.info("publish_issue: creating GitHub issue", {
          owner: project.owner,
          repo: project.repo,
          title,
          labels,
          assignee: input.assignee ?? null,
        });

        const response = await octokit.issues.create({
          owner: project.owner,
          repo: project.repo,
          title,
          body,
          labels,
          ...(input.assignee ? { assignees: [input.assignee] } : {}),
        });

        const issue = response.data;

        logger.info("publish_issue done", {
          number: issue.number,
          url: issue.html_url,
        });

        return {
          content: [
            {
              type: "text",
              text: [
                `## Issue Published`,
                ``,
                `**#${issue.number}**: [${issue.title}](${issue.html_url})`,
                `**Repository**: ${project.owner}/${project.repo}`,
                `**URL**: ${issue.html_url}`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        logger.error("publish_issue failed", { error: String(err) });
        throw err;
      }
    }
  );
}
