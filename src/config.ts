import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import dotenv from "dotenv";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// ─── config schema ────────────────────────────────────────────────────────────

const ProjectConfigSchema = z.object({
  owner: z.string().min(1, "owner must not be empty"),
  repo: z.string().min(1, "repo must not be empty"),
  tokenEnv: z.string().min(1, "tokenEnv must not be empty"),
  tasksDir: z.string().min(1, "tasksDir must not be empty"),
});

const ConfigSchema = z.object({
  projects: z.record(z.string(), ProjectConfigSchema),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// ─── load & validate ──────────────────────────────────────────────────────────

function loadConfig(): Config {
  const configPath = path.resolve(__dirname, "..", "projects.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`projects.yaml not found at ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw);

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`projects.yaml validation failed:\n${issues}`);
  }

  return result.data;
}

export const config: Config = loadConfig();

// ─── helpers ──────────────────────────────────────────────────────────────────

export function getProject(name: string): ProjectConfig {
  const project = config.projects[name];
  if (!project) {
    const available = Object.keys(config.projects).join(", ");
    throw new Error(`Project "${name}" not found. Available: ${available}`);
  }
  return project;
}

export function getToken(project: ProjectConfig): string {
  const token = process.env[project.tokenEnv];
  if (!token) {
    throw new Error(
      `Environment variable "${project.tokenEnv}" is not set. Add it to your .env file.`
    );
  }
  return token;
}

export function resolveTasksDir(project: ProjectConfig): string {
  return path.resolve(__dirname, "..", project.tasksDir);
}

// ─── octokit cache ────────────────────────────────────────────────────────────

const octokitCache = new Map<string, Octokit>();

export function getOctokit(project: ProjectConfig): Octokit {
  const token = getToken(project);
  let client = octokitCache.get(token);
  if (!client) {
    client = new Octokit({ auth: token });
    octokitCache.set(token, client);
  }
  return client;
}
