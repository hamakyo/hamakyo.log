import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { NotionClient } from './utils/notion-client.js';
import { MarkdownConverter } from './utils/markdown-converter.js';
import {
  generateFrontmatter,
  generateSlug,
  normalizeSlug
} from './utils/frontmatter-generator.js';
import {
  GeminiMetadataGenerator,
  type ArticleMetadata,
  type PublicTagOption
} from './utils/ai-metadata-generator.js';
import type { NotionPage, SyncStats } from './types/notion.js';

interface ExistingContent {
  filePath: string;
  meta: Record<string, any>;
}

export interface SyncResult {
  title: string;
  status: 'created' | 'updated' | 'skipped';
  file: string;
  metadataSource: 'gemini' | 'existing' | 'fallback';
  newTagSuggestions?: string[];
}

// ES Modules環境での__dirname取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトルート
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 環境変数読み込み
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') });

// コンテンツディレクトリ
const CONTENT_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'blog');

type SyncNotionClient = Pick<
  NotionClient,
  | 'testConnection'
  | 'inspectDatabase'
  | 'getSyncTargetPosts'
  | 'extractPostTitle'
  | 'getPublicTagCatalog'
>;

type SyncMarkdownConverter = Pick<MarkdownConverter, 'convertToMarkdown'>;
type SyncMetadataGenerator = Pick<GeminiMetadataGenerator, 'generate'>;

export interface NotionSyncManagerOptions {
  notionClient?: SyncNotionClient;
  markdownConverter?: SyncMarkdownConverter;
  metadataGenerator?: SyncMetadataGenerator;
  contentDir?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Notion同期管理クラス
 */
export class NotionSyncManager {
  private notionClient: SyncNotionClient;
  private markdownConverter: SyncMarkdownConverter;
  private metadataGenerator: SyncMetadataGenerator;
  private contentDir: string;
  private env: NodeJS.ProcessEnv;
  private stats: SyncStats;
  private results: SyncResult[] = [];
  private existingByNotionId = new Map<string, ExistingContent>();
  private existingByTitle = new Map<string, ExistingContent[]>();
  private existingBySlug = new Map<string, ExistingContent>();
  private publicTagCatalogPromise?: Promise<PublicTagOption[]>;

