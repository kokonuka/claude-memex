# claude-memex

Claude Code用の長期記憶ツール。セッション終了時に会話を自動保存し、過去の記憶をMCP経由で検索できる。

## 仕組み

```
セッション終了 → Hook発火 → JSONL読込 → チャンク分割 → Gemini APIで要約生成 → Ruri v3でベクトル化 → SQLite保存
                                                                                                              ↓
セッション開始 → Claude Codeが質問 → MCP経由で検索 → FTS5 + ベクトル + RRF → 関連記憶を返す
```

- **要約生成**: Gemini API（Flash-Lite、無料枠で利用可能）
- **ベクトル化**: Ruri v3（日本語特化、768次元、ローカル実行・トークン消費ゼロ）
- **検索**: キーワード検索(FTS5) + ベクトル検索(sqlite-vec) + RRF統合 + 時間減衰(半減期30日)
- **保存先**: `~/.claude-memex/memory.db`（1ファイル、プロジェクト横断検索可能）

### チャンク構造

各記憶は **summary（要約）** と **body（本文）** の2つで構成されます。

- **summary**: Gemini APIが生成した1〜2文の要約。ベクトル検索のアンカーとして機能
- **body**: 会話の実テキスト。FTS5キーワード検索と結果表示用

summaryだけをベクトル化することで、検索クエリとのマッチ精度を高めています。

## セットアップ

### 1. インストール

```bash
npm install -g claude-memex
```

### 2. APIキー設定

Gemini APIキー（要約生成用）を設定します。ブラウザが自動で開くので、キーを取得して貼り付けてください。

```bash
claude-memex-setup
```

### 3. MCP登録

MCPサーバーとして登録します。スコープは環境に合わせて変更してください。

```bash
# 例: 全プロジェクト共通で使う場合
claude mcp add-json claude-memex '{"type":"stdio","command":"claude-memex"}' --scope user
```

### 4. Hook登録

SessionEndフックを登録します。設定ファイルやスコープは環境に合わせてください。

```bash
# 例: ~/.claude/settings.json に追加する場合
"SessionEnd": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "claude-memex-hook"
      }
    ]
  }
]
```

### 5. 会社名の設定（任意）

記憶に会社名を付与しておくことで、検索時に `company_name` パラメータで絞り込みが可能になります。複数社の案件を並行して扱う場合に、関係ない記憶が混ざるのを防げます。

各プロジェクトのルートに `.env` を作成:

```
COMPANY_NAME=あなたの会社名
```

### 6. CLAUDE.md への記述（推奨）

MCPツールを登録しただけでは、Claude Codeが自発的にclaude-memexを使うとは限りません。`CLAUDE.md`（グローバルまたはプロジェクト）に以下のような指示を追記しておくと、過去の記憶を積極的に参照するようになります。

```
過去の会話や以前の決定事項に関連しそうな場合は、まずmcp（claude-memex）で検索すること
```

これにより、「前に話した○○」「以前決めた方針」といった場面で、過去のセッションから情報を引き出してくれるようになります。

## MCPツール

### search_memory

過去のClaude Codeセッションから関連する記憶を検索する。

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| query | string | ✅ | 検索クエリ |
| project_path | string | - | プロジェクトで絞り込み |
| company_name | string | - | 会社名で絞り込み |
| limit | number | - | 最大件数（デフォルト: 10） |

## 技術スタック

| 技術 | 用途 |
|------|------|
| Gemini API (Flash-Lite) | 要約生成 |
| Ruri v3 (ONNX) | 日本語埋め込みモデル |
| better-sqlite3 | SQLiteドライバ |
| sqlite-vec | ベクトル検索 |
| FTS5 | 全文検索 |
| MCP SDK | Claude Codeとの連携 |

## 動作確認

保存されたデータを確認するコマンド:

```bash
sqlite3 ~/.claude-memex/memory.db "SELECT id, substr(summary, 1, 80), timestamp FROM memories ORDER BY id DESC LIMIT 10;"
```

## データのリセット

記憶データをすべて削除してリセットするには、データベースファイルを削除します。次回のセッション終了時に自動で再作成されます。

```bash
rm ~/.claude-memex/memory.db
```

## v1.x からのアップデート

v2.0 ではDBスキーマが変更されました（`text` カラム → `summary` + `body` カラム）。アップデート後は以下を実行してDBを再作成してください。

```bash
rm ~/.claude-memex/memory.db
```

次回のセッション終了時に新しいスキーマで自動作成されます。

## 初回実行時の注意

初回はRuri v3モデル（約1.2GB）のダウンロードが発生します。2回目以降はキャッシュされます。
