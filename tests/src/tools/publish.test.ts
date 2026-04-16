import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(""),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  },
}));

vi.mock("../../../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    logFile: "/dev/null",
  },
}));

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("../../../src/config.js", () => ({
  getProject: vi.fn().mockReturnValue({
    owner: "myorg",
    repo: "myrepo",
    tokenEnv: "GITHUB_TOKEN_API",
    tasksDir: "./tasks/api",
  }),
  getToken: vi.fn().mockReturnValue("ghp_testtoken"),
  resolveTasksDir: vi.fn().mockReturnValue("/abs/tasks/api"),
  getOctokit: vi.fn().mockReturnValue({
    issues: { create: mockCreate },
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import fs from "fs";
import {
  extractTitle,
  extractType,
  stripTitle,
  buildBody,
  register,
} from "../../../src/tools/publish.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

type Handler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

function createMockServer() {
  const handlers: Record<string, Handler> = {};
  const server = {
    tool: vi.fn(
      (name: string, _desc: string, _schema: unknown, handler: Handler) => {
        handlers[name] = handler;
      }
    ),
  } as unknown as McpServer;
  return { server, handlers };
}

const SAMPLE_DRAFT = `# My Task Title

**Type**: feature

## Context

Some context here.

## Affected Files

- \`src/app.ts\`

## Checklist

- [ ] Write tests
`;

// ─── extractTitle ─────────────────────────────────────────────────────────────

describe("extractTitle", () => {
  it("extracts the first heading", () => {
    expect(extractTitle("# Hello World\n\nBody")).toBe("Hello World");
  });

  it("trims whitespace from the title", () => {
    expect(extractTitle("#   Spaces   \n\nBody")).toBe("Spaces");
  });

  it("returns 'Untitled' when no heading exists", () => {
    expect(extractTitle("No heading here")).toBe("Untitled");
  });

  it("handles multiline documents", () => {
    expect(extractTitle("Some text\n# Title\nMore text")).toBe("Title");
  });
});

// ─── extractType ─────────────────────────────────────────────────────────────

describe("extractType", () => {
  it("extracts 'bug' type", () => {
    expect(extractType("**Type**: bug")).toBe("bug");
  });

  it("extracts 'feature' type", () => {
    expect(extractType("**Type**: feature")).toBe("feature");
  });

  it("lowercases the extracted type", () => {
    expect(extractType("**Type**: FEATURE")).toBe("feature");
  });

  it("returns null when no type meta line found", () => {
    expect(extractType("No type info")).toBeNull();
  });

  it("handles type in a multiline document", () => {
    expect(extractType(SAMPLE_DRAFT)).toBe("feature");
  });
});

// ─── stripTitle ──────────────────────────────────────────────────────────────

describe("stripTitle", () => {
  it("removes the first heading line", () => {
    const result = stripTitle("# My Title\n\nBody text");
    expect(result).not.toContain("# My Title");
    expect(result).toContain("Body text");
  });

  it("removes blank lines following the heading", () => {
    const result = stripTitle("# Title\n\n\nContent");
    expect(result.startsWith("Content")).toBe(true);
  });

  it("returns the original string when no heading exists", () => {
    expect(stripTitle("No heading")).toBe("No heading");
  });
});

// ─── buildBody ───────────────────────────────────────────────────────────────

describe("buildBody", () => {
  it("prepends the generated badge", () => {
    const body = buildBody(SAMPLE_DRAFT);
    expect(body).toContain("[!NOTE]");
    expect(body).toContain("mcp-github-issues");
  });

  it("does not include the title heading in the body", () => {
    const body = buildBody(SAMPLE_DRAFT);
    expect(body).not.toContain("# My Task Title");
  });

  it("includes the original content after the badge", () => {
    const body = buildBody(SAMPLE_DRAFT);
    expect(body).toContain("Some context here");
  });
});

// ─── publish_issue handler ────────────────────────────────────────────────────

describe("publish_issue handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(SAMPLE_DRAFT);

    mockCreate.mockResolvedValue({
      data: {
        number: 42,
        title: "[FEATURE] My Task Title",
        html_url: "https://github.com/myorg/myrepo/issues/42",
      },
    });
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["publish_issue"]).toBeDefined();
  });

  it("calls octokit.issues.create with correct owner and repo", async () => {
    await handlers["publish_issue"]({
      project: "api",
      draftFile: "/abs/tasks/api/2026-02-26-my-task.md",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "myorg", repo: "myrepo" })
    );
  });

  it("prefixes the title with the type tag [FEATURE]", async () => {
    await handlers["publish_issue"]({
      project: "api",
      draftFile: "/abs/tasks/api/2026-02-26-my-task.md",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "[FEATURE] My Task Title" })
    );
  });

  it("sets the label based on the type", async () => {
    await handlers["publish_issue"]({
      project: "api",
      draftFile: "/abs/tasks/api/2026-02-26-my-task.md",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["enhancement"] })
    );
  });

  it("overrides the type when explicitly provided", async () => {
    await handlers["publish_issue"]({
      project: "api",
      draftFile: "/abs/tasks/api/2026-02-26-my-task.md",
      type: "bug",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[BUG] My Task Title",
        labels: ["bug"],
      })
    );
  });

  it("returns the issue URL in the response", async () => {
    const result = await handlers["publish_issue"]({
      project: "api",
      draftFile: "/abs/tasks/api/2026-02-26-my-task.md",
    });
    expect(result.content[0].text).toContain(
      "https://github.com/myorg/myrepo/issues/42"
    );
  });

  it("returns the issue number in the response", async () => {
    const result = await handlers["publish_issue"]({
      project: "api",
      draftFile: "/abs/tasks/api/2026-02-26-my-task.md",
    });
    expect(result.content[0].text).toContain("#42");
  });

  it("throws when the draft file does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(
      handlers["publish_issue"]({
        project: "api",
        draftFile: "/nonexistent/file.md",
      })
    ).rejects.toThrow("Draft file not found");
  });
});
