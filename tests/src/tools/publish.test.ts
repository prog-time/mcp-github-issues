import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── mocks ────────────────────────────────────────────────────────────────────

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
  }),
  getToken: vi.fn().mockReturnValue("ghp_testtoken"),
  getOctokit: vi.fn().mockReturnValue({
    issues: { create: mockCreate },
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import {
  buildTitle,
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

const SAMPLE_INPUT = {
  project: "api",
  title: "My Task Title",
  context: "Some context here.",
  files: ["src/app.ts"],
  checklist: ["Write tests"],
  type: "feature" as const,
};

// ─── buildTitle ──────────────────────────────────────────────────────────────

describe("buildTitle", () => {
  it("prefixes the title with uppercased type", () => {
    expect(buildTitle("Hello World", "bug")).toBe("[BUG] Hello World");
  });

  it("uppercases mixed-case type", () => {
    expect(buildTitle("Title", "feature")).toBe("[FEATURE] Title");
  });
});

// ─── buildBody ───────────────────────────────────────────────────────────────

describe("buildBody", () => {
  it("prepends the generated badge", () => {
    const body = buildBody(SAMPLE_INPUT);
    expect(body).toContain("[!NOTE]");
    expect(body).toContain("mcp-github-issues");
  });

  it("does not include the title heading in the body", () => {
    const body = buildBody(SAMPLE_INPUT);
    expect(body).not.toContain("# My Task Title");
  });

  it("includes the context section", () => {
    const body = buildBody(SAMPLE_INPUT);
    expect(body).toContain("## Context");
    expect(body).toContain("Some context here.");
  });

  it("renders files as bullets with backticks", () => {
    const body = buildBody(SAMPLE_INPUT);
    expect(body).toContain("- `src/app.ts`");
  });

  it("renders checklist as unchecked items", () => {
    const body = buildBody(SAMPLE_INPUT);
    expect(body).toContain("- [ ] Write tests");
  });

  it("falls back to placeholder when files list is empty", () => {
    const body = buildBody({ ...SAMPLE_INPUT, files: [] });
    expect(body).toContain("_No files specified_");
  });

  it("falls back to placeholder when checklist is empty", () => {
    const body = buildBody({ ...SAMPLE_INPUT, checklist: [] });
    expect(body).toContain("_No checklist items_");
  });

  it("includes assignee meta line when provided", () => {
    const body = buildBody({ ...SAMPLE_INPUT, assignee: "johndoe" });
    expect(body).toContain("**Assignee**: @johndoe");
  });

  it("omits assignee meta line when not provided", () => {
    const body = buildBody(SAMPLE_INPUT);
    expect(body).not.toContain("**Assignee**");
  });
});

// ─── publish_issue handler ────────────────────────────────────────────────────

describe("publish_issue handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

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
    await handlers["publish_issue"]({ ...SAMPLE_INPUT });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "myorg", repo: "myrepo" })
    );
  });

  it("prefixes the title with the type tag [FEATURE]", async () => {
    await handlers["publish_issue"]({ ...SAMPLE_INPUT });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "[FEATURE] My Task Title" })
    );
  });

  it("sets the label based on the type", async () => {
    await handlers["publish_issue"]({ ...SAMPLE_INPUT });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["enhancement"] })
    );
  });

  it("maps bug type to bug label", async () => {
    await handlers["publish_issue"]({ ...SAMPLE_INPUT, type: "bug" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[BUG] My Task Title",
        labels: ["bug"],
      })
    );
  });

  it("maps task type to task label", async () => {
    await handlers["publish_issue"]({ ...SAMPLE_INPUT, type: "task" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[TASK] My Task Title",
        labels: ["task"],
      })
    );
  });

  it("passes the assignee to octokit when provided", async () => {
    await handlers["publish_issue"]({ ...SAMPLE_INPUT, assignee: "johndoe" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["johndoe"] })
    );
  });

  it("omits assignees when not provided", async () => {
    await handlers["publish_issue"]({ ...SAMPLE_INPUT });
    const call = mockCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty("assignees");
  });

  it("returns the issue URL in the response", async () => {
    const result = await handlers["publish_issue"]({ ...SAMPLE_INPUT });
    expect(result.content[0].text).toContain(
      "https://github.com/myorg/myrepo/issues/42"
    );
  });

  it("returns the issue number in the response", async () => {
    const result = await handlers["publish_issue"]({ ...SAMPLE_INPUT });
    expect(result.content[0].text).toContain("#42");
  });
});
