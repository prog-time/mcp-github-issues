# github-issues-server

An MCP (Model Context Protocol) server that lets AI assistants manage GitHub Issues across multiple projects — without ever leaving the chat.

The workflow is deliberate: the AI **drafts** a task as a local Markdown file first, you review it, then it **publishes** to GitHub on your command. No silent API calls.

---

## How it works

```
AI assistant
    │
    ├─ create_task_draft ──► tasks/<project>/2026-02-26-fix-login-bug.md  (local file, review it)
    │
    └─ publish_issue ──────► github.com/your-org/your-repo/issues/42     (only after you confirm)
```

1. You describe a task to your AI assistant in plain language.
2. The server saves a structured `.md` draft locally.
3. You review or edit the file.
4. You tell the AI to publish — it creates the GitHub Issue via the API.

---

## Requirements

- **Node.js** 18+ (or managed via [nvm](https://github.com/nvm-sh/nvm))
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- A GitHub account with a [Personal Access Token](https://github.com/settings/tokens) (`repo` scope)

---

## Quick start

```bash
git clone https://github.com/your-org/github-issues-server.git
cd github-issues-server

cp .env.example .env
# edit .env — add your GitHub token(s)

cp projects.yaml.example projects.yaml
# edit projects.yaml — add your projects

./mcp.sh setup
```

`mcp.sh setup` installs dependencies and registers the MCP server with Claude Code in one step. That's it.

---

## Configuration

### 1. GitHub tokens — `.env`

Create `.env` in the project root (it is gitignored):

```env
GITHUB_TOKEN_MYPROJECT=ghp_xxxxxxxxxxxxxxxxxxxx
```

Each project can use a separate token, which lets you work across personal and organization repositories with different permission scopes.

To generate a token: **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens** (or classic tokens with `repo` scope).

### 2. Projects — `projects.yaml`

```yaml
projects:
  myproject:
    owner: your-org          # GitHub organization or username
    repo: your-repo          # Repository name
    tokenEnv: GITHUB_TOKEN_MYPROJECT   # Which .env variable to use
    tasksDir: ./tasks/myproject        # Where draft .md files are stored
```

Multiple projects:

```yaml
projects:
  api:
    owner: acme-corp
    repo: backend-api
    tokenEnv: GITHUB_TOKEN_API
    tasksDir: ./tasks/api

  web:
    owner: acme-corp
    repo: frontend
    tokenEnv: GITHUB_TOKEN_WEB
    tasksDir: ./tasks/web

  oss:
    owner: your-username
    repo: open-source-lib
    tokenEnv: GITHUB_TOKEN_OSS
    tasksDir: ./tasks/oss
```

Task directories are created automatically when the first draft is saved.

---

## Setup

### Automatic (recommended)

```bash
./mcp.sh setup
```

By default registers the server as `project-agent` with user-level scope (visible in all your projects):

```
=== github-issues-server MCP Setup ===
  Server name : project-agent
  Scope       : user
  Dir         : /path/to/github-issues-server

[1/3] Installing dependencies... Done.
[2/3] Registering MCP server with Claude CLI... Registered 'project-agent' (scope: user).
[3/3] Verifying...
  project-agent: /path/to/mcp.sh - ✓ Connected

=== Setup complete! ===
```

Custom server name or scope:

```bash
./mcp.sh setup my-server            # custom name, user scope
./mcp.sh setup my-server local      # local scope (current project only)
./mcp.sh setup my-server project    # project scope (.mcp.json)
```

### Manual

```bash
npm install

claude mcp add -s user -- project-agent /absolute/path/to/github-issues-server/mcp.sh
```

---

## MCP client configuration

### Claude Code (CLI / IDE plugins)

After running `./mcp.sh setup`, the server is registered automatically. Verify:

```bash
claude mcp list
# project-agent: /path/to/mcp.sh - ✓ Connected
```

In PhpStorm, VS Code, or any IDE with a Claude Code plugin, type `/mcp` to see connected servers.

### Claude Desktop (macOS / Windows)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "project-agent": {
      "command": "/absolute/path/to/github-issues-server/mcp.sh",
      "env": {}
    }
  }
}
```

Tokens are loaded from `.env` by `mcp.sh` — no need to duplicate them in the Desktop config.

Restart Claude Desktop after editing the config.

---

## Available tools

### `list_projects`

Lists all projects defined in `projects.yaml`.

**No input required.**

Example response:
```
## Available Projects

