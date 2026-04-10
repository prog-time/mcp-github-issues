import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, getOctokit } from "../config.js";
import { logger } from "../logger.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Accepts either a plain issue number (e.g. 123 or "123") or a full GitHub
 * issue URL (e.g. https://github.com/owner/repo/issues/123) and returns the
 * numeric issue number.
 */
export function parseIssueNumber(raw: string): number {
  const trimmed = raw.trim();

  // Full URL: https://github.com/owner/repo/issues/123
  const urlMatch = trimmed.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
  if (urlMatch) return parseInt(urlMatch[1], 10);

  // Plain number or numeric string
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0) return num;

  throw new Error(
    `Cannot parse issue identifier: "${raw}". ` +
      `Provide a number (e.g. 123) or a GitHub issue URL.`
  );
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

// ─── tool ─────────────────────────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    "fetch_issue",
    "Fetch a GitHub Issue by number or URL and return its full context to start working on it.",
    {
      project: z.string().describe("Project name from projects.yaml"),
      issue: z
        .string()
        .describe(
          "Issue number (e.g. 123) or full GitHub issue URL (e.g. https://github.com/owner/repo/issues/123)"
        ),
      include_comments: z
        .boolean()
        .default(true)
        .describe("Whether to include issue comments (default: true)"),
      comment_limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max number of comments to fetch (default: 50, max: 100)"),
    },
    async (input) => {
      logger.info("tool called: fetch_issue", {
        project: input.project,
        issue: input.issue,
      });

      try {
        const project = getProject(input.project);
        const issueNumber = parseIssueNumber(input.issue);
        const octokit = getOctokit(project);

        logger.info("fetch_issue: requesting GitHub issue", {
          owner: project.owner,
          repo: project.repo,
          issue_number: issueNumber,
        });

        // Fetch issue and comments in parallel
        const [issueRes, commentsRes] = await Promise.all([
          octokit.issues.get({
            owner: project.owner,
            repo: project.repo,
            issue_number: issueNumber,
          }),
          input.include_comments
            ? octokit.issues.listComments({
                owner: project.owner,
                repo: project.repo,
                issue_number: issueNumber,
                per_page: input.comment_limit,
              })
            : Promise.resolve({ data: [] }),
        ]);

        const issue = issueRes.data;
        const comments = commentsRes.data;

        logger.info("fetch_issue done", {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          comments: comments.length,
        });

        // ─── build output markdown ───────────────────────────────────────────

        const labels =
          issue.labels.length > 0
            ? issue.labels
                .map((l) => (typeof l === "string" ? l : l.name ?? ""))
                .filter(Boolean)
                .map((l) => `\`${l}\``)
                .join(", ")
            : "_none_";

        const assignees =
          issue.assignees && issue.assignees.length > 0
            ? issue.assignees.map((a) => `@${a.login}`).join(", ")
            : "_unassigned_";

        const stateEmoji = issue.state === "open" ? "🟢 open" : "🔴 closed";

        const lines: string[] = [
          `## Issue #${issue.number}: ${issue.title}`,
          ``,
          `| Field | Value |`,
          `|---|---|`,
          `| **Repository** | ${project.owner}/${project.repo} |`,
          `| **State** | ${stateEmoji} |`,
          `| **Labels** | ${labels} |`,
          `| **Assignees** | ${assignees} |`,
          `| **Created** | ${formatDate(issue.created_at)} |`,
          `| **Updated** | ${formatDate(issue.updated_at)} |`,
          `| **URL** | ${issue.html_url} |`,
          ``,
          `### Description`,
          ``,
          issue.body?.trim() || "_No description provided._",
        ];

        if (comments.length > 0) {
          lines.push(``, `### Comments (${comments.length})`);
          for (const comment of comments) {
            lines.push(
              ``,
              `---`,
              ``,
              `**@${comment.user?.login ?? "unknown"}** — ${formatDate(comment.created_at)}`,
              ``,
              comment.body?.trim() || "_empty comment_"
            );
          }
        }

        lines.push(
          ``,
          `---`,
          ``,
          `> **Ready to work.** Use the issue context above to start implementing the task.`
        );

        return {
          content: [
            {
              type: "text",
              text: lines.join("\n"),
            },
          ],
        };
      } catch (err) {
        logger.error("fetch_issue failed", { error: String(err) });
        throw err;
      }
    }
  );
}
