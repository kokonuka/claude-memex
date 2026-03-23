import { parseTranscript } from "./chunker.js";
import { getDatabase } from "./database.js";
import { embedTexts } from "./embedder.js";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { config } from "dotenv";

async function main() {
  const [transcriptPath, sessionId, cwd] = process.argv.slice(2);

  if (!transcriptPath || !existsSync(transcriptPath)) {
    process.exit(1);
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

  // 2. ベクトル化
  const texts = chunks.map((c) => c.text);
  const vectors = await embedTexts(texts);

  // 3. DB保存（memoriesテーブル + memories_vecテーブル）
  const db = getDatabase();
  const insertMemory = db.prepare(`
    INSERT INTO memories (text, company_name, project_path, session_id, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertVec = db.prepare(`
    INSERT INTO memories_vec (memory_id, embedding)
    VALUES (?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const result = insertMemory.run(
        chunks[i].text,
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
}

main().catch((err) => {
  console.error("save-worker error:", err);
  process.exit(1);
});
