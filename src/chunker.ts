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

interface Turn {
  body: string;
  timestamp: string;
}

export function parseTranscript(transcriptPath: string): Chunk[] {
  const lines = readFileSync(transcriptPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim());

  const turns: Turn[] = [];
  let currentUserMessage: string | null = null;
  let assistantParts: string[] = [];
  let sessionId = "";
  let projectPath = "";
  let lastTimestamp = "";

  function flushTurn() {
    if (currentUserMessage) {
      const assistantMessage = assistantParts.join("\n");
      if (assistantMessage) {
        const body = `ユーザー: ${currentUserMessage}\nアシスタント: ${assistantMessage}`;
        turns.push({ body, timestamp: lastTimestamp });
      }
    }
    currentUserMessage = null;
    assistantParts = [];
  }

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
      flushTurn();
      const text = extractText(entry.message.content);
      // メタ情報や中断メッセージを除外
      if (
        text.startsWith("This session is being continued from a previous conversation") ||
        text.startsWith("[Request interrupted by user")
      ) {
        currentUserMessage = null;
      } else {
        currentUserMessage = text;
      }
    }

    if (entry.type === "assistant" && entry.message?.role === "assistant") {
      const text = extractText(entry.message.content);
      if (text) {
        assistantParts.push(text);
      }
    }
  }

  flushTurn();

  if (turns.length === 0) return [];

  // セッション全体を1レコードにまとめる
  const body = turns.map((t) => t.body).join("\n\n");
  const timestamp = turns[turns.length - 1].timestamp;

  return [{ body, sessionId, projectPath, timestamp }];
}
