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

  // メインテーブル（要約・本文・メタデータ保存用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL,
      body TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      project_path TEXT DEFAULT '',
      session_id TEXT DEFAULT '',
      timestamp TEXT DEFAULT ''
    )
  `);

  // v1スキーマ（textカラム）からの自動マイグレーション
  const columns = db.pragma("table_info(memories)") as { name: string }[];
  const hasText = columns.some((c) => c.name === "text");
  const hasSummary = columns.some((c) => c.name === "summary");
  if (hasText && !hasSummary) {
    db.exec(`ALTER TABLE memories ADD COLUMN summary TEXT NOT NULL DEFAULT ''`);
    db.exec(`ALTER TABLE memories ADD COLUMN body TEXT NOT NULL DEFAULT ''`);
    db.exec(`UPDATE memories SET body = text WHERE body = ''`);
    db.exec(`ALTER TABLE memories DROP COLUMN text`);
  }

  // FTS5全文検索用テーブル（summary + body の両方を検索対象）
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      summary,
      body,
      content='memories',
      content_rowid='id'
    )
  `);

  // sqlite-vec ベクトル検索用テーブル（Ruri v3 310M: 768次元）
  // summaryのembeddingのみ保存
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
      memory_id integer primary key,
      embedding float[768] distance_metric=cosine
    )
  `);

  // FTS5をメインテーブルと同期するトリガー
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, summary, body) VALUES (new.id, new.summary, new.body);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, summary, body) VALUES('delete', old.id, old.summary, old.body);
    END
  `);

  return db;
}
