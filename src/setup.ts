#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { homedir } from "os";

const ENV_DIR = join(homedir(), ".claude-memex");
const ENV_PATH = join(ENV_DIR, ".env");

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

  const geminiKey = await question(rl, "Gemini APIキーを入力してください: ");
  if (geminiKey) {
    env["GEMINI_API_KEY"] = geminiKey;
    saveEnv(env);
    console.log(`\n✅ 保存しました (${ENV_PATH})\n`);
  } else {
    console.log("\nキーが入力されませんでした\n");
  }

  rl.close();
}

main().catch((err) => {
  console.error("セットアップ中にエラーが発生しました:", err);
  process.exit(1);
});
