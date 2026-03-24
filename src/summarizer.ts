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

const SYSTEM_PROMPT = `あなたはテキストの要約を生成するアシスタントです。
与えられたテキストを1〜2文で簡潔に要約してください。
要約は、後からこの内容を検索するときに使うキーワードやフレーズを含めてください。
要約のみを出力し、それ以外は何も出力しないでください。`;

export async function summarizeText(text: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: text,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 200,
    },
  });
  return response.text?.trim() ?? "";
}

export async function summarizeTexts(texts: string[]): Promise<string[]> {
  const summaries: string[] = [];
  for (const text of texts) {
    const summary = await summarizeText(text);
    summaries.push(summary);
  }
  return summaries;
}
