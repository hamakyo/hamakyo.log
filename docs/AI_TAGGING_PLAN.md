### AI 自動タグ付け 機能実装計画書

## ステータス

- 状態: In Progress
- 最終更新: 2025-08-31
- 関連PR: なし

Notion 同期スクリプトに生成 AI を組み込み、記事内容からタグを自動生成する計画。

#### 1. 目的
- 工数削減: 手動タグ付けの手間をなくす。
- 品質向上: 内容に適した一貫性のあるタグ付けを行う。
- 発見性向上: 関連記事の横断をしやすくする。

#### 2. ワークフロー
1. GitHub Actions が `sync-notion.ts` を実行
2. Notion から記事データを取得
3. タイトル・本文を AI に送信（任意の最大トークンまで）
4. AI がタグ候補（配列）を返す
5. フロントマターへ `tags` として出力し保存
6. `src/content/blog/` にファイルを保存

#### 3. 技術選定
- モデル: OpenAI または Google Gemini など（小型で十分）
- クライアント: 公式 Node ライブラリ
- キー管理: `.env.local` と GitHub Secrets に保存

#### 4. 実装詳細
- プロンプト例:
  - 役割・制約・出力形式を明記。出力は JSON 配列のみ（例: `["タグ1","タグ2","タグ3"]`）。
- スクリプト構成:
  - `scripts/utils/ai-tag-generator.ts` を新規作成
  - `scripts/sync-notion.ts` から呼び出し、検証後にフロントマターへ反映
- 環境変数:
  - `AI_TAGS_ENABLED=true|false`（既定: false）
  - `AI_PROVIDER=openai|gemini`（既定: 空）
  - `AI_API_KEY=...`
  - `AI_MODEL_TAGS=...`
- エラー時の方針: 失敗時はタグ無しで継続。ログのみに記録。

#### 5. タスク分割
1. モデル選定と Secrets 登録
2. `ai-tag-generator.ts` 実装（API 呼び出しと応答検証）
3. `sync-notion.ts` 統合（フロントマターへの出力）
4. `.env.example` と docs 更新
5. 手動/CI テスト（成功・失敗・タイムアウト）

#### 6. 費用目安
- 投稿数が少ない前提では月額は小額。無料枠に収まる可能性が高い。
