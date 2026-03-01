import fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { getProject, getToken } from "../config.js";
import { logger } from "../logger.js";

// ─── mappings ────────────────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  bug: "bug",
  feature: "enhancement",
  task: "task",
};

const TYPE_TAG: Record<string, string> = {
  bug: "BUG",
  feature: "FEATURE",
  task: "TASK",
};

const GENERATED_BADGE =
  "> [!NOTE]\n" +
  "> The task was generated using the MCP server — [prog-time/github-issues-server](https://github.com/prog-time/github-issues-server)";

// ─── markdown helpers ─────────────────────────────────────────────────────────

/** Extract raw title from the first `# Heading` line. */
export function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

/** Extract type from `**Type**: bug` meta line written by create_task_draft. */
export function extractType(markdown: string): string | null {
  const match = markdown.match(/^\*\*Type\*\*:\s*(\w+)\s*$/m);
  return match ? match[1].toLowerCase() : null;
}

/** Remove the first `# Heading` line (and trailing blank lines after it). */
export function stripTitle(markdown: string): string {
  return markdown.replace(/^#[^\n]*\n+/, "").trimStart();
}

/** Build the final GitHub issue body. */
export function buildBody(markdown: string): string {
  const body = stripTitle(markdown);
  return `${GENERATED_BADGE}\n\n${body}`;
}

// ─── tool ─────────────────────────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    "publish_issue",
    "Publish a draft .md file as a GitHub Issue. Only call this after user confirmation.",
    {
      project: z.string().describe("Project name from projects.yaml"),
      draftFile: z.string().describe("Absolute path to the draft .md file"),
      assignee: z
        .string()
        .optional()
        .describe("GitHub username to assign (overrides project owner)"),
      type: z
        .enum(["bug", "feature", "task"])
        .optional()
        .describe("Issue type / label (overrides value in draft)"),
    },
    async (input) => {
      logger.info("tool called: publish_issue", {
        project: input.project,
        draftFile: input.draftFile,
      });

      try {
        if (!fs.existsSync(input.draftFile)) {
          throw new Error(`Draft file not found: ${input.draftFile}`);
        }

        const markdown = fs.readFileSync(input.draftFile, "utf-8");

        // Resolve type: explicit override → parsed from draft → fallback "task"
        const type = input.type ?? extractType(markdown) ?? "task";
        const tag = TYPE_TAG[type] ?? "TASK";

        // Title: [TAG] Raw title
        const rawTitle = extractTitle(markdown);
        const title = `[${tag}] ${rawTitle}`;

        // Assignee: explicit override → project owner
        const project = getProject(input.project);
        const assignee = input.assignee ?? project.owner;

        // Labels: always set based on resolved type
        const label = LABEL_MAP[type];
        const labels: string[] = label ? [label] : [];

        // Body: badge + draft body without the # Title line
        const body = buildBody(markdown);

        const token = getToken(project);
        const octokit = new Octokit({ auth: token });

        logger.info("publish_issue: creating GitHub issue", {
          owner: project.owner,
          repo: project.repo,
          title,
          labels,
          assignee,
        });

        const response = await octokit.issues.create({
          owner: project.owner,
          repo: project.repo,
          title,
          body,
          labels,
          assignees: [assignee],
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
