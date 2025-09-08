# AI によるファイル名/スラグ自動生成 実装計画書

## ステータス

- 状態: In Progress
- 最終更新: 2025-08-31
- 関連PR: なし

関連: `docs/AI_TAGGING_PLAN.md`

## 1. 目的
- 適切で読みやすい英数字スラグ（ファイル名）を自動生成し、URL 一貫性と検索性を高める。
- 日本語など非ラテン文字タイトルでも、空や不適切なファイル名にならないようにする。

## 2. 提案方針
- モード選択で段階導入する。
  - disabled: AI を使わない（既存の正規化とフォールバックのみ）。
  - fallback: 正規化後が不適切（空/短すぎ/記号のみ）の場合に限り AI で候補を生成する。
  - always: 毎回 AI でスラグ候補を生成する。
- 初期導入は `fallback` を採用し、コストと非決定性を抑える。

## 3. スラグ規約
- 文字種: `[a-z0-9-]` のみ、小文字、連続ハイフン禁止、先頭末尾ハイフン禁止。
- 長さ: 12〜60 文字目安（超過時は切り詰め）。
- 一意性: 既存重複は `-<短ハッシュ>` を付与（Notion ページ ID 先頭 6 文字など）。
- 既定フォールバック: `untitled-YYYYMMDD`（AI が使えない/失敗時も前進させる）。
- 確定保存: 生成スラグはフロントマター `slug:` に保存し再同期時に再利用。

## 4. 仕様（I/O と環境変数）
- フロントマターに `slug: string` を追加（任意 → 保存後は固定）。
- 環境変数（Actions/ローカル両対応）
  - `AI_SLUG_MODE`: `disabled|fallback|always`（既定: `fallback`）
  - `AI_PROVIDER`: `openai|gemini` など（既定: 空 = 無効）
  - `AI_API_KEY`: 各プロバイダの API キー
  - `AI_MODEL_SLUG`: 文字列モデル名（小型で十分）
  - `AI_TEMPERATURE`: 0.2 など低め（省略可）

## 5. 実装詳細
- 新規: `scripts/utils/slug-generator.ts`
  - `generateDeterministic(title): string` 既存正規化 + ローマ字化（将来拡張）
  - `generateWithAI(title, tags?): Promise<string>` 制約付きプロンプトで 1 候補のみ返す
  - `ensureUnique(slug): string` 既存衝突時に `-<短ハッシュ>` 付与
- 既存改修: `scripts/sync-notion.ts`
  - 記事ごとに `slug` を決定し、フロントマターへ出力。
  - 既存ファイル名のスラグと異なる場合はリネームし、Summary に `renamed: old → new` を追加。
- 既存改修: `scripts/utils/frontmatter-generator.ts`
  - `generateFrontmatter()` に `slug`（あれば）を出力。

## 6. プロンプト指針（例）
- システム: 「あなたはブログ URL スラグ生成器。出力は JSON で key は `slug` のみ。制約: 英小文字数字とハイフン、12〜60 文字、意味を要約、固有名詞短縮可、個人情報禁止。」
- ユーザー(JSON): `{ "title": "行動に繋がる技術文書の書き方メモ", "tags": ["study.log"], "lang": "ja" }`
- 期待出力(JSON): `{ "slug": "actionable-tech-writing" }`
- 不正文字や長さ超過はクライアント側で最終正規化・切り詰めする。

## 7. エラーハンドリング / タイムアウト
- API 失敗・タイムアウト時はフォールバック `untitled-YYYYMMDD` を使用し処理継続。
- 生成結果が規約違反ならローカルで修正。修正不能ならフォールバック。

## 8. セキュリティ / コスト
- API キーは GitHub Secrets と `.env.local` に格納。ログに出力しない。
- `fallback` モードでは呼び出し頻度が低く、月間コストはごく小さい見込み。

## 9. CI 連携
- Actions は `AI_*` 環境変数を注入。Summary に `created/updated/skipped/renamed` を Markdown 表で出力。

## 10. タスク分割
1. 環境変数・Secrets 設計（docs と `.env.example` 追記）
2. `slug-generator.ts` 実装（正規化・AI 呼び出し・衝突回避）
3. `sync-notion.ts` 統合（frontmatter への `slug` 追加、リネーム記録）
4. Summary 出力に `renamed` 行を追加
5. 手動/CI テスト（AI 無効時・fallback 時の動作確認）

## 11. 完了条件
- `AI_SLUG_MODE=fallback` で実行時、非ラテン文字タイトルでも適切なスラグが生成され、重複や規約違反がない。
- 生成スラグがフロントマターに保存され、再同期で変動しない。
- Summary にリネーム履歴が表示される。
