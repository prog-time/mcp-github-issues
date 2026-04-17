import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, getOctokit } from "../config.js";
import { logger } from "../logger.js";

// ─── schema ──────────────────────────────────────────────────────────────────

export const CreatePullRequestInput = z.object({
  project: z.string().describe("Project name from projects.yaml"),
  title: z.string().describe("Pull request title"),
  head: z
    .string()
    .describe(
      "Name of the branch where changes are implemented (e.g. 'feature/my-feature' or 'fork-owner:branch')"
    ),
  base: z
    .string()
    .default("main")
    .describe("Name of the branch to merge changes into (default: 'main')"),
  body: z
    .string()
    .optional()
    .describe("Pull request description (raw markdown, optional)"),
  draft: z
    .boolean()
    .default(false)
    .describe("Whether to create the pull request as a draft"),
  maintainer_can_modify: z
    .boolean()
    .optional()
    .describe(
      "Whether maintainers can modify the pull request (only applies to cross-repo PRs)"
    ),
});

// ─── tool ────────────────────────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    "create_pull_request",
    "Create a new GitHub Pull Request for a configured project.",
    CreatePullRequestInput.shape,
    async (input) => {
      logger.info("tool called: create_pull_request", {
        project: input.project,
        title: input.title,
        head: input.head,
        base: input.base,
        draft: input.draft,
      });

      try {
        const project = getProject(input.project);
        const octokit = getOctokit(project);

        logger.info("create_pull_request: creating GitHub pull request", {
          owner: project.owner,
          repo: project.repo,
          title: input.title,
          head: input.head,
          base: input.base,
          draft: input.draft,
        });

        const response = await octokit.pulls.create({
          owner: project.owner,
          repo: project.repo,
          title: input.title,
          head: input.head,
          base: input.base,
          ...(input.body !== undefined ? { body: input.body } : {}),
          draft: input.draft,
          ...(input.maintainer_can_modify !== undefined
            ? { maintainer_can_modify: input.maintainer_can_modify }
            : {}),
        });

        const pr = response.data;

        logger.info("create_pull_request done", {
          number: pr.number,
          url: pr.html_url,
          draft: pr.draft,
        });

        return {
          content: [
            {
              type: "text",
              text: [
                `## Pull Request Created`,
                ``,
                `**#${pr.number}**: [${pr.title}](${pr.html_url})`,
                `**Repository**: ${project.owner}/${project.repo}`,
                `**Head → Base**: \`${input.head}\` → \`${input.base}\``,
                `**Draft**: ${pr.draft ? "yes" : "no"}`,
                `**URL**: ${pr.html_url}`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        logger.error("create_pull_request failed", { error: String(err) });
        throw err;
      }
    }
  );
}
