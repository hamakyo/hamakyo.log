import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import type { 
  NotionPage, 
  DatabaseQueryResponse, 
  NotionRelation 
} from '../types/notion.js';

dotenv.config({ path: '.env.local' });

export class NotionClient {
  private notion: Client;
  private databaseId: string;

  constructor() {
    const token = process.env.NOTION_TOKEN;
    const dbId = process.env.NOTION_DATABASE_ID;
    
    if (!token || !dbId) {
      throw new Error('NOTION_TOKEN and NOTION_DATABASE_ID must be set');
    }

    this.notion = new Client({
      auth: token,
    });
    this.databaseId = dbId;
  }

  /**
   * Notionデータベースから公開済みの記事を取得
   */
  async getPublishedPosts(requiredTags: string[] = []): Promise<NotionPage[]> {
    try {
      // 全ての記事を取得
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        sorts: [
          {
            property: 'Created',
            direction: 'descending'
          }
        ]
      }) as DatabaseQueryResponse;

      // タグフィルターが指定されていない場合は全ての記事を返す
      if (!requiredTags || requiredTags.length === 0) {
        return response.results;
      }

      // タグフィルターが指定されている場合は効率的にフィルタリング
      console.log(`🏷️  ${requiredTags.length}個のタグでフィルタリング中...`);
      
      // 全てのタグページの情報を一度に取得してキャッシュ
      const tagCache = await this.buildTagCache(response.results);
      
      // デバッグ情報を出力
      this.debugTagFiltering(response.results, requiredTags, tagCache);
      
      // フィルタリングされた記事
      const filteredPosts: NotionPage[] = [];
      
      for (const post of response.results) {
        const tags = post.properties.Tags?.relation || [];
        const hasRequiredTags = this.hasRequiredTagsCached(tags, requiredTags, tagCache);
        
        if (hasRequiredTags) {
          filteredPosts.push(post);
        }
      }

