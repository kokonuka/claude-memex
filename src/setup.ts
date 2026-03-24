#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { exec } from "child_process";
import { join } from "path";
import { homedir } from "os";

const ENV_DIR = join(homedir(), ".claude-memex");
const ENV_PATH = join(ENV_DIR, ".env");

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;
  exec(command);
}

function question(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function loadExistingEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1]] = match[2];
      }
    }
  }
  return env;
}

function saveEnv(env: Record<string, string>): void {
  if (!existsSync(ENV_DIR)) {
    mkdirSync(ENV_DIR, { recursive: true });
  }
  const content = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(ENV_PATH, content + "\n", "utf-8");
}

async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const env = loadExistingEnv();

  console.log("\n=== claude-memex セットアップ ===\n");

  // Gemini API Key
  console.log("1. Gemini APIキーを設定します（要約生成用）");
  console.log("   ブラウザでGoogle AI Studioを開きます...\n");
  openBrowser("https://aistudio.google.com/apikey");

  const geminiKey = await question(rl, "Gemini APIキーを貼り付けてください: ");
  if (geminiKey) {
    env["GEMINI_API_KEY"] = geminiKey;
    console.log("✓ Gemini APIキーを保存しました\n");
  } else {
    console.log("スキップしました\n");
  }

  // OpenAI API Key
  console.log("2. OpenAI APIキーを設定します（Whisper文字起こし用）");
  console.log("   ブラウザでOpenAIダッシュボードを開きます...\n");
  openBrowser("https://platform.openai.com/api-keys");

  const openaiKey = await question(rl, "OpenAI APIキーを貼り付けてください: ");
  if (openaiKey) {
    env["OPENAI_API_KEY"] = openaiKey;
    console.log("✓ OpenAI APIキーを保存しました\n");
  } else {
    console.log("スキップしました\n");
  }

  saveEnv(env);
  console.log(`✅ セットアップ完了！設定は ${ENV_PATH} に保存されました\n`);

  rl.close();
}

main().catch((err) => {
  console.error("セットアップ中にエラーが発生しました:", err);
  process.exit(1);
});
