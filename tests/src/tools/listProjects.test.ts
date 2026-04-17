import { describe, it, expect, vi } from "vitest";
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

vi.mock("../../../src/config.js", () => ({
  config: {
    projects: {
      api: {
        owner: "myorg",
        repo: "backend",
        tokenEnv: "GITHUB_TOKEN_API",
      },
      web: {
        owner: "myorg",
        repo: "frontend",
        tokenEnv: "GITHUB_TOKEN_WEB",
      },
    },
  },
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { register } from "../../../src/tools/listProjects.js";

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

// ─── list_projects handler ────────────────────────────────────────────────────

describe("list_projects handler", () => {
  it("registers the tool with the correct name", () => {
    const { server, handlers } = createMockServer();
    register(server);
    expect(handlers["list_projects"]).toBeDefined();
  });

  it("returns all project names", async () => {
    const { server, handlers } = createMockServer();
    register(server);
    const result = await handlers["list_projects"]({});
    const text = result.content[0].text;
    expect(text).toContain("api");
    expect(text).toContain("web");
  });

  it("includes owner/repo for each project", async () => {
    const { server, handlers } = createMockServer();
    register(server);
    const result = await handlers["list_projects"]({});
    const text = result.content[0].text;
    expect(text).toContain("myorg/backend");
    expect(text).toContain("myorg/frontend");
  });

  it("returns a heading in the response", async () => {
    const { server, handlers } = createMockServer();
    register(server);
    const result = await handlers["list_projects"]({});
    expect(result.content[0].text).toContain("Available Projects");
  });
});
