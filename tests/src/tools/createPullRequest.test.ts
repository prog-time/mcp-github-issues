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
    tokenEnv: "GITHUB_TOKEN",
  }),
  getToken: vi.fn().mockReturnValue("ghp_testtoken"),
  getOctokit: vi.fn().mockReturnValue({
    pulls: { create: mockCreate },
  }),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { register } from "../../../src/tools/createPullRequest.js";

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
  title: "Add new feature",
  head: "feature/my-feature",
  base: "main",
  draft: false,
};

// ─── register ────────────────────────────────────────────────────────────────

describe("create_pull_request registration", () => {
  it("registers the tool with the correct name", () => {
    const { server, handlers } = createMockServer();
    register(server);
    expect(handlers["create_pull_request"]).toBeDefined();
  });
});

// ─── handler: happy path ──────────────────────────────────────────────────────

describe("create_pull_request handler — happy path", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

    mockCreate.mockResolvedValue({
      data: {
        number: 7,
        title: "Add new feature",
        html_url: "https://github.com/myorg/myrepo/pull/7",
        draft: false,
      },
    });
  });

  it("calls octokit.pulls.create with owner and repo from project config", async () => {
    await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "myorg", repo: "myrepo" })
    );
  });

  it("passes title, head, and base to octokit", async () => {
    await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Add new feature",
        head: "feature/my-feature",
        base: "main",
      })
    );
  });

  it("passes draft: false when not set to draft", async () => {
    await handlers["create_pull_request"]({ ...SAMPLE_INPUT, draft: false });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false })
    );
  });

  it("returns PR number in response text", async () => {
    const result = await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    expect(result.content[0].text).toContain("#7");
  });

  it("returns PR URL in response text", async () => {
    const result = await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    expect(result.content[0].text).toContain(
      "https://github.com/myorg/myrepo/pull/7"
    );
  });

  it("includes head → base in response text", async () => {
    const result = await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    expect(result.content[0].text).toContain("feature/my-feature");
    expect(result.content[0].text).toContain("main");
  });
});

// ─── handler: draft flag ──────────────────────────────────────────────────────

describe("create_pull_request handler — draft flag", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

    mockCreate.mockResolvedValue({
      data: {
        number: 8,
        title: "Draft PR",
        html_url: "https://github.com/myorg/myrepo/pull/8",
        draft: true,
      },
    });
  });

  it("passes draft: true to octokit when draft is set", async () => {
    await handlers["create_pull_request"]({ ...SAMPLE_INPUT, draft: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
  });

  it("includes draft status in response text", async () => {
    const result = await handlers["create_pull_request"]({
      ...SAMPLE_INPUT,
      draft: true,
    });
    expect(result.content[0].text).toContain("yes");
  });
});

// ─── handler: optional fields ─────────────────────────────────────────────────

describe("create_pull_request handler — optional fields", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;

    mockCreate.mockResolvedValue({
      data: {
        number: 9,
        title: "PR with body",
        html_url: "https://github.com/myorg/myrepo/pull/9",
        draft: false,
      },
    });
  });

  it("passes body to octokit when provided", async () => {
    await handlers["create_pull_request"]({
      ...SAMPLE_INPUT,
      body: "Closes #42",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Closes #42" })
    );
  });

  it("omits body from octokit call when not provided", async () => {
    await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    const call = mockCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty("body");
  });

  it("passes maintainer_can_modify when provided", async () => {
    await handlers["create_pull_request"]({
      ...SAMPLE_INPUT,
      maintainer_can_modify: true,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ maintainer_can_modify: true })
    );
  });

  it("omits maintainer_can_modify when not provided", async () => {
    await handlers["create_pull_request"]({ ...SAMPLE_INPUT });
    const call = mockCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty("maintainer_can_modify");
  });
});

// ─── handler: error scenarios ─────────────────────────────────────────────────

describe("create_pull_request handler — error handling", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;
  });

  it("rethrows octokit error without swallowing it", async () => {
    const apiError = new Error("Unprocessable Entity: branches must differ");
    mockCreate.mockRejectedValue(apiError);

    await expect(
      handlers["create_pull_request"]({ ...SAMPLE_INPUT })
    ).rejects.toThrow("Unprocessable Entity: branches must differ");
  });

  it("logs error via logger.error before rethrowing", async () => {
    const { logger } = await import("../../../src/logger.js");
    const apiError = new Error("422 branches must differ");
    mockCreate.mockRejectedValue(apiError);

    await expect(
      handlers["create_pull_request"]({ ...SAMPLE_INPUT })
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      "create_pull_request failed",
      expect.objectContaining({ error: expect.stringContaining("422") })
    );
  });
});
