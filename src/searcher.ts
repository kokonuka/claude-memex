import { getDatabase } from "./database.js";
import { embedQuery } from "./embedder.js";

interface SearchResult {
  id: number;
  summary: string;
  body: string;
  companyName: string;
  projectName: string;
  sessionId: string;
  timestamp: string;
  source: string;
  score: number;
}

// RRF: 順位からスコアを算出して統合
function reciprocalRankFusion(
  keywordRanks: Map<number, number>,
  vectorRanks: Map<number, number>,
  k: number = 60
): Map<number, number> {
  const scores = new Map<number, number>();

  for (const [id, rank] of keywordRanks) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (rank + k));
  }
  for (const [id, rank] of vectorRanks) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (rank + k));
  }

  return scores;
}

// 時間減衰: 半減期180日
function applyTimeDecay(score: number, timestamp: string): number {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halfLife = 180;
  const decay = Math.pow(0.5, ageDays / halfLife);
  return score * decay;
}

export async function searchMemories(
  query: string,
  options?: {
    projectName?: string;
    companyName?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }
): Promise<SearchResult[]> {
  const limit = options?.limit ?? 10;
  const db = getDatabase();

  // 1. キーワード検索 (FTS5: summary + body の両方を検索)
  let ftsQuery = `SELECT rowid, rank FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`;
  const ftsResults = db.prepare(ftsQuery).all(query, limit * 2) as Array<{
    rowid: number;
    rank: number;
  }>;

  const keywordRanks = new Map<number, number>();
  ftsResults.forEach((row, i) => keywordRanks.set(row.rowid, i + 1));

  // 2. ベクトル検索 (sqlite-vec: summaryのembeddingと比較)
  const queryVector = await embedQuery(query);
  const vecResults = db
    .prepare(
      `SELECT memory_id, distance
       FROM memories_vec
       WHERE embedding MATCH ?
         AND k = ?`
    )
    .all(queryVector, limit * 2) as Array<{
    memory_id: number;
    distance: number;
  }>;

  const vectorRanks = new Map<number, number>();
  vecResults.forEach((row, i) => vectorRanks.set(row.memory_id, i + 1));

  // 3. RRFで統合
  const rrfScores = reciprocalRankFusion(keywordRanks, vectorRanks);

  // 4. スコア上位のIDを取得してメタデータを引く
  const allIds = [...rrfScores.keys()];
  if (allIds.length === 0) {
    db.close();
    return [];
  }

  const placeholders = allIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, summary, body, company_name, project_name, session_id, timestamp, source
       FROM memories WHERE id IN (${placeholders})`
    )
    .all(...allIds) as Array<{
    id: number;
    summary: string;
    body: string;
    company_name: string;
    project_name: string;
    session_id: string;
    timestamp: string;
    source: string;
  }>;

  // 5. 時間減衰を適用してスコア最終化
  const results: SearchResult[] = rows
    .map((row) => ({
      id: row.id,
      summary: row.summary,
      body: row.body,
      companyName: row.company_name,
      projectName: row.project_name,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      source: row.source ?? "claude-session",
      score: applyTimeDecay(rrfScores.get(row.id) ?? 0, row.timestamp),
    }))
    .filter((r) => {
      if (options?.projectName && r.projectName !== options.projectName)
        return false;
      if (options?.companyName && r.companyName !== options.companyName)
        return false;
      if (options?.source && r.source !== options.source)
        return false;
      if (options?.dateFrom && r.timestamp < options.dateFrom)
        return false;
      if (options?.dateTo && r.timestamp > options.dateTo)
        return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  db.close();
  return results;
}
