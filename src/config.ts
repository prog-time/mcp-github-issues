import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export interface ProjectConfig {
  owner: string;
  repo: string;
  tokenEnv: string;
  tasksDir: string;
}

export interface Config {
  projects: Record<string, ProjectConfig>;
}

function loadConfig(): Config {
  const configPath = path.resolve(__dirname, "..", "projects.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`projects.yaml not found at ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw) as Config;

  if (!parsed?.projects || typeof parsed.projects !== "object") {
    throw new Error("projects.yaml must have a top-level 'projects' key");
  }

  return parsed;
}

export const config: Config = loadConfig();

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
