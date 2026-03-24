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
