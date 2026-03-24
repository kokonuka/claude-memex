import { GoogleGenAI, Type } from "@google/genai";

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

const SYSTEM_PROMPT = `あなたはテキストの要約を生成するアシスタントです。
複数のテキストが「---CHUNK N---」で区切られて与えられます。
それぞれのテキストを1〜2文で簡潔に要約してください。
要約は、後からこの内容を検索するときに使うキーワードやフレーズを含めてください。
入力と同じ数の要約を、同じ順序で配列として出力してください。
要約は必ず日本語で出力してください。`;

const BATCH_SIZE = 20;
const RATE_LIMIT_WINDOW = 10; // 10リクエストごとに待機
const RATE_LIMIT_WAIT_MS = 60_000; // 1分待機

async function summarizeBatch(ai: GoogleGenAI, batch: string[]): Promise<string[]> {
  const prompt = batch
    .map((t, i) => `---CHUNK ${i + 1}---\n${t}`)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      maxOutputTokens: batch.length * 200,
    },
  });

  const parsed: string[] = JSON.parse(response.text ?? "[]");
  return batch.map((t, i) => parsed[i] ?? "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function summarizeTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const ai = getClient();
  const results: string[] = [];
  let requestCount = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (requestCount > 0 && requestCount % RATE_LIMIT_WINDOW === 0) {
      await sleep(RATE_LIMIT_WAIT_MS);
    }
    const batch = texts.slice(i, i + BATCH_SIZE);
    const summaries = await summarizeBatch(ai, batch);
    results.push(...summaries);
    requestCount++;
  }

  return results;
}
