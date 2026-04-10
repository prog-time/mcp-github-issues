import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, getOctokit } from "../config.js";
import { logger } from "../logger.js";
import { parseIssueNumber } from "./fetchIssue.js";

export function register(server: McpServer): void {
  server.tool(
    "add_comment",
    "Add a comment to a GitHub Issue",
    {
      project: z.string().describe("Project name from projects.yaml"),
      issue: z
        .string()
        .describe("Issue number (e.g. 123) or full GitHub issue URL"),
      body: z.string().min(1).describe("Comment text (Markdown supported)"),
    },
    async (input) => {
      logger.info("tool called: add_comment", {
        project: input.project,
        issue: input.issue,
      });

      try {
        const project = getProject(input.project);
        const issueNumber = parseIssueNumber(input.issue);
        const octokit = getOctokit(project);

        const response = await octokit.issues.createComment({
          owner: project.owner,
          repo: project.repo,
          issue_number: issueNumber,
          body: input.body,
        });

        logger.info("add_comment done", { url: response.data.html_url });

        return {
          content: [
            {
              type: "text",
              text: [
                `## Comment Added`,
                ``,
                `**Issue**: #${issueNumber}`,
                `**URL**: ${response.data.html_url}`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        logger.error("add_comment failed", { error: String(err) });
        throw err;
      }
    }
  );
}
