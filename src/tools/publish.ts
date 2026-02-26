import fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { getProject, getToken } from "../config.js";
import { logger } from "../logger.js";

const LABEL_MAP: Record<string, string> = {
  bug: "bug",
  feature: "enhancement",
  task: "task",
};

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

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
        .describe("GitHub username to assign (overrides draft)"),
      type: z
        .enum(["bug", "feature", "task"])
        .optional()
        .describe("Issue type / label (overrides draft)"),
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
        const title = extractTitle(markdown);

        const project = getProject(input.project);
        const token = getToken(project);

        const octokit = new Octokit({ auth: token });

        const labels: string[] = [];
        if (input.type && LABEL_MAP[input.type]) {
          labels.push(LABEL_MAP[input.type]);
        }

        const issueParams: Parameters<typeof octokit.issues.create>[0] = {
          owner: project.owner,
          repo: project.repo,
          title,
          body: markdown,
          labels,
        };

        if (input.assignee) {
          issueParams.assignees = [input.assignee];
        }

        logger.info("publish_issue: creating GitHub issue", {
          owner: project.owner,
          repo: project.repo,
          title,
          labels,
        });

        const response = await octokit.issues.create(issueParams);
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
