import { parseTranscript } from "./chunker.js";
import { getDatabase } from "./database.js";
import { embedTexts } from "./embedder.js";
import { summarizeTexts } from "./summarizer.js";
import { resolve } from "path";
import { existsSync, appendFileSync, mkdirSync } from "fs";
import { config } from "dotenv";
import { exec } from "child_process";
import { homedir } from "os";
import { join } from "path";

const LOG_DIR = join(homedir(), ".claude-memex");
const LOG_PATH = join(LOG_DIR, "error.log");

function writeErrorLog(err: unknown): void {
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

function notify(message: string): void {
  if (process.platform === "darwin") {
    exec(
      `osascript -e 'display notification "${message}" with title "claude-memex"'`
    );
  }
}

async function main() {
  const [transcriptPath, sessionId, cwd] = process.argv.slice(2);

  if (!transcriptPath || !existsSync(transcriptPath)) {
    process.exit(1);
  }

  // グローバル設定ファイルからAPIキーを読み取る
  const globalEnvPath = join(homedir(), ".claude-memex", ".env");
  if (existsSync(globalEnvPath)) {
    config({ path: globalEnvPath });
  }

  // プロジェクトの.envからCOMPANY_NAMEを読み取る
  const envPath = resolve(cwd, ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
  const companyName = process.env.COMPANY_NAME || "";

  // 1. チャンク分割
  const chunks = parseTranscript(transcriptPath);
  if (chunks.length === 0) {
    process.exit(0);
  }

  // 2. 要約生成（Gemini API）
  const bodies = chunks.map((c) => c.body);
  const summaries = await summarizeTexts(bodies);

  // 3. ベクトル化（summaryのみ）
  const vectors = await embedTexts(summaries);

  // 4. DB保存（memoriesテーブル + memories_vecテーブル）
  const db = getDatabase();
  const insertMemory = db.prepare(`
    INSERT INTO memories (summary, body, company_name, project_path, session_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertVec = db.prepare(`
    INSERT INTO memories_vec (memory_id, embedding)
    VALUES (?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const result = insertMemory.run(
        summaries[i],
        chunks[i].body,
        companyName,
        chunks[i].projectPath,
        chunks[i].sessionId,
        chunks[i].timestamp
      );
      insertVec.run(BigInt(result.lastInsertRowid), vectors[i]);
    }
  });

  insertAll();
  db.close();

  notify(`${chunks.length}件の記憶を保存しました`);
}

main().catch((err) => {
  writeErrorLog(err);
  notify("記憶の保存に失敗しました（~/.claude-memex/error.log を確認）");
  console.error("save-worker error:", err);
  process.exit(1);
});
