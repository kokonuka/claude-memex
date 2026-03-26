import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { searchMemories } from "./searcher.js";
import { getDatabase } from "./database.js";
import { splitIntoChunks, summarizeText } from "./summarizer.js";
import { embedTexts } from "./embedder.js";
import { writeErrorLog } from "./logger.js";

// グローバル設定ファイルからAPIキーを読み取る
const globalEnvPath = join(homedir(), ".claude-memex", ".env");
if (existsSync(globalEnvPath)) {
  config({ path: globalEnvPath });
}

const server = new McpServer({
  name: "claude-memex",
  version: "1.0.0",
});

server.tool(
  "search_memory",
  `過去のClaude Codeセッションや業務コンテキストから関連する記憶を検索します。
ユーザーの質問に答える前に、過去の会話で関連する情報がないか積極的に検索してください。
フィルタ値（source, company_name, project_name）が不明な場合は、先にlist_filtersツールで選択肢を確認してから使ってください。
フィルタなしの全体検索は自由に実行してください。フィルタを使って絞り込む場合は、事前にユーザーに確認を取ってください。
注意: 検索結果は元データの一部（チャンク）である可能性があります。結果の文脈が不足している場合は、同じsource・timestampで追加検索すると全体の文脈が得られます。
特に以下の場合は必ずこのツールを使用してください：
- ユーザーが過去の会話や以前の作業について言及した場合
- ユーザーの好み・名前・所属など個人的な情報が必要な場合
- 現在のタスクに関連する過去の議論や決定事項があり得る場合
- 「前に話した」「以前の」「前回の」などの表現が含まれる場合`,
  {
    query: z.string().describe("検索クエリ"),
    project_name: z
      .string()
      .optional()
      .describe("特定プロジェクトに絞る場合のプロジェクト名"),
    company_name: z
      .string()
      .optional()
      .describe("特定の会社名に絞る場合"),
    source: z
      .string()
      .optional()
      .describe("データソースで絞る場合（例: claude-session, meeting, slack, email）"),
    date_from: z
      .string()
      .optional()
      .describe("検索対象の開始日（ISO 8601形式、例: 2025-01-01）"),
    date_to: z
      .string()
      .optional()
      .describe("検索対象の終了日（ISO 8601形式、例: 2025-12-31）"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("返す結果の最大件数"),
  },
  async ({ query, project_name, company_name, source, date_from, date_to, limit }) => {
    const results = await searchMemories(query, {
      projectName: project_name,
      companyName: company_name,
      source,
      dateFrom: date_from,
      dateTo: date_to,
      limit,
    });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "関連する記憶が見つかりませんでした。" }],
      };
    }

    const text = results
      .map(
        (r, i) =>
          `[${i + 1}] (score: ${r.score.toFixed(4)}, ${r.timestamp})\nProject: ${r.projectName}\nCompany: ${r.companyName}\nSource: ${r.source}\n概要: ${r.summary}\n本文: ${r.body}`
      )
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text }],
    };
  }
);

server.tool(
  "list_filters",
  `検索フィルタに指定可能な値の一覧を返します。
search_memoryツールを使う前に、まずこのツールで利用可能なフィルタ値を確認してください。`,
  {},
  async () => {
    const db = getDatabase();

    const sources = db
      .prepare("SELECT DISTINCT source FROM memories WHERE source != '' ORDER BY source")
      .all() as Array<{ source: string }>;

    const companyNames = db
      .prepare("SELECT DISTINCT company_name FROM memories WHERE company_name != '' ORDER BY company_name")
      .all() as Array<{ company_name: string }>;

    const projectNames = db
      .prepare("SELECT DISTINCT project_name FROM memories WHERE project_name != '' ORDER BY project_name")
      .all() as Array<{ project_name: string }>;

    db.close();

    const text = [
      `source: ${sources.map((r) => r.source).join(", ") || "(なし)"}`,
      `company_name: ${companyNames.map((r) => r.company_name).join(", ") || "(なし)"}`,
      `project_name: ${projectNames.map((r) => r.project_name).join(", ") || "(なし)"}`,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
    };
  }
);

server.tool(
  "ingest_document",
  `外部データ（会議録、Slackログ、メール等）をclaude-memexに取り込みます。
テキスト本文とメタデータを受け取り、意味単位でチャンク分割→要約→Embedding→DB保存を行います。
重要: このツールを実行する前に、メタデータ（source, company_name, project_name, timestamp）の値をユーザーに提示し、確認を取ってから実行してください。`,
  {
    text: z.string().describe("取り込むテキスト本文"),
    source: z
      .string()
      .describe("データの出所（例: meeting, slack, email, line, chatwork, notion, spreadsheet）"),
    company_name: z
      .string()
      .optional()
      .default("")
      .describe("会社名"),
    project_name: z
      .string()
      .optional()
      .default("")
      .describe("プロジェクト名"),
    timestamp: z
      .string()
      .optional()
      .default("")
      .describe("データの日時（ISO 8601形式）。未指定の場合は現在時刻"),
  },
  async ({ text, source, company_name, project_name, timestamp }) => {
    const ts = timestamp || new Date().toISOString();

    // 1. 意味単位でチャンク分割（Gemini）
    const chunks = await splitIntoChunks(text);

    // 2. 各チャンクを要約 → Embedding → DB保存
    const db = getDatabase();
    const insertMemory = db.prepare(`
      INSERT INTO memories (summary, body, company_name, project_name, session_id, timestamp, source)
      VALUES (?, ?, ?, ?, '', ?, ?)
    `);
    const insertVec = db.prepare(`
      INSERT INTO memories_vec (memory_id, embedding)
      VALUES (?, ?)
    `);

    let savedCount = 0;
    for (const chunk of chunks) {
      const summary = await summarizeText(chunk);
      const vectors = await embedTexts([summary]);
      const result = insertMemory.run(
        summary,
        chunk,
        company_name,
        project_name,
        ts,
        source
      );
      insertVec.run(BigInt(result.lastInsertRowid), vectors[0]);
      savedCount++;
    }

    db.close();

    return {
      content: [
        {
          type: "text",
          text: `${savedCount}件のチャンクを保存しました（source: ${source}）`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  writeErrorLog(err);
  console.error(err);
});
