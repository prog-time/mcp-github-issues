import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    logFile: "/dev/null",
  },
}));

const mockCreateComment = vi.fn();

vi.mock("../../src/config.js", () => ({
  getProject: vi.fn().mockReturnValue({
    owner: "myorg",
    repo: "myrepo",
    tokenEnv: "GITHUB_TOKEN_API",
    tasksDir: "./tasks/api",
  }),
  getOctokit: vi.fn().mockReturnValue({
    issues: { createComment: mockCreateComment },
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { register } from "../../../src/tools/addComment.js";

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

// ─── tests ────────────────────────────────────────────────────────────────────

describe("add_comment handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

    mockCreateComment.mockResolvedValue({
      data: {
        html_url: "https://github.com/myorg/myrepo/issues/5#issuecomment-100",
      },
    });
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["add_comment"]).toBeDefined();
  });

  it("calls createComment with correct params", async () => {
    await handlers["add_comment"]({
      project: "api",
      issue: "5",
      body: "This is my comment.",
    });
    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: "myorg",
      repo: "myrepo",
      issue_number: 5,
      body: "This is my comment.",
    });
  });

  it("parses issue number from a URL", async () => {
    await handlers["add_comment"]({
      project: "api",
      issue: "https://github.com/myorg/myrepo/issues/5",
      body: "Comment via URL.",
    });
    expect(mockCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 5 })
    );
  });

  it("returns the comment URL in the response", async () => {
    const result = await handlers["add_comment"]({
      project: "api",
      issue: "5",
      body: "Hello.",
    });
    expect(result.content[0].text).toContain(
      "https://github.com/myorg/myrepo/issues/5#issuecomment-100"
    );
  });

  it("returns the issue number in the response", async () => {
    const result = await handlers["add_comment"]({
      project: "api",
      issue: "5",
      body: "Hello.",
    });
    expect(result.content[0].text).toContain("#5");
  });

  it("propagates API errors", async () => {
    mockCreateComment.mockRejectedValue(new Error("GitHub API error"));
    await expect(
      handlers["add_comment"]({ project: "api", issue: "5", body: "Hi." })
    ).rejects.toThrow("GitHub API error");
  });
});
