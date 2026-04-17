import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── mocks ────────────────────────────────────────────────────────────────────

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));

vi.mock("../../src/tools/listProjects.js", () => ({ register: mockRegister }));
vi.mock("../../src/tools/publish.js", () => ({ register: mockRegister }));
vi.mock("../../src/tools/fetchIssue.js", () => ({ register: mockRegister }));
vi.mock("../../src/tools/listIssues.js", () => ({ register: mockRegister }));
vi.mock("../../src/tools/addComment.js", () => ({ register: mockRegister }));
vi.mock("../../src/tools/updateIssue.js", () => ({ register: mockRegister }));

// ─── imports ─────────────────────────────────────────────────────────────────

import { registerAllTools } from "../../src/router.js";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("registerAllTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers all 6 tools", () => {
    const server = {} as McpServer;
    registerAllTools(server);
    expect(mockRegister).toHaveBeenCalledTimes(6);
  });

  it("passes the server instance to each register call", () => {
    const server = { tool: vi.fn() } as unknown as McpServer;
    registerAllTools(server);
    for (const call of mockRegister.mock.calls) {
      expect(call[0]).toBe(server);
    }
  });
});
