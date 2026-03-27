# claude-memex

[![npm version](https://img.shields.io/npm/v/claude-memex.svg)](https://www.npmjs.com/package/claude-memex)
[![GitHub stars](https://img.shields.io/github/stars/kokonuka/claude-memex.svg?style=social)](https://github.com/kokonuka/claude-memex)

Long-term memory for Claude Code via MCP.
Automatically saves session conversations and enables semantic search across past sessions.
Also supports ingesting external data (meeting notes, Slack logs, emails, etc).

> **GitHub**: https://github.com/kokonuka/claude-memex — Star us if you find it useful!

---

Claude Code用の長期記憶ツール。セッション終了時に会話を自動保存し、過去の記憶をMCP経由で検索できる。外部データ（会議録、Slackログ、メール等）の取り込みにも対応。

## セットアップ

### 1. インストール

npmでグローバルにインストールします。これにより `claude-memex`、`claude-memex-hook`、`claude-memex setup` の3つのコマンドが使えるようになります。

```bash
npm install -g claude-memex
```

### 2. Gemini APIキーの設定

会話の要約生成に Gemini API（Flash-Lite）を使います。有料プラン（従量課金）の Gemini APIキーを用意してください（無料枠は1日20リクエストの制限があり、通常利用で上限に達します）。

以下のコマンドでAPIキーを登録します。

```bash
claude-memex setup
```

### 3. MCP登録

Claude Code が過去の記憶を検索できるように、MCPサーバーとして登録します。スコープや設定ファイルは環境に合わせてください。

```bash
# 例
claude mcp add-json claude-memex '{"type":"stdio","command":"claude-memex"}' --scope user
```

### 4. Hook登録

セッション終了時に会話を自動保存するために、Claude Code の SessionEnd Hook を登録します。スコープや設定ファイルは環境に合わせてください。

```json
// 例: ~/.claude/settings.json
"SessionEnd": [
  {
    "type": "command",
    "command": "claude-memex-hook"
  }
]
```

### 5. 会社名・プロジェクト名の設定（任意）

記憶に会社名やプロジェクト名を付与しておくと、検索時に絞り込めます。各プロジェクトのルートに `.env` を作成してください。

```
COMPANY_NAME=あなたの会社名
PROJECT_NAME=プロジェクト名
```

`PROJECT_NAME` を省略した場合、プロジェクトのディレクトリ名が自動的に使われます。

### 6. CLAUDE.md への記述（推奨）

MCPツールを登録しただけでは、Claude Code が自発的に過去の記憶を検索するとは限りません。`~/.claude/CLAUDE.md`（グローバル）に以下の指示を追記しておくと、積極的に参照するようになります。

```
過去の会話や以前の決定事項に関連しそうな場合は、まずmcp（claude-memex）で検索すること
```

### 初回実行時の注意

初回のセッション終了時に、Ruri v3モデル（約1.2GB）の自動ダウンロードが発生するため時間がかかります。2回目以降はキャッシュされます。

## MCPツール

### search_memory

過去のClaude Codeセッションや業務コンテキストから関連する記憶を検索する。

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| query | string | ✅ | 検索クエリ |
| project_name | string | - | プロジェクト名で絞り込み |
| company_name | string | - | 会社名で絞り込み |
| source | string | - | データソースで絞り込み（例: claude-session, meeting, slack） |
| date_from | string | - | 検索対象の開始日（ISO 8601形式） |
| date_to | string | - | 検索対象の終了日（ISO 8601形式） |
| limit | number | - | 最大件数（デフォルト: 10） |

### list_filters

検索フィルタに指定可能な値（source, company_name, project_name）の一覧を返す。search_memoryのフィルタ値が不明な場合に使う。

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| なし | - | - | - |

### ingest_document

外部データ（会議録、Slackログ、メール等）を取り込む。テキストを意味単位でチャンク分割→要約→Embedding→DB保存する。

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| text | string | ✅ | 取り込むテキスト本文 |
| source | string | ✅ | データの出所（例: meeting, slack, email） |
| company_name | string | - | 会社名 |
| project_name | string | - | プロジェクト名 |
| timestamp | string | - | データの日時（ISO 8601形式、デフォルト: 現在時刻） |

## データ確認

### Web Viewer（推奨）

ブラウザでデータを閲覧・検索できるビューアーを起動できます。

```bash
claude-memex viewer
```

`http://localhost:8642` でテーブル閲覧・SQLクエリ実行が可能です。

### コマンドライン

```bash
sqlite3 -header -column ~/.claude-memex/memory.db "SELECT id, substr(summary, 1, 50) AS summary, substr(body, 1, 50) AS body, source, timestamp FROM memories ORDER BY id DESC LIMIT 10;"
```

## 仕組み

```
セッション終了 → Hook発火 → JSONL読込 → Gemini APIで要約生成 → Ruri v3でベクトル化 → SQLite保存
                                                                                                              ↓
セッション開始 → Claude Codeが質問 → MCP経由で検索 → FTS5 + ベクトル + RRF → 関連記憶を返す
                                                                                                              ↑
外部データ → ingest_document → チャンク分割(Gemini) → 要約生成 → ベクトル化 → SQLite保存
```

- **要約生成**: Gemini API（Flash-Lite）
- **チャンク分割**: Gemini API（意味単位で再帰的に分割）
- **ベクトル化**: Ruri v3（日本語特化、768次元、ローカル実行・トークン消費ゼロ）
- **検索**: キーワード検索(FTS5) + ベクトル検索(sqlite-vec) + RRF統合 + 時間減衰(半減期180日)
- **保存先**: `~/.claude-memex/memory.db`（1ファイル、プロジェクト横断検索可能）

### データ構造

各レコードは **summary（要約）** と **body（本文）** の2つで構成されます。

- **summary**: Gemini APIが抽出した要約（決定事項・技術的事実・結論など）。ベクトル検索のアンカーとして機能
- **body**: 元テキスト。FTS5キーワード検索と結果表示用
- **source**: データの出所（`claude-session`, `meeting`, `slack`, `email`等）

Claude Codeセッションは1セッション=1レコード、外部データはチャンク分割されて複数レコードになります。summaryだけをベクトル化することで、検索クエリとのマッチ精度を高めています。

## 技術スタック

| 技術 | 用途 |
|------|------|
| Gemini API (Flash-Lite) | 要約生成・チャンク分割 |
| Ruri v3 (ONNX) | 日本語埋め込みモデル |
| better-sqlite3 | SQLiteドライバ |
| sqlite-vec | ベクトル検索 |
| FTS5 | 全文検索 |
| MCP SDK | Claude Codeとの連携 |

## v1.x からのアップデート

v2.0 ではDBスキーマが変更されました（`text` カラム → `summary` + `body` カラム）。アップデート後、次回のDB接続時に自動でマイグレーションされます。既存データの `text` は `body` に移行され、`summary` は空になります（新規保存分から要約が生成されます）。
## データのリセット

記憶データをすべて削除してリセットするには、データベースファイルを削除します。次回のセッション終了時に自動で再作成されます。

```bash
rm ~/.claude-memex/memory.db
```

## トラブルシューティング

記憶の保存に失敗した場合、エラーログが `~/.claude-memex/error.log` に記録されます。macOS通知で「保存に失敗しました」と表示されたときは、以下で確認できます。

```bash
cat ~/.claude-memex/error.log
```

直近のエラーだけ見たい場合:

```bash
tail -5 ~/.claude-memex/error.log
```
