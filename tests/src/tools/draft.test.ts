import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── mocks (hoisted before imports) ─────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
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
  getToken: vi.fn().mockReturnValue("ghp_testtoken"),
  resolveTasksDir: vi.fn().mockReturnValue("/abs/tasks/api"),
}));

// ─── imports (after mocks) ───────────────────────────────────────────────────

import fs from "fs";
import { slugify, buildMarkdown, register } from "../../../src/tools/draft.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

type Handler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

function createMockServer() {
  const handlers: Record<string, Handler> = {};
  const server = {
    tool: vi.fn(
      (
        name: string,
        _desc: string,
        _schema: unknown,
        handler: Handler
      ) => {
        handlers[name] = handler;
      }
    ),
  } as unknown as McpServer;
  return { server, handlers };
}

// ─── slugify ─────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters except Cyrillic", () => {
    expect(slugify("Fix Bug #123!")).toBe("fix-bug-123");
  });

  it("handles Cyrillic characters", () => {
    expect(slugify("Добавить кнопку")).toBe("добавить-кнопку");
  });

  it("collapses multiple spaces", () => {
    expect(slugify("a  b   c")).toBe("a-b-c");
  });

  it("truncates to 60 characters", () => {
    const long = "a ".repeat(40); // 80 chars
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});

// ─── buildMarkdown ───────────────────────────────────────────────────────────

describe("buildMarkdown", () => {
  const base = {
    project: "api",
    title: "My Task",
    context: "Some context here",
    files: [] as string[],
    checklist: [] as string[],
    type: "task" as const,
  };

  it("includes the title as a heading", () => {
    const md = buildMarkdown(base);
    expect(md).toContain("# My Task");
  });

  it("includes the type in the meta line", () => {
    const md = buildMarkdown({ ...base, type: "bug" });
    expect(md).toContain("**Type**: bug");
  });

  it("includes the context section", () => {
    const md = buildMarkdown(base);
    expect(md).toContain("## Context");
    expect(md).toContain("Some context here");
  });

  it("renders file list as code bullets", () => {
    const md = buildMarkdown({ ...base, files: ["src/app.ts", "src/db.ts"] });
    expect(md).toContain("- `src/app.ts`");
    expect(md).toContain("- `src/db.ts`");
  });

  it("shows placeholder when no files provided", () => {
    const md = buildMarkdown(base);
    expect(md).toContain("_No files specified_");
  });

  it("renders checklist items as task list", () => {
    const md = buildMarkdown({ ...base, checklist: ["Write tests", "Deploy"] });
    expect(md).toContain("- [ ] Write tests");
    expect(md).toContain("- [ ] Deploy");
  });

  it("shows placeholder when no checklist provided", () => {
    const md = buildMarkdown(base);
    expect(md).toContain("_No checklist items_");
  });

  it("includes assignee when provided", () => {
    const md = buildMarkdown({ ...base, assignee: "alice" });
    expect(md).toContain("@alice");
  });
});

// ─── create_task_draft handler ───────────────────────────────────────────────

describe("create_task_draft handler", () => {
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-26T10:00:00.000Z"));
    const mock = createMockServer();
    register(mock.server);
    handlers = mock.handlers;
    vi.mocked(fs.writeFileSync).mockClear();
    vi.mocked(fs.mkdirSync).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers the tool with the correct name", () => {
    expect(handlers["create_task_draft"]).toBeDefined();
  });

  it("creates the tasks directory", async () => {
    await handlers["create_task_draft"]({
      project: "api",
      title: "Test Task",
      context: "Some context",
      files: [],
      checklist: [],
      type: "task",
    });
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith("/abs/tasks/api", {
      recursive: true,
    });
  });

  it("writes a file with the correct date-slug filename", async () => {
    await handlers["create_task_draft"]({
      project: "api",
      title: "Test Task",
      context: "Some context",
      files: [],
      checklist: [],
      type: "task",
    });
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expect.stringMatching(/2026-02-26-test-task\.md$/),
      expect.any(String),
      "utf-8"
    );
  });

  it("returns the file path in the response text", async () => {
    const result = await handlers["create_task_draft"]({
      project: "api",
      title: "Test Task",
      context: "Some context",
      files: [],
      checklist: [],
      type: "task",
    });
    expect(result.content[0].text).toContain("/abs/tasks/api");
    expect(result.content[0].text).toContain("Draft Created");
  });

  it("response includes the markdown content", async () => {
    const result = await handlers["create_task_draft"]({
      project: "api",
      title: "My Feature",
      context: "Add login",
      files: ["src/auth.ts"],
      checklist: ["Write tests"],
      type: "feature",
    });
    const text = result.content[0].text;
    expect(text).toContain("# My Feature");
    expect(text).toContain("Add login");
    expect(text).toContain("`src/auth.ts`");
    expect(text).toContain("- [ ] Write tests");
  });

  it("propagates error when getProject throws", async () => {
    const { getProject } = await import("../../../src/config.js");
    vi.mocked(getProject).mockImplementationOnce(() => {
      throw new Error('Project "bad" not found');
    });
    await expect(
      handlers["create_task_draft"]({
        project: "bad",
        title: "T",
        context: "C",
        files: [],
        checklist: [],
        type: "task",
      })
    ).rejects.toThrow('Project "bad" not found');
  });
});
