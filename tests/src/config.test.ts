import { describe, it, expect, afterEach, vi } from "vitest";

// ─── mocks ────────────────────────────────────────────────────────────────────

// Stub `fs` so loadConfig() in src/config.ts reads a deterministic projects.yaml
// regardless of what exists on disk. Other fs calls (e.g. dotenv reading .env)
// pass through to the real implementation.
vi.mock("fs", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any;

  const fakeYaml = [
    "projects:",
    "  talksy:",
    "    owner: prog-time",
    "    repo: talksy",
    "    tokenEnv: GITHUB_TOKEN",
    "",
  ].join("\n");

  const isProjectsYaml = (p: unknown): p is string =>
    typeof p === "string" && p.endsWith("projects.yaml");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch = (orig: any) => ({
    ...orig,
    existsSync: (p: unknown) =>
      isProjectsYaml(p) ? true : orig.existsSync(p),
    readFileSync: (p: unknown, opts?: unknown) =>
      isProjectsYaml(p) ? fakeYaml : orig.readFileSync(p, opts),
  });

  const patched = patch(actual);
  return { ...patched, default: patch(actual.default ?? actual) };
});

// ─── imports ─────────────────────────────────────────────────────────────────

import { getProject, getToken } from "../../src/config.js";

// ─── tests ───────────────────────────────────────────────────────────────────

describe("getProject", () => {
  it("returns config for an existing project", () => {
    const project = getProject("talksy");
    expect(project.owner).toBe("prog-time");
    expect(project.repo).toBe("talksy");
    expect(project.tokenEnv).toBe("GITHUB_TOKEN");
  });

  it("throws for an unknown project", () => {
    expect(() => getProject("nonexistent")).toThrow(
      'Project "nonexistent" not found'
    );
  });

  it("includes available project names in the error message", () => {
    expect(() => getProject("nonexistent")).toThrow("talksy");
  });
});

describe("getToken", () => {
  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  it("returns the token value from the environment variable", () => {
    process.env.GITHUB_TOKEN = "ghp_test_secret";
    const project = getProject("talksy");
    expect(getToken(project)).toBe("ghp_test_secret");
  });

  it("throws when the environment variable is not set", () => {
    delete process.env.GITHUB_TOKEN;
    const project = getProject("talksy");
    expect(() => getToken(project)).toThrow("GITHUB_TOKEN");
  });
});
