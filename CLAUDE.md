# github-issues-server — Multi-project MCP Server

## Project Overview

A multi-project MCP (Model Context Protocol) server written in **Node.js + TypeScript** for managing tasks and GitHub Issues across multiple projects.

## Tech Stack

- **Runtime**: Node.js + TypeScript (`tsx` for dev, `tsc` for build)
- **MCP SDK**: `@modelcontextprotocol/sdk` — use `StdioServerTransport`
- **GitHub API**: `@octokit/rest`
- **Validation**: `zod`
- **Config**: `js-yaml` for `projects.yaml`, `dotenv` for `.env`

## Project Structure

```
github-issues-server/
├── src/
│   ├── server.ts          # MCP server entry point
│   ├── config.ts          # Load & validate projects.yaml + env tokens
│   ├── router.ts          # Register all tools on the server
│   └── tools/
│       ├── listProjects.ts
│       ├── draft.ts
│       └── publish.ts
├── tasks/
│   ├── api/               # Draft .md files for project "api"
│   └── web/               # Draft .md files for project "web"
├── projects.yaml
├── .env                   # GitHub tokens (gitignored)
├── .env.example
├── package.json
└── tsconfig.json
```

## projects.yaml Format

```yaml
projects:
  api:
    owner: myorg
    repo: backend
    tokenEnv: GITHUB_TOKEN_API
    tasksDir: ./tasks/api
  web:
    owner: myorg
    repo: frontend
    tokenEnv: GITHUB_TOKEN_WEB
    tasksDir: ./tasks/web
```

## MCP Server Setup (server.ts)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "github-issues-server", version: "1.0.0" });
// register tools via router
await server.connect(new StdioServerTransport());
```

## Tools

### 1. `list_projects`
- No input.
- Returns list of project names from `projects.yaml`.

### 2. `create_task_draft`
- Input: `project`, `title`, `context`, `files` (string[]), `checklist` (string[]), `assignee` (optional), `type` (optional: bug|feature|task)
- Creates a `.md` file in `tasks/<project>/` with a timestamp slug.
- Returns the markdown content and the file path.
- Does **not** publish to GitHub.

### 3. `publish_issue`
- Input: `project`, `draftFile` (path to existing `.md`), `assignee` (optional), `type` (optional)
- Reads the draft `.md` file.
- Creates a GitHub Issue via Octokit (`issues.create`).
- Returns the issue URL.

## Task Markdown Template

```md
## Context
<context>

## Affected Files
<files as bullet list>

## Checklist
<checklist as - [ ] items>
```

## Implementation Rules

- Load config once at startup in `config.ts`; export a `getProject(name)` helper.
- Each tool file exports a single `register(server, config)` function.
- `router.ts` calls all `register()` functions.
- Use `zod` schemas for all tool input validation.
- Tokens are read from `process.env[project.tokenEnv]` at call time, not at startup.
- `tasks/<project>/` directories must be created if they don't exist (`fs.mkdirSync(..., { recursive: true })`).
- Draft filenames: `YYYY-MM-DD-<slug>.md` where slug is the title lowercased and hyphenated.

## Run

```bash
npm install
npx tsx src/server.ts
```

## Claude.ai MCP Config (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "github-issues-server": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/github-issues-server/src/server.ts"],
      "env": {
        "GITHUB_TOKEN_API": "ghp_...",
        "GITHUB_TOKEN_WEB": "ghp_..."
      }
    }
  }
}
```
