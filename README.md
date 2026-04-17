# mcp-github-issues

An MCP (Model Context Protocol) server that lets AI assistants manage GitHub Issues across multiple projects — without ever leaving the chat.

You describe a task in plain language and the AI publishes it as a GitHub Issue on your confirmation — no silent API calls, no intermediate files.

---

## How it works

```
AI assistant
    │
    ├─ list_issues ─────────► shows open issues in the repo
    │
    ├─ fetch_issue ─────────► reads full issue context (body + comments)
    │
    ├─ publish_issue ───────► github.com/your-org/your-repo/issues/42     (only after you confirm)
    │
    ├─ add_comment ─────────► posts a comment on an existing issue
    │
    └─ update_issue ────────► changes state, title, assignee, or labels
```

1. You describe a task to your AI assistant in plain language.
2. The AI proposes the issue content (title, context, files, checklist).
3. You confirm — the AI calls `publish_issue` and the Issue is created via the GitHub API.

---

## Requirements

- **Node.js** 18+
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- A GitHub [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

---

## Quick start

```bash
git clone https://github.com/prog-time/mcp-github-issues.git
cd mcp-github-issues

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
```

Multiple projects:

```yaml
projects:
  api:
    owner: acme-corp
    repo: backend-api
    tokenEnv: GITHUB_TOKEN_API

  web:
    owner: acme-corp
    repo: frontend
    tokenEnv: GITHUB_TOKEN_WEB

  oss:
    owner: your-username
    repo: open-source-lib
    tokenEnv: GITHUB_TOKEN_OSS
```

The config is validated with Zod on startup — missing or empty fields are reported immediately with clear error messages.

---

## Setup

### Automatic (recommended)

```bash
./mcp.sh setup
```

Registers the server as `mcp-github-issues` with user-level scope (visible in all your projects):

```
=== mcp-github-issues MCP Setup ===
  Server name : mcp-github-issues
  Scope       : user
  Dir         : /path/to/mcp-github-issues

[1/3] Installing dependencies... Done.
[2/3] Registering MCP server with Claude CLI... Registered 'mcp-github-issues' (scope: user).
[3/3] Verifying...
  mcp-github-issues: /path/to/mcp.sh - ✓ Connected

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
claude mcp add -s user -- mcp-github-issues /absolute/path/to/mcp-github-issues/mcp.sh
```

---

## MCP client configuration

### Claude Code (CLI / IDE plugins)

After running `./mcp.sh setup`, the server is registered automatically. Verify:

```bash
claude mcp list
# mcp-github-issues: /path/to/mcp.sh - ✓ Connected
```

### Claude Desktop (macOS / Windows)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcp-github-issues": {
      "command": "/absolute/path/to/mcp-github-issues/mcp.sh",
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

### `publish_issue`

Creates a new GitHub Issue directly, with structured context. Call this only after the user has reviewed and confirmed the content.

| Parameter   | Type       | Required | Description                                          |
|-------------|------------|----------|------------------------------------------------------|
| `project`   | `string`   | yes      | Project name from `projects.yaml`                    |
| `title`     | `string`   | yes      | Issue title (without type prefix)                    |
| `context`   | `string`   | yes      | Description / background                             |
| `files`     | `string[]` | no       | Affected file paths                                  |
| `checklist` | `string[]` | no       | Checklist items                                      |
| `assignee`  | `string`   | no       | GitHub username to assign                            |
| `type`      | `string`   | no       | `bug` \| `feature` \| `task` (default: `task`)       |

**What happens at publish time:**

- **Title** — prefixed with the type tag: `[BUG] Fix ...`, `[FEATURE] Add ...`, `[TASK] Refactor ...`
- **Label** — applied automatically based on type:
  - `bug` → `bug`
  - `feature` → `enhancement`
  - `task` → `task`
- **Body** — generated from `context`, `files`, and `checklist` with a "generated by MCP" badge prepended

Example body:

```markdown
> [!NOTE]
> The task was generated using the MCP server — prog-time/mcp-github-issues

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

AI:   Here's the proposed issue:
      Title: Fix login redirect loop after OAuth
      Type: bug
      Context: ...
      Files: src/auth/callback.ts
      Checklist: reproduce, check session expiry, add test
      Publish it?

You:  Yes, publish and assign to johndoe.

AI:   Issue #42 created: https://github.com/acme-corp/backend-api/issues/42

You:  Close issue #38 — it was fixed in the last release.

AI:   Issue #38 updated. State → closed.
```

---

## Project structure

```
mcp-github-issues/
├── src/
│   ├── server.ts          # MCP server entry point
│   ├── config.ts          # Loads & validates projects.yaml, Octokit cache
│   ├── router.ts          # Registers all tools
│   ├── logger.ts          # File + stderr logger
│   └── tools/
│       ├── listProjects.ts
│       ├── listIssues.ts
│       ├── fetchIssue.ts
│       ├── publish.ts
│       ├── addComment.ts
│       └── updateIssue.ts
├── tests/
│   └── src/
│       ├── config.test.ts
│       ├── router.test.ts
│       └── tools/
│           ├── fetchIssue.test.ts
│           ├── listProjects.test.ts
│           ├── listIssues.test.ts
│           ├── addComment.test.ts
│           ├── updateIssue.test.ts
│           └── publish.test.ts
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
~/Library/Logs/Claude/mcp-server-mcp-github-issues.log
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
