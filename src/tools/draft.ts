import fs from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, resolveTasksDir } from "../config.js";
import { logger } from "../logger.js";

const DraftInput = z.object({
  project: z.string().describe("Project name from projects.yaml"),
  title: z.string().describe("Task title"),
  context: z.string().describe("Task context and description"),
  files: z.array(z.string()).default([]).describe("Affected file paths"),
  checklist: z.array(z.string()).default([]).describe("Checklist items"),
  assignee: z.string().optional().describe("GitHub username to assign"),
  type: z
    .enum(["bug", "feature", "task"])
    .default("task")
    .describe("Issue type"),
});

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function buildMarkdown(input: z.infer<typeof DraftInput>): string {
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

  return `# ${input.title}

${meta}

## Context

${input.context}

## Affected Files

${filesList}

## Checklist

${checklistItems}
`;
}

export function register(server: McpServer): void {
  server.tool(
    "create_task_draft",
    "Create a task draft as a local .md file without publishing to GitHub",
    {
      project: z.string().describe("Project name from projects.yaml"),
      title: z.string().describe("Task title"),
      context: z.string().describe("Task context and description"),
      files: z.array(z.string()).default([]).describe("Affected file paths"),
      checklist: z.array(z.string()).default([]).describe("Checklist items"),
      assignee: z.string().optional().describe("GitHub username to assign"),
      type: z
        .enum(["bug", "feature", "task"])
        .default("task")
        .describe("Issue type"),
    },
    async (input) => {
      logger.info("tool called: create_task_draft", {
        project: input.project,
        title: input.title,
        type: input.type,
      });

      try {
        const parsed = DraftInput.parse(input);
        const project = getProject(parsed.project);
        const tasksDir = resolveTasksDir(project);

        fs.mkdirSync(tasksDir, { recursive: true });

        const date = new Date().toISOString().slice(0, 10);
        const slug = slugify(parsed.title);
        const filename = `${date}-${slug}.md`;
        const filePath = path.join(tasksDir, filename);

        const markdown = buildMarkdown(parsed);
        fs.writeFileSync(filePath, markdown, "utf-8");

        logger.info("create_task_draft done", { filePath });

        return {
          content: [
            {
              type: "text",
              text: [
                `## Draft Created`,
                ``,
                `**File**: \`${filePath}\``,
                ``,
                `---`,
                ``,
                markdown,
                `---`,
                ``,
                `> Draft saved. Use \`publish_issue\` with \`draftFile: "${filePath}"\` to publish it to GitHub.`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        logger.error("create_task_draft failed", { error: String(err) });
        throw err;
      }
    }
  );
}
