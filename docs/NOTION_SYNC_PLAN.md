# Notion to Markdown 同期スクリプト実装計画書

## ステータス

- 状態: Done
- 完了日: 2025-08-31
- 関連PR: #6

## 📋 プロジェクト概要
- **目的**: NotionデータベースからMarkdownファイルを生成し、Astroブログ(`src/content/blog/`)に同期
- **実行方法**: `npm run sync-notion` コマンドによる手動実行
- **対象ファイル**: `.md`形式（既存のfrontmatter形式に準拠）

## 🎯 技術要件

### 依存関係追加
```json
{
  "@notionhq/client": "^2.2.15",
  "notion-to-md": "^3.1.1",
  "dotenv": "^16.3.1"
}
```

### 環境変数
```bash
# .env.local
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxx-xxx-xxx
```

## 📁 ファイル構成

```
project/
├── scripts/
│   ├── sync-notion.js          # メインスクリプト
│   └── utils/
│       ├── notion-client.js    # Notion API クライアント
│       ├── markdown-converter.js # Markdown変換ロジック
│       └── frontmatter-generator.js # frontmatter生成
├── package.json                # sync-notionスクリプト追加
└── .env.local                  # 環境変数
```

## 🔧 実装仕様

### 1. **scripts/sync-notion.js** (メインファイル)
```javascript
// 実装内容：
// - 環境変数読み込み
// - Notionデータベースクエリ
// - 各ページのMarkdown変換
// - ファイル保存処理
// - エラーハンドリング・ログ出力
```

### 2. **frontmatter形式** (既存形式に準拠)
```yaml
---
title: "記事タイトル"
description: "記事の説明"
pubDate: "2025-08-27"
heroImage:
  src: "/images/hero.jpg"  # オプション
  alt: "代替テキスト"
tags: ["tag1", "tag2"]     # オプション
---
```

### 3. **ファイル命名規則**
- Notionページタイトルをslug化
- 例: "新しい記事" → `新しい記事.md`
- 既存ファイルは上書き（更新日時チェック）

### 4. **package.json スクリプト追加**
```json
{
  "scripts": {
    "sync-notion": "node scripts/sync-notion.js"
  }
}
```

## 🚦 実行フロー

1. **環境変数チェック** → エラー時は処理停止
2. **Notionデータベース取得** → 公開済み記事のみ
3. **各ページ処理**:
   - Markdown変換
   - frontmatter生成
   - ファイル名決定
   - 保存処理
4. **結果レポート** → 成功/失敗/更新件数表示

## 📊 エラーハンドリング

- **API制限**: リトライ機能付き
- **ファイル書き込みエラー**: 権限確認・パス検証
- **変換エラー**: 個別ページスキップ・ログ出力
- **ネットワークエラー**: 再試行 (最大3回)

## ✅ 完了条件

- [ ] 依存関係インストール完了
- [ ] 環境変数設定完了
- [ ] スクリプトファイル作成完了
- [ ] 実際のNotionページで動作確認完了
- [ ] エラーケースの動作確認完了
- [ ] README.mdに使用方法記載完了

## 🔄 使用方法

```bash
# 1. 環境変数設定
cp .env.example .env.local
# NOTION_TOKEN と NOTION_DATABASE_ID を設定

# 2. 依存関係インストール
npm install

# 3. 同期実行
npm run sync-notion
```

## 📝 メモ

- 初回実装はシンプルに、段階的に機能拡張
- エラーログは詳細に、成功時は簡潔に
- 既存のブログ投稿フォーマットとの整合性を重視
