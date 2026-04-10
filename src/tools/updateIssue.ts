import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, getOctokit } from "../config.js";
import { logger } from "../logger.js";
import { parseIssueNumber } from "./fetchIssue.js";

export function register(server: McpServer): void {
  server.tool(
    "update_issue",
    "Update a GitHub Issue: change state (open/closed), title, assignee, or labels",
    {
      project: z.string().describe("Project name from projects.yaml"),
      issue: z
        .string()
        .describe("Issue number (e.g. 123) or full GitHub issue URL"),
      state: z
        .enum(["open", "closed"])
        .optional()
        .describe("New state: 'open' or 'closed'"),
      title: z.string().optional().describe("New title"),
      assignee: z
        .string()
        .nullable()
        .optional()
        .describe("Set assignee username, or null to remove all assignees"),
      add_labels: z
        .array(z.string())
        .optional()
        .describe("Labels to add to the issue"),
      remove_labels: z
        .array(z.string())
        .optional()
        .describe("Labels to remove from the issue"),
    },
    async (input) => {
      logger.info("tool called: update_issue", {
        project: input.project,
        issue: input.issue,
      });

      try {
        const project = getProject(input.project);
        const issueNumber = parseIssueNumber(input.issue);
        const octokit = getOctokit(project);

        const response = await octokit.issues.update({
          owner: project.owner,
          repo: project.repo,
          issue_number: issueNumber,
          ...(input.state !== undefined && { state: input.state }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.assignee !== undefined && {
            assignees: input.assignee ? [input.assignee] : [],
          }),
        });

        // Handle label changes via separate API calls (add/remove individually)
        if (input.add_labels?.length) {
          await octokit.issues.addLabels({
            owner: project.owner,
            repo: project.repo,
            issue_number: issueNumber,
            labels: input.add_labels,
          });
        }
        if (input.remove_labels?.length) {
          await Promise.all(
            input.remove_labels.map((label) =>
              octokit.issues.removeLabel({
                owner: project.owner,
                repo: project.repo,
                issue_number: issueNumber,
                name: label,
              })
            )
          );
        }

        logger.info("update_issue done", {
          number: issueNumber,
          state: response.data.state,
        });

        const changes: string[] = [];
        if (input.state !== undefined) changes.push(`State → **${input.state}**`);
        if (input.title !== undefined) changes.push(`Title → **${input.title}**`);
        if (input.assignee !== undefined)
          changes.push(
            `Assignee → ${input.assignee ? `@${input.assignee}` : "_removed_"}`
          );
        if (input.add_labels?.length)
          changes.push(
            `Labels added: ${input.add_labels.map((l) => `\`${l}\``).join(", ")}`
          );
        if (input.remove_labels?.length)
          changes.push(
            `Labels removed: ${input.remove_labels.map((l) => `\`${l}\``).join(", ")}`
          );

        return {
          content: [
            {
              type: "text",
              text: [
                `## Issue #${issueNumber} Updated`,
                ``,
                `**URL**: ${response.data.html_url}`,
                ``,
                ...changes,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        logger.error("update_issue failed", { error: String(err) });
        throw err;
      }
    }
  );
}
