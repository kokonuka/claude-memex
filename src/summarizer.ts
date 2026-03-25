import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY が設定されていません。claude-memex-setup を実行してください。"
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

const SYSTEM_PROMPT = `あなたは会話ログから重要な情報を抽出するアシスタントです。
1つのセッション（会話全体）が与えられます。
会話に含まれる重要な情報を、話題ごとに箇条書きで漏れなく抽出してください。
抽出する観点:
- 決定事項（何をどうすることに決めたか）
- 技術的な事実や制約（判明したこと、仕様、制限）
- 結論や方針（議論の結果どうなったか）
- ユーザーの好みやスタイル（指示の傾向、フィードバック）
- 試行錯誤の過程（何を試して何がダメだったか、最終的にどうしたか）
- 使用したツール・サービス・ライブラリ名
注意:
- すべての話題を箇条書きに含めること。漏れがないことが最も重要
- 会話の流れ（「ユーザーが質問し、アシスタントが回答した」）ではなく、内容そのものを書くこと
- 検索時に役立つキーワードや固有名詞を含めること
- 要約は必ず日本語で出力すること`;

const CHUNK_SPLIT_PROMPT = `あなたはテキストを意味のまとまりごとに分割するアシスタントです。
与えられたテキストを、意味的に独立したチャンクに分割してください。

ルール:
- 各チャンクは1つの話題やトピックを含む意味のまとまりにすること
- 各チャンクは800トークン以下を目安にすること
- チャンク間で内容が重複しないこと
- 分割結果はJSON配列として出力すること（各要素は分割されたテキスト文字列）
- JSON以外の文字を含めないこと

出力形式:
["チャンク1のテキスト", "チャンク2のテキスト", ...]`;

export async function splitIntoChunks(text: string): Promise<string[]> {
  // 短いテキストはそのまま返す
  if (text.length <= 1600) {
    return [text];
  }

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: text,
    config: {
      systemInstruction: CHUNK_SPLIT_PROMPT,
      maxOutputTokens: 8192,
    },
  });

  const responseText = response.text ?? "";
  try {
    const chunks = JSON.parse(responseText) as string[];
    // 上限を超えたチャンクは再帰的に分割
    const result: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length > 1600) {
        const subChunks = await splitIntoChunks(chunk);
        result.push(...subChunks);
      } else {
        result.push(chunk);
      }
    }
    return result;
  } catch {
    // パース失敗時は元テキストをそのまま返す
    return [text];
  }
}

export async function summarizeText(text: string): Promise<string> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: text,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 8192,
    },
  });

  return response.text ?? "";
}
