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

const mockListForRepo = vi.fn();

vi.mock("../../src/config.js", () => ({
  getProject: vi.fn().mockReturnValue({
    owner: "myorg",
    repo: "myrepo",
    tokenEnv: "GITHUB_TOKEN_API",
    tasksDir: "./tasks/api",
  }),
  getOctokit: vi.fn().mockReturnValue({
    issues: { listForRepo: mockListForRepo },
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { register } from "../../../src/tools/listIssues.js";

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

const MOCK_ISSUES = [
  {
    number: 1,
    title: "First issue",
    html_url: "https://github.com/myorg/myrepo/issues/1",
    labels: [{ name: "bug" }],
    assignees: [{ login: "alice" }],
    pull_request: undefined,
  },
  {
    number: 2,
    title: "Second issue",
    html_url: "https://github.com/myorg/myrepo/issues/2",
    labels: [],
    assignees: [],
    pull_request: undefined,
  },
];

// ─── tests ────────────────────────────────────────────────────────────────────

describe("list_issues handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;
    mockListForRepo.mockResolvedValue({ data: MOCK_ISSUES });
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["list_issues"]).toBeDefined();
  });

  it("calls listForRepo with correct owner and repo", async () => {
    await handlers["list_issues"]({ project: "api", state: "open", limit: 30 });
    expect(mockListForRepo).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "myorg", repo: "myrepo" })
    );
  });

  it("returns issue titles in the response", async () => {
    const result = await handlers["list_issues"]({ project: "api", state: "open", limit: 30 });
    expect(result.content[0].text).toContain("First issue");
    expect(result.content[0].text).toContain("Second issue");
  });

  it("returns issue numbers in the response", async () => {
    const result = await handlers["list_issues"]({ project: "api", state: "open", limit: 30 });
    expect(result.content[0].text).toContain("#1");
    expect(result.content[0].text).toContain("#2");
  });

  it("includes labels in the response", async () => {
    const result = await handlers["list_issues"]({ project: "api", state: "open", limit: 30 });
    expect(result.content[0].text).toContain("`bug`");
  });

  it("returns empty message when no issues found", async () => {
    mockListForRepo.mockResolvedValue({ data: [] });
    const result = await handlers["list_issues"]({ project: "api", state: "open", limit: 30 });
    expect(result.content[0].text).toContain("No open issues found");
  });

  it("filters out pull requests from the results", async () => {
    mockListForRepo.mockResolvedValue({
      data: [
        ...MOCK_ISSUES,
        { number: 99, title: "A PR", html_url: "...", labels: [], assignees: [], pull_request: { url: "..." } },
      ],
    });
    const result = await handlers["list_issues"]({ project: "api", state: "open", limit: 30 });
    expect(result.content[0].text).not.toContain("A PR");
  });

  it("propagates API errors", async () => {
    mockListForRepo.mockRejectedValue(new Error("GitHub API error"));
    await expect(
      handlers["list_issues"]({ project: "api", state: "open", limit: 30 })
    ).rejects.toThrow("GitHub API error");
  });
});
