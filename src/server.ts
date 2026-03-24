#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchMemories } from "./searcher.js";

const server = new McpServer({
  name: "claude-memex",
  version: "1.0.0",
});

server.tool(
  "search_memory",
  `過去のClaude Codeセッションから関連する記憶を検索します。
ユーザーの質問に答える前に、過去の会話で関連する情報がないか積極的に検索してください。
特に以下の場合は必ずこのツールを使用してください：
- ユーザーが過去の会話や以前の作業について言及した場合
- ユーザーの好み・名前・所属など個人的な情報が必要な場合
- 現在のタスクに関連する過去の議論や決定事項があり得る場合
- 「前に話した」「以前の」「前回の」などの表現が含まれる場合`,
  {
    query: z.string().describe("検索クエリ"),
    project_path: z
      .string()
      .optional()
      .describe("特定プロジェクトに絞る場合のパス"),
    company_name: z
      .string()
      .optional()
      .describe("特定の会社名に絞る場合"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("返す結果の最大件数"),
  },
  async ({ query, project_path, company_name, limit }) => {
    const results = await searchMemories(query, {
      projectPath: project_path,
      companyName: company_name,
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
          `[${i + 1}] (score: ${r.score.toFixed(4)}, ${r.timestamp})\nProject: ${r.projectPath}\nCompany: ${r.companyName}\n概要: ${r.summary}\n本文: ${r.body}`
      )
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
