import { existsSync, appendFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const LOG_DIR = join(homedir(), ".claude-memex");
const LOG_PATH = join(LOG_DIR, "error.log");

export function writeErrorLog(err: unknown): void {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    appendFileSync(LOG_PATH, `[${timestamp}] ${message}\n`, "utf-8");
  } catch {
    // ログ書き込み自体が失敗した場合は無視
  }
}
