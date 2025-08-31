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
| `NOTION_DATABASE_ID` | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | NotionデータベースID (.env.localから取得) |
| `NOTION_REQUIRED_TAGS` | `Study.Log` | 同期対象タグ（カンマ区切りで複数可） |

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
- ✅ **デバッグモード**: 手動実行時に選択可能

## トラブルシューティング

### よくある問題
1. **シークレット未設定**: Actions実行時にエラー
2. **権限不足**: `GITHUB_TOKEN` の書き込み権限確認
3. **依存関係エラー**: `package-lock.json` の不整合

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

### フィルタータグの変更
GitHub Secretsの `NOTION_REQUIRED_TAGS` を更新
