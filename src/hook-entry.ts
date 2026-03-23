#!/usr/bin/env node
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// stdinからHookの入力JSONを読み取る
async function readStdin(): Promise<string> {
  return new Promise((res) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => res(data));
  });
}

async function main() {
  const input = JSON.parse(await readStdin());
  const { transcript_path, session_id, cwd } = input;

  if (!transcript_path) {
    process.exit(0);
  }

  // タイムアウト1.5秒に収めるため、保存処理はバックグラウンドで起動
  const worker = resolve(__dirname, "save-worker.js");
  const child = spawn(
    "node",
    [worker, transcript_path, session_id, cwd],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  process.exit(0);
}

main();
