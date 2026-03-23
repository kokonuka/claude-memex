# claude-memex

Claude Code用の長期記憶ツール。セッション終了時に会話を自動保存し、過去の記憶をMCP経由で検索できる。

## 仕組み

```
セッション終了 → Hook発火 → JSONL読込 → Q&Aチャンク分割 → ベクトル化 → SQLite保存
                                                                                ↓
セッション開始 → Claude Codeが質問 → MCP経由で検索 → FTS5 + ベクトル + RRF → 関連記憶を返す
```

- **ベクトル化**: Ruri v3（日本語特化、768次元、ローカル実行・トークン消費ゼロ）
- **検索**: キーワード検索(FTS5) + ベクトル検索(sqlite-vec) + RRF統合 + 時間減衰(半減期30日)
- **保存先**: `~/.claude-memex/memory.db`（1ファイル、プロジェクト横断検索可能）

## セットアップ

### 1. インストール

```bash
npm install -g claude-memex
```

### 2. MCP登録

MCPサーバーとして登録します。スコープは環境に合わせて変更してください。

```bash
# 例: 全プロジェクト共通で使う場合
claude mcp add-json claude-memex '{"type":"stdio","command":"claude-memex"}' --scope user
```

### 3. Hook登録

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

### 4. 会社名の設定（任意）

各プロジェクトのルートに `.env` を作成:

```
COMPANY_NAME=あなたの会社名
```

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
| Ruri v3 (ONNX) | 日本語埋め込みモデル |
| better-sqlite3 | SQLiteドライバ |
| sqlite-vec | ベクトル検索 |
| FTS5 | 全文検索 |
| MCP SDK | Claude Codeとの連携 |

## 動作確認

保存されたデータを確認するコマンド:

```bash
sqlite3 ~/.claude-memex/memory.db "SELECT id, substr(text, 1, 80), timestamp FROM memories ORDER BY id DESC LIMIT 10;"
```

## 初回実行時の注意

初回はRuri v3モデル（約1.2GB）のダウンロードが発生します。2回目以降はキャッシュされます。
