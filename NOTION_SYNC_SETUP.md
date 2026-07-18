# Notion自動同期セットアップ

## GitHub Secretsの設定

GitHubリポジトリで以下のシークレットを設定してください：

### 設定手順
1. GitHubリポジトリページへ移動
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** をクリック
4. 以下の3つのシークレットを設定：

### 必要なシークレット

| シークレット名 | 値 | 説明 |
|---|---|---|
| `NOTION_TOKEN` | `ntn_xxxxxxxxxxxxxxxxx` | Notion Integration Token (.env.localから取得) |
| `NOTION_DATABASE_ID` | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | MemosデータベースID (.env.localから取得) |
| `GEMINI_API_KEY` | `AIza...` | Google AI Studioで作成したGemini APIキー |

## Notion側の運用

`All`配下のMemosとTagsを次のように使います。

1. Memos内で記事を作成する
2. 下書き中は`INBOX`を付けたままでよい
3. ブログへ同期する記事に`Study.Log`を付ける
4. Tags DBでは、ブログに表示してよい分類タグだけ`ブログ表示`を有効にする

`Study.Log`は同期トリガー、`INBOX`は日常運用の内部タグです。どちらも公開タグにはなりません。`Published`タグやStatusプロパティは不要です。

新規記事の初回同期時だけGemini 2.5 Flash-Liteが次を生成します。

- 英語kebab-caseのslug
- `ブログ表示`が有効な既存タグから0〜4個の公開タグ
- 既存タグでは表現できない場合の新規タグ候補

slugと公開タグはMarkdownのfrontmatterへ固定保存します。再同期時はAIを呼ばず、タイトルを変更してもURLと公開タグを維持します。新規タグ候補はActions Summaryに表示するだけで、Tags DBへは自動追加しません。

## 動作確認

### 手動実行
1. GitHubリポジトリの **Actions** タブ
2. **Notion Sync** ワークフロー選択
3. **Run workflow** で手動実行

### 自動実行
- **6時間周期**で自動実行されます
- 新しい記事があれば自動コミット・プッシュ

## ワークフロー機能

- ✅ **定期実行**: 6時間毎
- ✅ **手動実行**: いつでも実行可能
- ✅ **自動コミット**: 変更があれば自動プッシュ
- ✅ **実行サマリー**: 結果をGitHub上で確認
- ✅ **Geminiメタデータ生成**: 新規記事だけslug・公開タグを生成
- ✅ **安全なフォールバック**: Gemini失敗時も同期を継続
- ✅ **デバッグモード**: 手動実行時に選択可能

## トラブルシューティング

### よくある問題
1. **シークレット未設定**: Actions実行時にエラー
2. **権限不足**: `GITHUB_TOKEN` の書き込み権限確認
3. **依存関係エラー**: `pnpm-lock.yaml` の不整合、または Corepack/pnpm のバージョン不一致
4. **公開タグが空**: Tags DBで候補タグの`ブログ表示`を有効化

### ログ確認
GitHub ActionsのログでSync実行結果を確認できます。

## 設定変更

### 実行頻度の変更
`.github/workflows/sync-notion.yml` の `cron` 設定を編集：

```yaml
# 例：6時間毎
- cron: '0 */6 * * *'

# 例：1日1回（午前9時）
- cron: '0 9 * * *'
```

### プロパティ名や同期タグを変更する場合
ローカルでは`.env.local`、GitHub Actionsでは同名のRepository Variablesを設定します。既定値は`NOTION_SYNC_TAG=Study.Log`、`NOTION_PUBLIC_TAG_PROPERTY=ブログ表示`、`NOTION_INTERNAL_TAGS=Study.Log,INBOX`です。Geminiモデルは`GEMINI_MODEL`で変更できます。
