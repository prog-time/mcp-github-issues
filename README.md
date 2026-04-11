# github-issues-server

An MCP (Model Context Protocol) server that lets AI assistants manage GitHub Issues across multiple projects — without ever leaving the chat.

The workflow is deliberate: the AI **drafts** a task as a local Markdown file first, you review it, then it **publishes** to GitHub on your command. No silent API calls.

---

## How it works

```
AI assistant
    │
    ├─ list_issues ─────────► shows open issues in the repo
    │
    ├─ fetch_issue ─────────► reads full issue context (body + comments)
    │
    ├─ create_task_draft ───► tasks/<project>/2026-04-11-fix-login-bug.md  (local, review it)
    │
    ├─ list_drafts ─────────► shows all unpublished local drafts
    │
    ├─ publish_issue ───────► github.com/your-org/your-repo/issues/42     (only after you confirm)
    │
    ├─ add_comment ─────────► posts a comment on an existing issue
    │
    └─ update_issue ────────► changes state, title, assignee, or labels
```

1. You describe a task to your AI assistant in plain language.
2. The server saves a structured `.md` draft locally.
3. You review or edit the file.
4. You tell the AI to publish — it creates the GitHub Issue via the API.

---

## Requirements

- **Node.js** 18+
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- A GitHub [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

---

## Quick start

```bash
git clone https://github.com/prog-time/github-issues-server.git
cd github-issues-server

cp .env.example .env
# edit .env — add your GitHub token(s)

cp projects.yaml.example projects.yaml
# edit projects.yaml — add your projects

./mcp.sh setup
```

`mcp.sh setup` installs dependencies and registers the MCP server with Claude Code in one step.

---

## Configuration

### 1. GitHub tokens — `.env`

Create `.env` in the project root (gitignored):

```env
GITHUB_TOKEN_MYPROJECT=ghp_xxxxxxxxxxxxxxxxxxxx
```

Each project can use a separate token, allowing different permission scopes across personal and organization repositories.

To generate a token: **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens** (or classic with `repo` scope).

### 2. Projects — `projects.yaml`

```yaml
projects:
  myproject:
    owner: your-org          # GitHub organization or username
    repo: your-repo          # Repository name
    tokenEnv: GITHUB_TOKEN_MYPROJECT   # Must match a key in .env
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

The config is validated with Zod on startup — missing or empty fields are reported immediately with clear error messages.

Task directories are created automatically when the first draft is saved.

---

## Setup

### Automatic (recommended)

```bash
./mcp.sh setup
```

Registers the server as `project-agent` with user-level scope (visible in all your projects):

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

Tokens are loaded from `.env` by `mcp.sh` — no need to duplicate them in the Desktop config. Restart Claude Desktop after editing the config.

---

## Available tools

### `list_projects`

Lists all projects defined in `projects.yaml`.

**No input required.**

---

### `list_issues`

Lists GitHub Issues for a project with optional filters.

| Parameter  | Type     | Required | Description                                         |
|------------|----------|----------|-----------------------------------------------------|
| `project`  | `string` | yes      | Project name from `projects.yaml`                   |
| `state`    | `string` | no       | `open` \| `closed` \| `all` (default: `open`)       |
| `label`    | `string` | no       | Filter by label name                                |
| `assignee` | `string` | no       | Filter by assignee username                         |
| `limit`    | `number` | no       | Max results to return, 1–100 (default: `30`)         |

---

### `fetch_issue`

Fetches a GitHub Issue by number or URL and returns its full context (description, labels, assignees, comments).

| Parameter          | Type      | Required | Description                                           |
|--------------------|-----------|----------|-------------------------------------------------------|
| `project`          | `string`  | yes      | Project name from `projects.yaml`                     |
| `issue`            | `string`  | yes      | Issue number (e.g. `123`) or full GitHub issue URL    |
| `include_comments` | `boolean` | no       | Whether to fetch comments (default: `true`)           |
| `comment_limit`    | `number`  | no       | Max comments to fetch, 1–100 (default: `50`)          |

---

### `create_task_draft`

Creates a structured Markdown draft locally. Does **not** touch GitHub.

| Parameter   | Type       | Required | Description                                          |
|-------------|------------|----------|------------------------------------------------------|
| `project`   | `string`   | yes      | Project name from `projects.yaml`                    |
| `title`     | `string`   | yes      | Issue title                                          |
| `context`   | `string`   | yes      | Description / background                             |
| `files`     | `string[]` | no       | Affected file paths                                  |
| `checklist` | `string[]` | no       | Checklist items                                      |
| `assignee`  | `string`   | no       | GitHub username to assign                            |
| `type`      | `string`   | no       | `bug` \| `feature` \| `task` (default: `task`)       |

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

### `list_drafts`

Lists all unpublished local draft files for a project, with their titles and paths.

| Parameter | Type     | Required | Description                       |
|-----------|----------|----------|-----------------------------------|
| `project` | `string` | yes      | Project name from `projects.yaml` |

---

### `publish_issue`

Reads a draft `.md` file and creates a GitHub Issue. Call this only after the user has reviewed the draft.

| Parameter   | Type     | Required | Description                                           |
|-------------|----------|----------|-------------------------------------------------------|
| `project`   | `string` | yes      | Project name from `projects.yaml`                     |
| `draftFile` | `string` | yes      | Absolute path to the draft `.md` file                 |
| `assignee`  | `string` | no       | GitHub username to assign (optional)                  |
| `type`      | `string` | no       | Overrides the type from the draft (`bug`, `feature`, `task`) |

**What happens at publish time:**

- **Title** — taken from the `# Heading` line of the draft as-is
- **Label** — applied automatically based on type:
  - `bug` → `bug`
  - `feature` → `enhancement`
  - `task` → `task`
- **Body** — the `# Title` heading is stripped (already in the issue title field), and a generated-by badge is prepended

---

### `add_comment`

Adds a comment to an existing GitHub Issue.

| Parameter | Type     | Required | Description                                        |
|-----------|----------|----------|----------------------------------------------------|
| `project` | `string` | yes      | Project name from `projects.yaml`                  |
| `issue`   | `string` | yes      | Issue number (e.g. `123`) or full GitHub issue URL |
| `body`    | `string` | yes      | Comment text (Markdown supported)                  |

---

### `update_issue`

Updates an existing GitHub Issue: change state, title, assignee, or labels.

| Parameter       | Type       | Required | Description                                            |
|-----------------|------------|----------|--------------------------------------------------------|
| `project`       | `string`   | yes      | Project name from `projects.yaml`                      |
| `issue`         | `string`   | yes      | Issue number or full GitHub issue URL                  |
| `state`         | `string`   | no       | `open` \| `closed`                                     |
| `title`         | `string`   | no       | New title                                              |
| `assignee`      | `string\|null` | no   | Set assignee username, or `null` to remove all         |
| `add_labels`    | `string[]` | no       | Labels to add                                          |
| `remove_labels` | `string[]` | no       | Labels to remove                                       |

---

## Typical conversation

```
You:  In project "api", create a task: the login page has a redirect loop after OAuth.
      Affected files: src/auth/callback.ts. Add a checklist for the fix.

AI:   Draft saved to tasks/api/2026-04-11-fix-login-redirect-loop.md
      [shows full markdown]
      Review it and let me know if you'd like to publish.

You:  Looks good, publish it and assign to johndoe.

AI:   Issue #42 created: https://github.com/acme-corp/backend-api/issues/42

You:  Close issue #38 — it was fixed in the last release.

AI:   Issue #38 updated. State → closed.
```

---

## Project structure

```
github-issues-server/
├── src/
│   ├── server.ts          # MCP server entry point
│   ├── config.ts          # Loads & validates projects.yaml, Octokit cache
│   ├── router.ts          # Registers all tools
│   ├── logger.ts          # File + stderr logger
│   └── tools/
│       ├── listProjects.ts
│       ├── listIssues.ts
│       ├── fetchIssue.ts
│       ├── draft.ts
│       ├── listDrafts.ts
│       ├── publish.ts
│       ├── addComment.ts
│       └── updateIssue.ts
├── tests/
│   └── src/
│       ├── config.test.ts
│       ├── router.test.ts
│       └── tools/
│           ├── draft.test.ts
│           ├── fetchIssue.test.ts
│           ├── listProjects.test.ts
│           ├── listIssues.test.ts
│           ├── listDrafts.test.ts
│           ├── addComment.test.ts
│           ├── updateIssue.test.ts
│           └── publish.test.ts
├── tasks/                 # Auto-created; stores draft .md files
│   └── <project>/
├── logs/
│   └── server.log         # Server log (auto-created)
├── projects.yaml          # Your project definitions
├── projects.yaml.example  # Template
├── .env                   # GitHub tokens (gitignored)
├── .env.example           # Template
├── mcp.sh                 # Server launcher + setup script
├── vitest.config.ts
├── package.json
└── tsconfig.json
```

---

## Logs

The server writes logs to two places simultaneously:

| Destination       | Purpose                                         |
|-------------------|-------------------------------------------------|
| `logs/server.log` | Persistent file log, human-readable             |
| `stderr`          | Captured by Claude Desktop into its `mcp-*.log` |

```bash
tail -f logs/server.log
```

Claude Desktop log location (macOS):
```
~/Library/Logs/Claude/mcp-server-project-agent.log
```

---

## Updating

```bash
git pull
./mcp.sh setup   # re-installs deps and re-registers the server
```

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Open a pull request

```bash
npm run dev          # dev mode (tsx watch)
npm test             # run tests once
npm run test:watch   # watch mode
npx tsc --noEmit     # type check
npx eslint .         # lint
npm run build        # compile to dist/
```

CI runs ESLint, type-check, and the full test suite on every push and pull request against `main`.

---

## License

MIT
