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

const { mockUpdate, mockAddLabels, mockRemoveLabel } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockAddLabels: vi.fn(),
  mockRemoveLabel: vi.fn(),
}));

vi.mock("../../../src/config.js", () => ({
  getProject: vi.fn().mockReturnValue({
    owner: "myorg",
    repo: "myrepo",
    tokenEnv: "GITHUB_TOKEN_API",
  }),
  getOctokit: vi.fn().mockReturnValue({
    issues: {
      update: mockUpdate,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel,
    },
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { register } from "../../../src/tools/updateIssue.js";

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

const MOCK_RESPONSE = {
  data: {
    state: "closed",
    html_url: "https://github.com/myorg/myrepo/issues/7",
  },
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("update_issue handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;
    mockUpdate.mockResolvedValue(MOCK_RESPONSE);
    mockAddLabels.mockResolvedValue({});
    mockRemoveLabel.mockResolvedValue({});
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["update_issue"]).toBeDefined();
  });

  it("calls update with correct owner, repo, and issue_number", async () => {
    await handlers["update_issue"]({ project: "api", issue: "7", state: "closed" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "myorg", repo: "myrepo", issue_number: 7 })
    );
  });

  it("passes state to the update call", async () => {
    await handlers["update_issue"]({ project: "api", issue: "7", state: "closed" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ state: "closed" })
    );
  });

  it("passes title to the update call", async () => {
    await handlers["update_issue"]({ project: "api", issue: "7", title: "New Title" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Title" })
    );
  });

  it("sets assignees when assignee is provided", async () => {
    await handlers["update_issue"]({ project: "api", issue: "7", assignee: "bob" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["bob"] })
    );
  });

  it("clears assignees when assignee is null", async () => {
    await handlers["update_issue"]({ project: "api", issue: "7", assignee: null });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: [] })
    );
  });

  it("calls addLabels when add_labels is provided", async () => {
    await handlers["update_issue"]({
      project: "api",
      issue: "7",
      add_labels: ["enhancement"],
    });
    expect(mockAddLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["enhancement"] })
    );
  });

  it("calls removeLabel for each label in remove_labels", async () => {
    await handlers["update_issue"]({
      project: "api",
      issue: "7",
      remove_labels: ["bug", "wontfix"],
    });
    expect(mockRemoveLabel).toHaveBeenCalledTimes(2);
  });

  it("returns the issue URL in the response", async () => {
    const result = await handlers["update_issue"]({
      project: "api",
      issue: "7",
      state: "closed",
    });
    expect(result.content[0].text).toContain(
      "https://github.com/myorg/myrepo/issues/7"
    );
  });

  it("mentions state change in the response", async () => {
    const result = await handlers["update_issue"]({
      project: "api",
      issue: "7",
      state: "closed",
    });
    expect(result.content[0].text).toContain("closed");
  });

  it("propagates API errors", async () => {
    mockUpdate.mockRejectedValue(new Error("GitHub API error"));
    await expect(
      handlers["update_issue"]({ project: "api", issue: "7", state: "closed" })
    ).rejects.toThrow("GitHub API error");
  });
});
