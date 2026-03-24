import { parseTranscript } from "../chunker.js";
import { homedir } from "os";
import { join } from "path";
import { readdirSync } from "fs";

// 最新のJONLファイルを1つ取ってテスト
// .claude/projects/ 配下の最初のプロジェクトディレクトリを使用
const projectsRoot = join(homedir(), ".claude/projects");
const projectDirs = readdirSync(projectsRoot).filter((f) => !f.startsWith("."));
const projectDir = join(projectsRoot, projectDirs[0]!);
const files = readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
const testFile = join(projectDir, files[0]!);

console.log(`Testing with: ${testFile}`);
const chunks = parseTranscript(testFile);
console.log(`Found ${chunks.length} chunks\n`);

for (const chunk of chunks.slice(0, 3)) {
  console.log(`--- Session: ${chunk.sessionId} ---`);
  console.log(`Project: ${chunk.projectPath}`);
  console.log(`Time: ${chunk.timestamp}`);
  console.log(chunk.body.substring(0, 200));
  console.log();
}
