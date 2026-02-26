import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "server.log");

fs.mkdirSync(LOG_DIR, { recursive: true });

type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

function write(level: Level, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${ts}] [${level}] ${message}${metaStr}\n`;

  // stderr — подхватывается Claude Desktop в mcp*.log
  process.stderr.write(line);

  // файл — для самостоятельного просмотра
  fs.appendFileSync(LOG_FILE, line, "utf-8");
}

export const logger = {
  info: (msg: string, meta?: unknown) => write("INFO", msg, meta),
  warn: (msg: string, meta?: unknown) => write("WARN", msg, meta),
  error: (msg: string, meta?: unknown) => write("ERROR", msg, meta),
  debug: (msg: string, meta?: unknown) => write("DEBUG", msg, meta),
  logFile: LOG_FILE,
};
