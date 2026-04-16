# mcp-github-issues — Multi-project MCP Server

## Project Overview

A multi-project MCP (Model Context Protocol) server written in **Node.js + TypeScript** for managing tasks and GitHub Issues across multiple projects. Version: **1.1.0**.

## Tech Stack

- **Runtime**: Node.js + TypeScript (`tsx` for dev, `tsc` for build)
- **MCP SDK**: `@modelcontextprotocol/sdk` — use `StdioServerTransport`
- **GitHub API**: `@octokit/rest`
- **Validation**: `zod`
- **Config**: `js-yaml` for `projects.yaml`, `dotenv` for `.env`
- **Testing**: `vitest`
- **Logging**: custom `logger.ts` — writes to `logs/server.log` + stderr

## Project Structure

```
mcp-github-issues/
├── src/
│   ├── server.ts          # MCP server entry point
│   ├── config.ts          # Load & validate projects.yaml + env tokens
│   ├── logger.ts          # File + stderr logging
│   ├── router.ts          # Register all tools on the server
│   └── tools/
│       ├── listProjects.ts
│       ├── draft.ts
│       ├── listDrafts.ts
│       ├── publish.ts
│       ├── listIssues.ts
│       ├── fetchIssue.ts
│       ├── addComment.ts
│       └── updateIssue.ts
├── tests/                 # Vitest unit tests
├── tasks/                 # Draft .md files (per project, gitignored)
├── logs/                  # Server logs (gitignored)
├── projects.yaml          # Project config (gitignored, use projects.yaml.example)
├── .env                   # GitHub tokens (gitignored)
├── .env.example
├── mcp.sh                 # Setup & launch script
├── package.json
└── tsconfig.json
```

## projects.yaml Format

```yaml
projects:
  myproject:
    owner: myorg
    repo: backend
    tokenEnv: GITHUB_TOKEN
    tasksDir: ./tasks/myproject
```

## MCP Server Setup (server.ts)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "mcp-github-issues", version: "1.1.0" });
// register tools via router
await server.connect(new StdioServerTransport());
```

## Tools (8 total)

### 1. `list_projects`
- No input.
- Returns list of project names from `projects.yaml`.

### 2. `create_task_draft`
- Input: `project`, `title`, `context`, `files` (string[]), `checklist` (string[]), `assignee` (optional), `type` (optional: bug|feature|task)
- Creates a `.md` file in `tasks/<project>/` with a timestamp slug.
- Returns the markdown content and the file path.
- Does **not** publish to GitHub.

### 3. `list_drafts`
- Input: `project`
- Returns list of unpublished `.md` draft files for the project.

### 4. `publish_issue`
- Input: `project`, `draftFile` (absolute path to existing `.md`), `assignee` (optional), `type` (optional)
- Reads the draft `.md` file.
- Creates a GitHub Issue via Octokit (`issues.create`).
- Title is prefixed with type tag: `[FEATURE] Title`, `[BUG] Title`, `[TASK] Title`.
- Returns the issue URL.

### 5. `list_issues`
- Input: `project`, `state` (open|closed|all, default: open), `label` (optional), `assignee` (optional), `limit` (1-100, default: 30)
- Returns filtered list of GitHub Issues from the repository.

### 6. `fetch_issue`
- Input: `project`, `issue` (number or full URL), `include_comments` (default: true), `comment_limit` (default: 50)
- Returns full issue context: description, metadata, comments.

### 7. `add_comment`
- Input: `project`, `issue` (number or full URL), `body`
- Posts a comment on an existing GitHub Issue.

### 8. `update_issue`
- Input: `project`, `issue`, `state` (optional), `title` (optional), `assignee` (optional, null to remove), `add_labels` (optional), `remove_labels` (optional)
- Updates state, title, assignee, or labels of an existing Issue.

## Task Markdown Template

```md
# Title

**Type**: feature

## Context
<context>

## Affected Files
<files as bullet list>

## Checklist
<checklist as - [ ] items>
```

## Implementation Rules

- Load config once at startup in `config.ts`; export `getProject(name)`, `getToken(project)`, `getOctokit(project)`, `resolveTasksDir(project)` helpers.
- Each tool file exports a single `register(server)` function.
- `router.ts` calls all `register()` functions.
- Use `zod` schemas for all tool input validation.
- Tokens are read from `process.env[project.tokenEnv]` at call time, not at startup.
- `tasks/<project>/` directories must be created if they don't exist (`fs.mkdirSync(..., { recursive: true })`).
- Draft filenames: `YYYY-MM-DD-<slug>.md` where slug is the title lowercased and hyphenated.

## Run

```bash
npm install
cp .env.example .env   # add your GitHub token(s)
cp projects.yaml.example projects.yaml   # add your projects
./mcp.sh setup         # installs deps + registers with Claude Code
```

Or manually:
```bash
npx tsx src/server.ts
```

## Tests

```bash
npm test              # single run
npm run test:watch    # watch mode
```

All tests use `vi.hoisted()` for mock variables used inside `vi.mock()` factories.
Mock paths in `tests/src/tools/` use `../../../src/` (three levels up).

## Claude Code MCP Config (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "project-agent": {
      "command": "/absolute/path/to/mcp-github-issues/mcp.sh",
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```
