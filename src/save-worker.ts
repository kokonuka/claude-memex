import { parseTranscript } from "./chunker.js";
import { getDatabase } from "./database.js";
import { embedTexts } from "./embedder.js";
import { summarizeText } from "./summarizer.js";
import { writeErrorLog } from "./logger.js";
import { resolve } from "path";
import { existsSync } from "fs";
import { config } from "dotenv";
import { exec } from "child_process";
import { homedir } from "os";
import { join } from "path";

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

  // 1. セッション全体を1レコードとしてパース
  const chunks = parseTranscript(transcriptPath);
  if (chunks.length === 0) {
    process.exit(0);
  }
  const record = chunks[0];

  // 2. 要約生成（Gemini API）
  const summary = await summarizeText(record.body);

  // 3. ベクトル化（summaryのみ）
  const vectors = await embedTexts([summary]);

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

  const result = insertMemory.run(
    summary,
    record.body,
    companyName,
    record.projectPath,
    record.sessionId,
    record.timestamp
  );
  insertVec.run(BigInt(result.lastInsertRowid), vectors[0]);

  db.close();

  notify("セッションの記憶を保存しました");
}

main().catch((err) => {
  writeErrorLog(err);
  notify("記憶の保存に失敗しました（~/.claude-memex/error.log を確認）");
  console.error("save-worker error:", err);
  process.exit(1);
});
