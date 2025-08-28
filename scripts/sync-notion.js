#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { NotionClient } from './utils/notion-client.js';
import { MarkdownConverter } from './utils/markdown-converter.js';
import { generateFrontmatter, generateFileName } from './utils/frontmatter-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'blog');

/**
 * Notion to Markdown 同期メインスクリプト
 */
class NotionSyncManager {
  constructor() {
    this.notionClient = new NotionClient();
    this.markdownConverter = new MarkdownConverter(this.notionClient);
    this.stats = {
      total: 0,
      success: 0,
      skipped: 0,
      errors: 0,
      created: 0,
      updated: 0
    };
  }

  /**
   * 同期処理を実行
   */
  async run() {
    console.log('🚀 Notion to Markdown 同期を開始します...\n');
    
    try {
      // 環境変数チェック
      this.validateEnvironment();
      
      // Notion接続テスト
      await this.testConnection();
      
      // データベース構造確認
      await this.notionClient.inspectDatabase();
      
      // コンテンツディレクトリの確認
      await this.ensureContentDirectory();
      
      // 公開済み記事を取得
      const posts = await this.fetchPublishedPosts();
      
      // 各記事を処理
      await this.processPosts(posts);
      
      // 結果レポート
      this.printSummary();
      
    } catch (error) {
      console.error('❌ 同期処理中にエラーが発生しました:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * 環境変数の検証
   */
  validateEnvironment() {
    console.log('🔍 環境変数をチェック中...');
    
    const requiredEnvVars = ['NOTION_TOKEN', 'NOTION_DATABASE_ID'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(
        `環境変数が不足しています: ${missingVars.join(', ')}\n` +
        '.env.local ファイルを確認してください。'
      );
    }
    
    console.log('✅ 環境変数チェック完了\n');
  }

  /**
   * Notion接続テスト
   */
  async testConnection() {
    console.log('🔌 Notion接続をテスト中...');
    
    const isConnected = await this.notionClient.testConnection();
    if (!isConnected) {
      throw new Error('Notionへの接続に失敗しました。トークンとデータベースIDを確認してください。');
    }
    
    console.log('✅ Notion接続テスト完了\n');
  }

  /**
   * コンテンツディレクトリの確認・作成
   */
  async ensureContentDirectory() {
    try {
      await fs.access(CONTENT_DIR);
    } catch {
      console.log(`📁 コンテンツディレクトリを作成します: ${CONTENT_DIR}`);
      await fs.mkdir(CONTENT_DIR, { recursive: true });
    }
  }

  /**
   * 公開済み記事を取得
   */
  async fetchPublishedPosts() {
    console.log('📖 公開済み記事を取得中...');
    
    // 環境変数から必須タグを取得
    const requiredTags = process.env.NOTION_REQUIRED_TAGS 
      ? process.env.NOTION_REQUIRED_TAGS.split(',').map(tag => tag.trim())
      : [];
    
    if (requiredTags.length > 0) {
      console.log(`🏷️  フィルタータグ: ${requiredTags.join(', ')}`);
    }
    
    const posts = await this.notionClient.getPublishedPosts(requiredTags);
    this.stats.total = posts.length;
    
    const tagInfo = requiredTags.length > 0 ? ` (タグフィルター適用)` : '';
    console.log(`✅ ${posts.length}件の記事を取得しました${tagInfo}\n`);
    
    return posts;
  }

  /**
   * 記事リストを処理
   */
  async processPosts(posts) {
    console.log('⚙️  記事の変換処理を開始します...\n');
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const progress = `[${i + 1}/${posts.length}]`;
      
      try {
        await this.processPost(post, progress);
        this.stats.success++;
      } catch (error) {
        console.error(`❌ ${progress} 記事処理でエラー:`, error.message);
        this.stats.errors++;
      }
    }
  }

  /**
   * 個別記事を処理
   */
  async processPost(post, progress) {
    const title = this.extractPostTitle(post);
    console.log(`${progress} 処理中: "${title}"`);
    
    try {
      // frontmatter生成
      const frontmatter = generateFrontmatter(post);
      
      // Markdownコンテンツ生成
      const markdown = await this.markdownConverter.convertToMarkdown(post.id);
      
      // ファイル名生成
      const fileName = generateFileName(title);
      const filePath = path.join(CONTENT_DIR, fileName);
      
      // 既存ファイルチェック
      const isUpdate = await this.fileExists(filePath);
      
      // ファイル保存
      const fullContent = frontmatter + '\n' + markdown;
      await fs.writeFile(filePath, fullContent, 'utf8');
      
      if (isUpdate) {
        this.stats.updated++;
        console.log(`  ✅ 更新: ${fileName}`);
      } else {
        this.stats.created++;
        console.log(`  ✅ 新規作成: ${fileName}`);
      }
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 記事タイトルを抽出
   */
  extractPostTitle(post) {
    const properties = post.properties;
    
    if (properties.Title && properties.Title.title && properties.Title.title.length > 0) {
      return properties.Title.title[0].plain_text;
    }
    
    if (properties.Name && properties.Name.title && properties.Name.title.length > 0) {
      return properties.Name.title[0].plain_text;
    }
    
    return 'Untitled';
  }

  /**
   * ファイルの存在確認
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 結果サマリーを出力
   */
  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 同期結果サマリー');
    console.log('='.repeat(50));
    console.log(`総記事数: ${this.stats.total}`);
    console.log(`成功: ${this.stats.success}`);
    console.log(`新規作成: ${this.stats.created}`);
    console.log(`更新: ${this.stats.updated}`);
    console.log(`エラー: ${this.stats.errors}`);
    console.log(`スキップ: ${this.stats.skipped}`);
    console.log('='.repeat(50));
    
    if (this.stats.errors > 0) {
      console.log('\n⚠️  エラーが発生しました。上記のエラーメッセージを確認してください。');
    } else {
      console.log('\n🎉 同期が正常に完了しました！');
    }
  }

  /**
   * リトライ機能付きの関数実行
   */
  async withRetry(fn, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          console.log(`  ⏳ リトライします... (${i + 1}/${maxRetries})`);
          await this.sleep(delay * (i + 1)); // 指数バックオフ
        }
      }
    }
    
    throw lastError;
  }

  /**
   * スリープ関数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('未処理のPromise拒否:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未処理の例外:', error);
  process.exit(1);
});

// メイン処理実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const syncManager = new NotionSyncManager();
  syncManager.run();
}