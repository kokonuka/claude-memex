import { getDatabase } from "../database.js";
import { embedTexts, embedQuery } from "../embedder.js";
import { searchMemories } from "../searcher.js";

async function main() {
  console.log("=== 統合テスト開始 ===\n");

  // 1. DB接続テスト
  console.log("[1] DB接続テスト...");
  const db = getDatabase();
  console.log("  → memories テーブル OK");

  // テーブル確認
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' OR type='virtual table'"
    )
    .all() as Array<{ name: string }>;
  console.log(
    "  → テーブル一覧:",
    tables.map((t) => t.name).join(", ")
  );

  // 2. ベクトル化テスト
  console.log("\n[2] ベクトル化テスト (Ruri v3)...");
  const testSummaries = [
    "TypeScriptのジェネリクスについて。型をパラメータとして渡せる仕組み。",
    "ReactのuseStateフックの使い方。状態管理の基本。",
    "SQLiteのFTS5について。組み込み全文検索エンジン。",
  ];
  const testBodies = [
    "TypeScriptのジェネリクスとは何ですか？型をパラメータとして渡せる仕組みです。",
    "ReactのuseStateフックの使い方は？const [state, setState] = useState(初期値) で状態管理できます。",
    "SQLiteのFTS5とは何ですか？SQLiteに組み込まれた全文検索エンジンです。",
  ];

  const startEmbed = Date.now();
  const vectors = await embedTexts(testSummaries);
  const embedTime = Date.now() - startEmbed;
  console.log(`  → ${vectors.length}件ベクトル化完了 (${embedTime}ms)`);
  console.log(
    `  → ベクトル次元数: ${vectors[0].length}`
  );

  // 3. DB保存テスト
  console.log("\n[3] DB保存テスト...");
  const insertMemory = db.prepare(`
    INSERT INTO memories (summary, body, company_name, project_name, session_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertVec = db.prepare(`
    INSERT INTO memories_vec (memory_id, embedding)
    VALUES (?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < testSummaries.length; i++) {
      const result = insertMemory.run(
        testSummaries[i],
        testBodies[i],
        "テスト株式会社",
        "/test/project",
        "test-session-001",
        new Date().toISOString()
      );
      insertVec.run(BigInt(result.lastInsertRowid), vectors[i]);
    }
  });
  insertAll();

  const count = db
    .prepare("SELECT COUNT(*) as cnt FROM memories")
    .get() as { cnt: number };
  console.log(`  → ${count.cnt}件保存完了`);

  const vecCount = db
    .prepare("SELECT COUNT(*) as cnt FROM memories_vec")
    .get() as { cnt: number };
  console.log(`  → memories_vec: ${vecCount.cnt}件`);
  db.close();

  // 4. 検索テスト
  console.log("\n[4] 検索テスト...");

  const queries = ["TypeScriptのジェネリクス", "React hooks", "全文検索"];

  for (const q of queries) {
    const startSearch = Date.now();
    const results = await searchMemories(q, { limit: 3 });
    const searchTime = Date.now() - startSearch;
    console.log(`\n  クエリ: "${q}" (${searchTime}ms)`);
    for (const r of results) {
      console.log(`    [score: ${r.score.toFixed(4)}] ${r.summary.substring(0, 60)}...`);
    }
  }

  // 5. テストデータ削除
  console.log("\n[5] テストデータクリーンアップ...");
  const dbClean = getDatabase();
  dbClean.exec("DELETE FROM memories_vec");
  dbClean.exec("DELETE FROM memories");
  dbClean.exec("DELETE FROM memories_fts");
  dbClean.close();
  console.log("  → クリーンアップ完了");

  console.log("\n=== 統合テスト完了 ===");
}

main().catch((err) => {
  console.error("統合テストエラー:", err);
  process.exit(1);
});
