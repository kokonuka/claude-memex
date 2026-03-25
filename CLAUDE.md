# Rules

## Versioning
- バージョニングはセマンティックバージョニングに従う
- バグ修正・小さな改善 → パッチ (例: 2.2.0 → 2.2.1)
- 新機能追加 → マイナー (例: 2.2.1 → 2.3.0)
- 破壊的変更 → メジャー (例: 2.3.0 → 3.0.0)
- バージョンは直前のバージョンから連番で上げること。飛ばさない

## Commands
- `npm run build` — TypeScriptビルド
- `npm publish` — npmレジストリに公開
- `claude-memex viewer` — DBビューアー起動

## ローカル動作確認の手順
1. `npm run build` — ビルド
2. `npm link` — ローカルのビルド結果をグローバルに反映
3. 動作確認
4. `npm unlink -g claude-memex` — リンク解除
5. `npm install -g claude-memex` — レジストリ版に戻す
