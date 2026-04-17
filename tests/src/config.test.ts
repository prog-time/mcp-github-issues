import { describe, it, expect, afterEach } from "vitest";
import { getProject, getToken } from "../../src/config.js";

// These tests use the real projects.yaml (projects: talksy)

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
