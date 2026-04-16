import { describe, it, expect, afterEach } from "vitest";
import { getProject, getToken, resolveTasksDir } from "../../src/config.js";
import path from "path";

// These tests use the real projects.yaml (projects: talksy)

describe("getProject", () => {
  it("returns config for an existing project", () => {
    const project = getProject("talksy");
    expect(project.owner).toBe("prog-time");
    expect(project.repo).toBe("talksy");
    expect(project.tokenEnv).toBe("GITHUB_TOKEN");
    expect(project.tasksDir).toBe("./tasks/talksy");
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

describe("resolveTasksDir", () => {
  it("returns an absolute path", () => {
    const project = getProject("talksy");
    const dir = resolveTasksDir(project);
    expect(path.isAbsolute(dir)).toBe(true);
  });

  it("path ends with the configured tasksDir segment", () => {
    const project = getProject("talksy");
    const dir = resolveTasksDir(project);
    expect(dir).toMatch(/tasks[/\\]talksy$/);
  });
});
