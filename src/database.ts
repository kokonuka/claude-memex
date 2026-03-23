import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DB_DIR = join(homedir(), ".claude-memex");
const DB_PATH = join(DB_DIR, "memory.db");

export function getDatabase(): Database.Database {
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  sqliteVec.load(db);

  // メインテーブル（テキスト・メタデータ保存用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      project_path TEXT DEFAULT '',
      session_id TEXT DEFAULT '',
      timestamp TEXT DEFAULT ''
    )
  `);

  // FTS5全文検索用テーブル
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      text,
      content='memories',
      content_rowid='id'
    )
  `);

  // sqlite-vec ベクトル検索用テーブル（Ruri v3 310M: 768次元）
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
      memory_id integer primary key,
      embedding float[768] distance_metric=cosine
    )
  `);

  // FTS5をメインテーブルと同期するトリガー
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, text) VALUES (new.id, new.text);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', old.id, old.text);
    END
  `);

  return db;
}
