# GeminiによるSlug自動生成

## ステータス

- 状態: Implemented
- 最終更新: 2026-07-19
- 関連: `docs/inprogress/AI_TAGGING_PLAN.md`

## 実装仕様

- モデルは`gemini-2.5-flash-lite`を使用する。
- Memosで`Study.Log`が付いた新規記事の初回同期時だけGeminiを呼び出す。
- タイトルとMarkdown本文から、英小文字・数字・ハイフンによる3〜60文字のslugを生成する。
- アプリ側でも正規化・形式検証・重複検査を行う。
- 確定slugはMarkdownの`slug`へ保存し、再同期では再生成しない。
- 既存記事は現在のファイル名またはfrontmatterのslugを維持し、リネームしない。
- APIキー未設定、タイムアウト、HTTPエラー、応答検証失敗時は、タイトルとNotion IDによる決定的なslugへフォールバックする。

## 設定

- `GEMINI_API_KEY`: Gemini APIキー
- `GEMINI_MODEL`: 既定`gemini-2.5-flash-lite`
- `GEMINI_TIMEOUT_MS`: 既定`15000`
- `GEMINI_MAX_INPUT_CHARS`: 既定`30000`

実装本体は`scripts/utils/ai-metadata-generator.ts`、同期処理は`scripts/sync-notion.ts`にある。
