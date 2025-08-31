import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { NotionClient } from './utils/notion-client.js';
import { MarkdownConverter } from './utils/markdown-converter.js';
import { generateFrontmatter, generateFileName } from './utils/frontmatter-generator.js';
import type { NotionPage, SyncStats } from './types/notion.js';

// ES Modules環境での__dirname取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトルート
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 環境変数読み込み
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') });

// コンテンツディレクトリ
const CONTENT_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'blog');

/**
 * Notion同期管理クラス
 */
class NotionSyncManager {
  private notionClient: NotionClient;
  private markdownConverter: MarkdownConverter;
  private stats: SyncStats;
  private results: { title: string; status: 'created' | 'updated' | 'skipped'; file: string }[] = [];

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
  async run(): Promise<void> {
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
      this.printResultsTable();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ 同期処理中にエラーが発生しました:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * 環境変数の検証
   */
  private validateEnvironment(): void {
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
  private async testConnection(): Promise<void> {
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
  private async ensureContentDirectory(): Promise<void> {
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
  private async fetchPublishedPosts(): Promise<NotionPage[]> {
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
  private async processPosts(posts: NotionPage[]): Promise<void> {
    console.log('⚙️  記事の変換処理を開始します...\n');
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const progress = `[${i + 1}/${posts.length}]`;
      
      try {
        await this.processPost(post, progress);
        this.stats.success++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ ${progress} 記事処理でエラー:`, errorMessage);
        this.stats.errors++;
      }
    }
  }

  /**
   * 個別記事を処理
   */
  private async processPost(post: NotionPage, progress: string): Promise<void> {
    const title = this.extractPostTitle(post);
    console.log(`${progress} 処理中: "${title}"`);
    
    try {
      // frontmatter生成
      const frontmatter = generateFrontmatter(post);
      
      // Markdownコンテンツ生成（画像処理を含む）
      const markdown = await this.markdownConverter.convertToMarkdown(post.id, title);
      
      // ファイル名生成
      const fileName = generateFileName(title);
      const filePath = path.join(CONTENT_DIR, fileName);
      
      // 既存ファイルチェック
      const isUpdate = await this.fileExists(filePath);

      // スキップ判定（Notion側更新なし）
      if (isUpdate) {
        const existingMeta = await this.readExistingFrontmatter(filePath);
        const notionUpdatedISO = new Date(post.last_edited_time).toISOString();
        const notionUpdatedDate = notionUpdatedISO.split('T')[0];
        const existingUpdated = existingMeta.updatedAt || existingMeta.updatedDate;
        if (existingUpdated) {
          const normalizedExistingISO = /T/.test(String(existingUpdated))
            ? new Date(existingUpdated).toISOString()
            : null;
          const isSame = normalizedExistingISO
            ? normalizedExistingISO === notionUpdatedISO
            : String(existingUpdated) === notionUpdatedDate;
          if (isSame) {
            this.stats.skipped++;
            this.results.push({ title, status: 'skipped', file: path.basename(filePath) });
            console.log(`  ↪︎ スキップ（Notion更新なし）: ${path.basename(filePath)}`);
            return; // 上書きなし
          }
        }
      }
      
      // ファイル保存
      const fullContent = frontmatter + '\n' + markdown;
      await fs.writeFile(filePath, fullContent, 'utf8');
      
      if (isUpdate) {
        this.stats.updated++;
        console.log(`  ✅ 更新: ${fileName}`);
        this.results.push({ title, status: 'updated', file: fileName });
      } else {
        this.stats.created++;
        console.log(`  ✅ 新規作成: ${fileName}`);
        this.results.push({ title, status: 'created', file: fileName });
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ エラー: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 記事タイトルを抽出
   */
  private extractPostTitle(post: NotionPage): string {
    return this.notionClient.extractPostTitle(post);
  }

  /**
   * ファイルの存在確認
   */
  private async fileExists(filePath: string): Promise<boolean> {
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
  private printSummary(): void {
    console.log('\n📊 同期結果サマリー');
    if (this.stats.errors > 0) {
      console.log('❌ 同期に失敗しました！');
    } else {
      console.log('🎉 同期が正常に完了しました！');
    }
  }

  /**
   * 既存Markdownのフロントマターを読み取る
   */
  private async readExistingFrontmatter(filePath: string): Promise<Record<string, any>> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return {};
      const yaml = match[1];
      const obj: Record<string, any> = {};
      for (const line of yaml.split('\n')) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        obj[key] = value;
      }
      return obj;
    } catch {
      return {};
    }
  }

  /**
   * 結果テーブル（Markdown）
   */
  private printResultsTable(): void {
    const items = this.results;
    console.log('Notion Sync Summary');
    console.log('| Status | Title |');
    console.log('| :----- | :---- |');
    for (const r of items) {
      console.log(`| ${r.status} | ${r.title} |`);
    }
  }

  /**
   * リトライ機能付きの関数実行
   */
  async withRetry<T>(
    fn: () => Promise<T>, 
    maxRetries: number = 3, 
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
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
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// エラーハンドリング
process.on('uncaughtException', (error: Error) => {
  console.error('❌ 未処理の例外:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('❌ 未処理のPromise拒否:', reason);
  process.exit(1);
});

// メイン実行
const syncManager = new NotionSyncManager();
syncManager.run();