- **api**: acme-corp/backend-api (tasks: ./tasks/api)
- **web**: acme-corp/frontend (tasks: ./tasks/web)
```

---

### `create_task_draft`

Creates a structured Markdown draft locally. Does **not** touch GitHub.

| Parameter   | Type       | Required | Description                          |
|-------------|------------|----------|--------------------------------------|
| `project`   | `string`   | yes      | Project name from `projects.yaml`    |
| `title`     | `string`   | yes      | Issue title                          |
| `context`   | `string`   | yes      | Description / background             |
| `files`     | `string[]` | no       | Affected file paths                  |
| `checklist` | `string[]` | no       | Checklist items                      |
| `assignee`  | `string`   | no       | GitHub username                      |
| `type`      | `string`   | no       | `bug` \| `feature` \| `task` (default: `task`) |

The draft is saved to `tasks/<project>/YYYY-MM-DD-<slug>.md`:

```markdown
# Fix login redirect loop

**Type**: bug
**Assignee**: @johndoe

## Context

After OAuth callback, users are redirected back to /login instead of the dashboard.

## Affected Files

- `src/auth/callback.ts`
- `src/middleware/session.ts`

## Checklist

- [ ] Reproduce the issue locally
- [ ] Check session token expiry logic
- [ ] Add integration test for OAuth flow
```

---

### `publish_issue`

Reads a draft `.md` file and creates a GitHub Issue. Call this only after the user has reviewed the draft.

| Parameter   | Type     | Required | Description                                           |
|-------------|----------|----------|-------------------------------------------------------|
| `project`   | `string` | yes      | Project name from `projects.yaml`                     |
| `draftFile` | `string` | yes      | Absolute path to the draft `.md` file                 |
| `assignee`  | `string` | no       | GitHub username (defaults to `owner` from `projects.yaml`) |
| `type`      | `string` | no       | Overrides the type from the draft (`bug`, `feature`, `task`) |

**What happens at publish time:**

- **Title** — prefixed with a type tag: `[BUG] Title`, `[FEATURE] Title`, `[TASK] Title`
- **Assignee** — set to `owner` from `projects.yaml` unless overridden
- **Label** — applied automatically based on type:
  - `bug` → `bug`
  - `feature` → `enhancement`
  - `task` → `task`
- **Body** — the `# Title` heading is stripped (already in the issue title), and a generated-by badge is prepended:

```
> [!NOTE]
> The task was generated using the MCP server — prog-time/github-issues-server
```

Example response:
```
## Issue Published

**#42**: [BUG] Fix login redirect loop
**Repository**: acme-corp/backend-api
**URL**: https://github.com/acme-corp/backend-api/issues/42
```

---

## Typical conversation

```
You:  In project "api", create a task: the login page has a redirect loop after OAuth.
      Affected files: src/auth/callback.ts. Add a checklist for the fix.

AI:   Draft saved to tasks/api/2026-02-26-fix-login-redirect-loop.md
      [shows full markdown]
      Review it and let me know if you'd like to publish.

You:  Looks good, publish it.

AI:   Issue #42 created: https://github.com/acme-corp/backend-api/issues/42
```

---

## Project structure

```
github-issues-server/
├── src/
│   ├── server.ts          # MCP server entry point
│   ├── config.ts          # Loads projects.yaml and resolves tokens
│   ├── router.ts          # Registers all tools
│   ├── logger.ts          # File + stderr logger
│   └── tools/
│       ├── listProjects.ts
│       ├── draft.ts
│       └── publish.ts
├── tasks/                 # Auto-created; stores draft .md files
│   └── <project>/
├── logs/
│   └── server.log         # Server log (auto-created)
├── projects.yaml          # Your project definitions
├── projects.yaml.example  # Template
├── .env                   # GitHub tokens (gitignored)
├── .env.example           # Template
├── mcp.sh                 # Server launcher + setup in one script
├── package.json
└── tsconfig.json
```

---

## Logs

The server writes logs to two places simultaneously:

| Destination         | Purpose                                             |
|---------------------|-----------------------------------------------------|
| `logs/server.log`   | Persistent file log, human-readable                 |
| `stderr`            | Captured by Claude Desktop into its `mcp-*.log`     |

To tail the log:

```bash
tail -f logs/server.log
```

Claude Desktop log location (macOS):
```
~/Library/Logs/Claude/mcp-server-project-agent.log
```

---

## Updating

When you pull new changes:

```bash
git pull
./mcp.sh setup   # re-installs deps and re-registers the server
```

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Open a pull request

To run in dev mode (with live reload):

```bash
npm run dev
```

To build:

```bash
npm run build
npm start
```

---

## License

MIT
