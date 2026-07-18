# Geminiによる公開タグ自動生成

## ステータス

- 状態: Implemented
- 最終更新: 2026-07-19
- 関連: `docs/inprogress/AI_SLUG_PLAN.md`

## 実装仕様

- Memosの`Study.Log`は同期トリガーとして使用する。
- `INBOX`と`Study.Log`は内部タグとして維持し、ブログへ表示しない。
- Tags DBの`ブログ表示`チェックボックスが有効なタグだけをGeminiへ選択肢として渡す。
- 新規記事の初回同期時だけ、記事本文に合う公開タグを0〜4個選択する。
- GeminiはJSON Schemaに従って`slug`、`publicTags`、`newTagSuggestions`を返す。
- アプリ側で許可リストとの照合、内部タグ除外、重複除去を行う。
- 公開タグはMarkdownの`tags`へ保存し、再同期では再生成しない。
- 新規タグ候補はGitHub Actions Summaryへ表示するだけで、Notionへ自動作成・自動Relation追加しない。
- API失敗時は公開タグを空配列として同期を継続する。

## Notion運用

1. Memosで記事を作成する。
2. 同期対象の記事に`Study.Log`を付ける。`INBOX`は残してよい。
3. Tags DBで、ブログに出してよい分類タグだけ`ブログ表示`を有効にする。

`Published`タグやStatusプロパティは使用しない。
