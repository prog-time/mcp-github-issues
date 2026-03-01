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

vi.mock("../../src/config.js", () => ({
  getProject: vi.fn().mockReturnValue({
    owner: "myorg",
    repo: "myrepo",
    tokenEnv: "GITHUB_TOKEN_API",
    tasksDir: "./tasks/api",
  }),
  getToken: vi.fn().mockReturnValue("ghp_testtoken"),
  resolveTasksDir: vi.fn().mockReturnValue("/abs/tasks/api"),
}));

const mockIssueGet = vi.fn();
const mockListComments = vi.fn();
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    issues: {
      get: mockIssueGet,
      listComments: mockListComments,
    },
  })),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { parseIssueNumber, register } from "../../../src/tools/fetchIssue.js";

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

const MOCK_ISSUE = {
  number: 123,
  title: "Fix login bug",
  state: "open",
  body: "Users cannot log in when 2FA is enabled.",
  html_url: "https://github.com/myorg/myrepo/issues/123",
  labels: [{ name: "bug" }, { name: "urgent" }],
  assignees: [{ login: "alice" }],
  created_at: "2026-01-15T08:00:00Z",
  updated_at: "2026-02-20T12:00:00Z",
};

// ─── parseIssueNumber ─────────────────────────────────────────────────────────

describe("parseIssueNumber", () => {
  it("parses a plain numeric string", () => {
    expect(parseIssueNumber("123")).toBe(123);
  });

  it("parses a single-digit number", () => {
    expect(parseIssueNumber("1")).toBe(1);
  });

  it("trims whitespace before parsing", () => {
    expect(parseIssueNumber("  42  ")).toBe(42);
  });

  it("extracts issue number from a full GitHub URL", () => {
    expect(
      parseIssueNumber("https://github.com/owner/repo/issues/456")
    ).toBe(456);
  });

  it("extracts issue number from a URL with trailing content", () => {
    expect(
      parseIssueNumber("https://github.com/myorg/myrepo/issues/99#issuecomment-1")
    ).toBe(99);
  });

  it("throws for zero", () => {
    expect(() => parseIssueNumber("0")).toThrow();
  });

  it("throws for a negative number", () => {
    expect(() => parseIssueNumber("-5")).toThrow();
  });

  it("throws for a non-numeric string", () => {
    expect(() => parseIssueNumber("abc")).toThrow("Cannot parse issue identifier");
  });

  it("throws for a pull request URL (not an issue URL)", () => {
    expect(() =>
      parseIssueNumber("https://github.com/owner/repo/pulls/123")
    ).toThrow("Cannot parse issue identifier");
  });
});

// ─── fetch_issue handler ──────────────────────────────────────────────────────

describe("fetch_issue handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

    mockIssueGet.mockResolvedValue({ data: MOCK_ISSUE });
    mockListComments.mockResolvedValue({ data: [] });
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["fetch_issue"]).toBeDefined();
  });

  it("calls octokit.issues.get with correct params", async () => {
    await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(mockIssueGet).toHaveBeenCalledWith({
      owner: "myorg",
      repo: "myrepo",
      issue_number: 123,
    });
  });

  it("parses issue number from a URL", async () => {
    await handlers["fetch_issue"]({
      project: "api",
      issue: "https://github.com/myorg/myrepo/issues/123",
      include_comments: false,
    });
    expect(mockIssueGet).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 123 })
    );
  });

  it("calls listComments when include_comments is true", async () => {
    await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: true,
    });
    expect(mockListComments).toHaveBeenCalled();
  });

  it("does NOT call listComments when include_comments is false", async () => {
    await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(mockListComments).not.toHaveBeenCalled();
  });

  it("returns the issue title in the response", async () => {
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain("Fix login bug");
  });

  it("returns the issue number in the response", async () => {
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain("#123");
  });

  it("returns the issue body in the response", async () => {
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain(
      "Users cannot log in when 2FA is enabled."
    );
  });

  it("includes labels in the response", async () => {
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain("`bug`");
    expect(result.content[0].text).toContain("`urgent`");
  });

  it("includes assignees in the response", async () => {
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain("@alice");
  });

  it("includes the issue URL in the response", async () => {
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain(
      "https://github.com/myorg/myrepo/issues/123"
    );
  });

  it("includes comment content when comments are present", async () => {
    mockListComments.mockResolvedValue({
      data: [
        {
          user: { login: "bob" },
          created_at: "2026-02-01T09:00:00Z",
          body: "This is a comment from Bob.",
        },
      ],
    });
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: true,
    });
    expect(result.content[0].text).toContain("@bob");
    expect(result.content[0].text).toContain("This is a comment from Bob.");
  });

  it("shows comment count in the response", async () => {
    mockListComments.mockResolvedValue({
      data: [
        { user: { login: "bob" }, created_at: "2026-02-01T00:00:00Z", body: "x" },
        { user: { login: "carol" }, created_at: "2026-02-02T00:00:00Z", body: "y" },
      ],
    });
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: true,
    });
    expect(result.content[0].text).toContain("Comments (2)");
  });

  it("shows 'unassigned' when no assignees", async () => {
    mockIssueGet.mockResolvedValue({
      data: { ...MOCK_ISSUE, assignees: [] },
    });
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain("_unassigned_");
  });

  it("shows placeholder when issue body is empty", async () => {
    mockIssueGet.mockResolvedValue({
      data: { ...MOCK_ISSUE, body: null },
    });
    const result = await handlers["fetch_issue"]({
      project: "api",
      issue: "123",
      include_comments: false,
    });
    expect(result.content[0].text).toContain("_No description provided._");
  });

  it("propagates octokit errors", async () => {
    mockIssueGet.mockRejectedValue(new Error("GitHub API error: 404 Not Found"));
    await expect(
      handlers["fetch_issue"]({
        project: "api",
        issue: "999",
        include_comments: false,
      })
    ).rejects.toThrow("GitHub API error: 404 Not Found");
  });
});