      console.log(`📊 ${response.results.length}件中 ${filteredPosts.length}件がフィルター条件に一致`);
      return filteredPosts;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to fetch published posts:', errorMessage);
      throw error;
    }
  }

  /**
   * 全てのタグページの情報を効率的に取得してキャッシュ
   */
  private async buildTagCache(posts: NotionPage[]): Promise<Map<string, string>> {
    const uniqueTagIds = new Set<string>();
    
    // 全ての記事から使用されているタグIDを収集
    posts.forEach(post => {
      const tags = post.properties.Tags?.relation || [];
      tags.forEach(tag => uniqueTagIds.add(tag.id));
    });

    console.log(`🏷️  ${uniqueTagIds.size}個のユニークタグを発見`);
    
    // タグIDとタイトルのマッピングを構築
    const tagCache = new Map<string, string>();
    const tagIds = Array.from(uniqueTagIds);
    
    // バッチでタグ情報を取得（並列処理で高速化）
    const batchSize = 10; // Notion APIの制限を考慮
    for (let i = 0; i < tagIds.length; i += batchSize) {
      const batch = tagIds.slice(i, i + batchSize);
      
      const tagPromises = batch.map(async (tagId: string) => {
        try {
          const page = await this.notion.pages.retrieve({ page_id: tagId });
          const title = this.getPageTitle(page as NotionPage);
          return { id: tagId, title };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`タグ取得エラー (ID: ${tagId}): ${errorMessage}`);
          return { id: tagId, title: 'Unknown' };
        }
      });
      
      const tagResults = await Promise.all(tagPromises);
      tagResults.forEach(({ id, title }) => {
        tagCache.set(id, title);
      });
      
      // API制限を避けるための短い待機
      if (i + batchSize < tagIds.length) {
        await this.sleep(100);
      }
    }
    
    console.log(`✅ タグキャッシュ構築完了: ${tagCache.size}個のタグ`);
    return tagCache;
  }

  /**
   * キャッシュを使用した効率的なタグチェック
   */
  private hasRequiredTagsCached(
    relationTags: NotionRelation[], 
    requiredTags: string[], 
    tagCache: Map<string, string>
  ): boolean {
    if (!requiredTags || requiredTags.length === 0) return true;
    if (!relationTags || relationTags.length === 0) return false;

    // 関連タグのタイトルを取得
    const tagTitles = relationTags.map(tag => tagCache.get(tag.id) || 'Unknown');
    
    // 必要なタグが全て含まれているかチェック
    return requiredTags.every(requiredTag => 
      tagTitles.some(title => title === requiredTag)
    );
  }

  /**
   * デバッグ用: タグフィルタリングの詳細情報を出力
   */
  private debugTagFiltering(
    posts: NotionPage[], 
    requiredTags: string[], 
    tagCache: Map<string, string>
  ): void {
    console.log('\n🔍 タグフィルタリング詳細デバッグ');
    console.log(`必要なタグ: [${requiredTags.join(', ')}]`);
    console.log(`利用可能なタグ: [${Array.from(tagCache.values()).join(', ')}]`);
    
    // 最初の5件の記事についてタグ情報を詳細表示
    const sampleSize = Math.min(5, posts.length);
    console.log(`\n📝 サンプル記事のタグ情報 (最初の${sampleSize}件):`);
    
    for (let i = 0; i < sampleSize; i++) {
      const post = posts[i];
      const title = this.extractPostTitle(post);
      const tags = post.properties.Tags?.relation || [];
      const tagTitles = tags.map(tag => tagCache.get(tag.id) || 'Unknown');
      
      console.log(`\n  記事 ${i + 1}: "${title}"`);
      console.log(`    タグID: [${tags.map(t => t.id).join(', ')}]`);
      console.log(`    タグ名: [${tagTitles.join(', ')}]`);
      console.log(`    必要タグ含有: ${this.hasRequiredTagsCached(tags, requiredTags, tagCache)}`);
    }
    
    // Study.Logタグが付いた記事を特別に検索
    console.log('\n🔍 Study.Logタグ付き記事の検索:');
    let studyLogCount = 0;
    
    for (const post of posts) {
      const tags = post.properties.Tags?.relation || [];
      const tagTitles = tags.map(tag => tagCache.get(tag.id) || 'Unknown');
      
      if (tagTitles.includes('Study.Log')) {
        studyLogCount++;
        const title = this.extractPostTitle(post);
        console.log(`  ✅ 発見: "${title}" - タグ: [${tagTitles.join(', ')}]`);
      }
    }
    
    if (studyLogCount === 0) {
      console.log('  ❌ Study.Logタグが付いた記事は見つかりませんでした');
    } else {
      console.log(`  📊 Study.Logタグ付き記事: ${studyLogCount}件`);
    }
  }

  /**
   * 記事タイトルを抽出（デバッグ用に独立）
   */
  extractPostTitle(post: NotionPage): string {
    const properties = post.properties;
    
    if (properties.Title?.title && properties.Title.title.length > 0) {
      return properties.Title.title[0].plain_text;
    }
    
    if (properties.Name?.title && properties.Name.title.length > 0) {
      return properties.Name.title[0].plain_text;
    }
    
    return 'Untitled';
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.notion.databases.retrieve({ database_id: this.databaseId });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Connection test failed:', errorMessage);
      return false;
    }
  }

  /**
   * データベース構造の調査
   */
  async inspectDatabase(): Promise<void> {
    try {
      const database = await this.notion.databases.retrieve({ 
        database_id: this.databaseId 
      });
      
      console.log('📋 データベース構造:');
      console.log(`  タイトル: ${(database as any).title[0]?.plain_text || 'Untitled'}`);
      console.log('  プロパティ:');
      
      const properties = (database as any).properties;
      for (const [name, prop] of Object.entries(properties)) {
        console.log(`    - ${name} (${(prop as any).type})`);
      }
      console.log('');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Database inspection failed:', errorMessage);
    }
  }

  /**
   * タグページのタイトルを取得
   */
  getPageTitle(page: NotionPage): string {
    try {
      const properties = page.properties;
      
      // データベース内のページの場合の様々なパターンを試す
      // 1. 標準的なtitleプロパティ
      if (properties.title?.title && properties.title.title.length > 0) {
        return properties.title.title[0].plain_text;
      }
      
      // 2. Nameプロパティ（カスタムタイトルフィールド）
      if (properties.Name?.title && properties.Name.title.length > 0) {
        return properties.Name.title[0].plain_text;
      }
      
      // 3. タグデータベース特有の構造を確認
      // タグページの各プロパティをチェック
      for (const [key, value] of Object.entries(properties)) {
        if (value?.title && Array.isArray(value.title) && value.title.length > 0) {
          console.log(`🏷️  タグタイトル発見 - プロパティ: ${key}, 値: ${value.title[0].plain_text}`);
          return value.title[0].plain_text;
        }
      }
      
      // 4. rich_textタイプも確認
      for (const [key, value] of Object.entries(properties)) {
        if (value?.rich_text && Array.isArray(value.rich_text) && value.rich_text.length > 0) {
          console.log(`🏷️  タグリッチテキスト発見 - プロパティ: ${key}, 値: ${value.rich_text[0].plain_text}`);
          return value.rich_text[0].plain_text;
        }
      }
      
      // 5. デバッグ情報を出力
      console.log(`🔍 タグページ構造デバッグ (ID: ${page.id.substring(0, 8)}...):`);
      console.log('  プロパティ一覧:');
      for (const [key, value] of Object.entries(properties)) {
        const valueType = (value as any)?.type || 'unknown';
        const valueStr = JSON.stringify(value).substring(0, 100);
        console.log(`    ${key}: ${valueType} - ${valueStr}...`);
      }
      
      return 'Untitled';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`タグタイトル取得エラー: ${errorMessage}`);
      return 'Untitled';
    }
  }

  /**
   * スリープ関数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}