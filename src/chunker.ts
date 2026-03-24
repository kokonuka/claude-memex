import { readFileSync } from "fs";

export interface Chunk {
  body: string;
  sessionId: string;
  projectPath: string;
  timestamp: string;
}

interface JONLEntry {
  type: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
}

function extractText(
  content: string | Array<{ type: string; text?: string }>
): string {
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("\n");
}

export function parseTranscript(transcriptPath: string): Chunk[] {
  const lines = readFileSync(transcriptPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim());

  const chunks: Chunk[] = [];
  let currentUserMessage: string | null = null;
  let sessionId = "";
  let projectPath = "";
  let lastTimestamp = "";

  for (const line of lines) {
    let entry: JONLEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.sessionId) sessionId = entry.sessionId;
    if (entry.cwd) projectPath = entry.cwd;
    if (entry.timestamp) lastTimestamp = entry.timestamp;

    if (entry.type === "user" && entry.message?.role === "user") {
      currentUserMessage = extractText(entry.message.content);
    }

    if (entry.type === "assistant" && entry.message?.role === "assistant") {
      const assistantMessage = extractText(entry.message.content);
      if (currentUserMessage && assistantMessage) {
        const body = `ユーザー: ${currentUserMessage}\nアシスタント: ${assistantMessage}`;
        chunks.push({ body, sessionId, projectPath, timestamp: lastTimestamp });
        currentUserMessage = null;
      }
    }
  }

  return chunks;
}