  constructor(options: NotionSyncManagerOptions = {}) {
    this.env = options.env ?? process.env;
    this.contentDir = options.contentDir ?? CONTENT_DIR;
    this.notionClient = options.notionClient ?? new NotionClient({ env: this.env });
    this.markdownConverter = options.markdownConverter
      ?? new MarkdownConverter(this.notionClient as NotionClient);
    this.metadataGenerator = options.metadataGenerator ?? new GeminiMetadataGenerator();
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
  async run(): Promise<SyncStats> {
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

      // 既存記事をNotion ID・タイトル・slugで索引化
      await this.loadExistingContentIndex();
      
      // Study.Logタグ付きの同期対象記事を取得
      const posts = await this.fetchSyncTargetPosts();
      
      // 各記事を処理
      await this.processPosts(posts);

      // 結果レポート
      this.printSummary();
      this.printResultsTable();
      return { ...this.stats };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ 同期処理中にエラーが発生しました:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * 環境変数の検証
   */
  private validateEnvironment(): void {
    console.log('🔍 環境変数をチェック中...');
    
    const requiredEnvVars = ['NOTION_TOKEN', 'NOTION_DATABASE_ID'];
    const missingVars = requiredEnvVars.filter(varName => !this.env[varName]);
    
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
      await fs.access(this.contentDir);
    } catch {
      console.log(`📁 コンテンツディレクトリを作成します: ${this.contentDir}`);
      await fs.mkdir(this.contentDir, { recursive: true });
    }
  }

  /** Study.Logなどの同期タグが付いた記事を取得する。 */
  private async fetchSyncTargetPosts(): Promise<NotionPage[]> {
    const syncTag = this.env.NOTION_SYNC_TAG?.trim() || 'Study.Log';
    console.log(`📖 「${syncTag}」タグ付き記事を取得中...`);

    const posts = await this.notionClient.getSyncTargetPosts(syncTag);
    this.stats.total = posts.length;

    console.log(`✅ ${posts.length}件の記事を取得しました\n`);
    
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
      const existing = this.findExistingContent(post.id, title);
      const existingSlug = existing
        ? normalizeSlug(String(existing.meta.slug || path.basename(existing.filePath, '.md')))
          || generateSlug(title, post.id)
        : undefined;
      const existingTags = existing && Array.isArray(existing.meta.tags)
        ? existing.meta.tags.map(String)
        : [];
      let markdown: string | undefined;
      let metadata: ArticleMetadata | undefined;

      if (!existing) {
        // Geminiは新規記事の初回同期時だけ呼び出す。結果はfrontmatterへ固定する。
        markdown = await this.markdownConverter.convertToMarkdown(post.id, title);
        metadata = await this.metadataGenerator.generate({
          title,
          markdown,
          notionId: post.id,
          allowedTags: await this.getPublicTagCatalog(),
          internalTags: this.getInternalTags()
        });
        if (metadata.warning) console.warn(`  ⚠️  ${metadata.warning}`);
        console.log(`  🤖 メタデータ: ${metadata.source} / slug=${metadata.slug}`);
        if (metadata.newTagSuggestions.length > 0) {
          console.log(`  💡 新規タグ候補: ${metadata.newTagSuggestions.join(', ')}`);
        }
      }

      const slug = existingSlug
        || this.ensureUniqueSlug(metadata?.slug || generateSlug(title, post.id), post.id);
      const tags = existing ? existingTags : metadata?.publicTags ?? [];
      const fileName = existing ? path.basename(existing.filePath) : `${slug}.md`;
      const filePath = existing?.filePath || path.join(this.contentDir, fileName);
      
      // 既存ファイルチェック
      const isUpdate = Boolean(existing) || await this.fileExists(filePath);

      // スキップ判定（Notion側更新なし）
      if (isUpdate) {
        const existingMeta = existing?.meta || await this.readExistingFrontmatter(filePath);
        const notionUpdatedISO = new Date(post.last_edited_time).toISOString();
        const notionUpdatedDate = notionUpdatedISO.split('T')[0];
        const existingUpdated = existingMeta.updatedAt || existingMeta.updatedDate;
        const metadataIsCurrent = this.metadataIsCurrent(existingMeta, post.id, slug, tags);
        if (existingUpdated) {
          const normalizedExistingISO = /T/.test(String(existingUpdated))
            ? new Date(existingUpdated).toISOString()
            : null;
          const isSame = normalizedExistingISO
            ? normalizedExistingISO === notionUpdatedISO
            : String(existingUpdated) === notionUpdatedDate;
          if (isSame && metadataIsCurrent) {
            this.stats.skipped++;
            this.results.push({
              title,
              status: 'skipped',
              file: path.basename(filePath),
              metadataSource: 'existing'
            });
            console.log(`  ↪︎ スキップ（Notion更新なし）: ${path.basename(filePath)}`);
            return; // 上書きなし
          }
        }
      }

      // Markdownコンテンツ生成（画像処理を含む）
      markdown ??= await this.markdownConverter.convertToMarkdown(post.id, title);

      // frontmatter生成。notionIdで記事を識別し、slugと公開タグは初回同期後に固定する。
      const frontmatter = generateFrontmatter(post, { slug, tags });
      
      // ファイル保存
      const fullContent = frontmatter + '\n' + markdown;
      await fs.writeFile(filePath, fullContent, 'utf8');
      this.registerExistingContent(filePath, {
        ...(existing?.meta ?? {}),
        title,
        notionId: post.id,
        slug,
        tags
      });
      
      if (isUpdate) {
        this.stats.updated++;
        console.log(`  ✅ 更新: ${fileName}`);
        this.results.push({
          title,
          status: 'updated',
          file: fileName,
          metadataSource: 'existing'
        });
      } else {
        this.stats.created++;
        console.log(`  ✅ 新規作成: ${fileName}`);
        this.results.push({
          title,
          status: 'created',
          file: fileName,
          metadataSource: metadata?.source ?? 'fallback',
          newTagSuggestions: metadata?.newTagSuggestions
        });
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

  private async loadExistingContentIndex(): Promise<void> {
    const entries = await fs.readdir(this.contentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(this.contentDir, entry.name);
      const meta = await this.readExistingFrontmatter(filePath);
      this.registerExistingContent(filePath, meta);
    }
  }

  private getPublicTagCatalog(): Promise<PublicTagOption[]> {
    this.publicTagCatalogPromise ??= this.notionClient.getPublicTagCatalog()
      .then(catalog => {
        console.log(`  🏷️  ブログ表示可能なタグ: ${catalog.length}件`);
        if (catalog.length === 0) {
          console.warn('  ⚠️  Tags DBで「ブログ表示」を有効にしたタグがないため公開タグは空になります');
        }
        return catalog;
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`  ⚠️  公開タグ候補の取得に失敗しました: ${message}`);
        return [];
      });
    return this.publicTagCatalogPromise;
  }

  private getInternalTags(): string[] {
    return (this.env.NOTION_INTERNAL_TAGS || 'Study.Log,INBOX')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  private registerExistingContent(filePath: string, meta: Record<string, any>): void {
    const content = { filePath, meta };
    if (meta.notionId) this.existingByNotionId.set(String(meta.notionId), content);

    if (meta.title) {
      const title = String(meta.title);
      const entries = this.existingByTitle.get(title) ?? [];
      const withoutSameFile = entries.filter(item => item.filePath !== filePath);
      this.existingByTitle.set(title, [...withoutSameFile, content]);
    }

    const slug = String(meta.slug || path.basename(filePath, '.md')).toLowerCase();
    if (slug) this.existingBySlug.set(slug, content);
  }

  private findExistingContent(notionId: string, title: string): ExistingContent | undefined {
    const byId = this.existingByNotionId.get(notionId);
    if (byId) return byId;

    // 初回移行時のみ、旧記事をタイトルで対応付けてnotionIdを付与する。
    const byTitle = this.existingByTitle.get(title) ?? [];
    if (byTitle.length === 1) return byTitle[0];
    if (byTitle.length > 1) {
      console.warn(`  ⚠️  同名の既存記事が複数あるため新規記事として扱います: "${title}"`);
    }
    return undefined;
  }

  private ensureUniqueSlug(slug: string, notionId: string, existingPath?: string): string {
    const normalized = normalizeSlug(slug) || generateSlug('', notionId);
    const owner = this.existingBySlug.get(normalized);
    if (!owner || owner.filePath === existingPath || owner.meta.notionId === notionId) {
      return normalized;
    }

    const compactId = notionId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'post';
    for (const length of [8, 12, 16, compactId.length]) {
      const candidate = `${normalized}-${compactId.slice(0, length)}`;
      const candidateOwner = this.existingBySlug.get(candidate);
      if (!candidateOwner || candidateOwner.meta.notionId === notionId) return candidate;
    }

    throw new Error(`slugの一意性を確保できませんでした: ${normalized}`);
  }

  private metadataIsCurrent(
    existingMeta: Record<string, any>,
    notionId: string,
    slug: string,
    tags: string[]
  ): boolean {
    const existingTags = Array.isArray(existingMeta.tags)
      ? existingMeta.tags.map(String).map(tag => tag.toLowerCase()).sort()
      : [];
    const desiredTags = tags.map(tag => tag.toLowerCase()).sort();

    return String(existingMeta.notionId || '') === notionId
      && String(existingMeta.slug || '') === slug
      && JSON.stringify(existingTags) === JSON.stringify(desiredTags);
  }

  /**
   * 結果サマリーを出力
   */
  private printSummary(): void {
    console.log('\n# 📊 同期結果サマリー\n');
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
        const rawValue = line.slice(idx + 1).trim();
        try {
          obj[key] = JSON.parse(rawValue);
        } catch {
          obj[key] = rawValue;
        }
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
    console.log('\n# Notion Sync Summary\n');
    console.log('| Status | Title | File | Metadata |');
    console.log('| :----- | :---- | :--- | :------- |');
    for (const r of items) {
      console.log(`| ${r.status} | ${escapeTableCell(r.title)} | ${r.file} | ${r.metadataSource} |`);
      if (r.newTagSuggestions?.length) {
        console.log(`\n> 💡 ${escapeTableCell(r.title)} の新規タグ候補: ${r.newTagSuggestions.join(', ')}`);
      }
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

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && import.meta.url === pathToFileURL(entryPoint).href;
}

if (isMainModule()) {
  process.on('uncaughtException', (error: Error) => {
    console.error('❌ 未処理の例外:', error.message);
    process.exitCode = 1;
  });

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ 未処理のPromise拒否:', reason);
    process.exitCode = 1;
  });

  const syncManager = new NotionSyncManager();
  syncManager.run().catch(() => {
    process.exitCode = 1;
  });
}
