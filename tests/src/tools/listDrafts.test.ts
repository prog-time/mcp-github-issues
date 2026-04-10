import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  },
}));

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
  resolveTasksDir: vi.fn().mockReturnValue("/abs/tasks/api"),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import fs from "fs";
import { register } from "../../../src/tools/listDrafts.js";

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

describe("list_drafts handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["list_drafts"]).toBeDefined();
  });

  it("returns message when tasks directory does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await handlers["list_drafts"]({ project: "api" });
    expect(result.content[0].text).toContain("Directory does not exist");
  });

  it("returns message when no draft files exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([] as never);
    const result = await handlers["list_drafts"]({ project: "api" });
    expect(result.content[0].text).toContain("No drafts found");
  });

  it("returns draft titles when files exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["2026-04-01-my-task.md"] as never);
    vi.mocked(fs.readFileSync).mockReturnValue("# My Task\n\nContext here.");
    const result = await handlers["list_drafts"]({ project: "api" });
    expect(result.content[0].text).toContain("My Task");
  });

  it("returns the file path for each draft", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["2026-04-01-my-task.md"] as never);
    vi.mocked(fs.readFileSync).mockReturnValue("# My Task\n\nContext.");
    const result = await handlers["list_drafts"]({ project: "api" });
    expect(result.content[0].text).toContain("/abs/tasks/api/2026-04-01-my-task.md");
  });

  it("lists multiple drafts", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      "2026-04-01-first.md",
      "2026-04-02-second.md",
    ] as never);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce("# First Task\n")
      .mockReturnValueOnce("# Second Task\n");
    const result = await handlers["list_drafts"]({ project: "api" });
    expect(result.content[0].text).toContain("First Task");
    expect(result.content[0].text).toContain("Second Task");
  });
});
