import { searchMemories } from "../searcher.js";
import { getDatabase } from "../database.js";

async function main() {
  // DB状態確認
  const db = getDatabase();
  const count = db
    .prepare("SELECT COUNT(*) as cnt FROM memories")
    .get() as { cnt: number };
  console.log(`DB内の記憶: ${count.cnt}件\n`);

  if (count.cnt === 0) {
    console.log("データなし。先にsave-workerでデータを保存してください。");
    db.close();
    return;
  }

  // 最初の数件のプレビュー
  const previews = db
    .prepare(
      "SELECT id, substr(text, 1, 100) as preview FROM memories LIMIT 3"
    )
    .all() as Array<{ id: number; preview: string }>;
  for (const p of previews) {
    console.log(`[${p.id}] ${p.preview}...`);
  }
  db.close();

  // 検索テスト
  console.log("\n--- 検索テスト ---");
  const queries = ["TypeScript", "実装", "エラー"];

  for (const q of queries) {
    console.log(`\nクエリ: "${q}"`);
    const start = Date.now();
    const results = await searchMemories(q, { limit: 3 });
    const elapsed = Date.now() - start;
    console.log(`  → ${results.length}件ヒット (${elapsed}ms)`);
    for (const r of results) {
      console.log(
        `  [score: ${r.score.toFixed(4)}] ${r.text.substring(0, 80)}...`
      );
    }
  }
}

main().catch(console.error);
