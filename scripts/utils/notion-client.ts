import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import type { 
  NotionPage, 
  DatabaseQueryResponse
} from '../types/notion.js';
import type { PublicTagOption } from './ai-metadata-generator.js';

dotenv.config({ path: '.env.local' });

export interface NotionClientOptions {
  notion?: Client;
  token?: string;
  databaseId?: string;
  env?: NodeJS.ProcessEnv;
}

export class NotionClient {
  private notion: Client;
  private databaseId: string;
  private env: NodeJS.ProcessEnv;

  constructor(options: NotionClientOptions = {}) {
    this.env = options.env ?? process.env;
    const token = options.token ?? this.env.NOTION_TOKEN;
    const dbId = options.databaseId ?? this.env.NOTION_DATABASE_ID;
    
    if ((!token && !options.notion) || !dbId) {
      throw new Error('NOTION_TOKEN and NOTION_DATABASE_ID must be set');
    }

    this.notion = options.notion ?? new Client({
      auth: token,
    });
    this.databaseId = dbId;
  }

  /** Study.Logなど、同期タグが付いたMemosだけを取得する。 */
  async getSyncTargetPosts(syncTag: string): Promise<NotionPage[]> {
    try {
      const allPosts: NotionPage[] = [];
      let startCursor: string | undefined;

      // Relation先のタグ名はNotion APIのDBフィルターで直接比較できないため、
      // 全ページをcursorで取得した後にタグ名を解決して絞り込む。
      do {
        const response = await this.notion.databases.query({
          database_id: this.databaseId,
          sorts: [
            {
              property: 'Created',
              direction: 'descending'
            }
          ],
          start_cursor: startCursor,
          page_size: 100
        }) as DatabaseQueryResponse;

        allPosts.push(...response.results);
        startCursor = response.has_more ? response.next_cursor || undefined : undefined;
      } while (startCursor);

      const tagCache = await this.buildTagCache(allPosts);
      const normalizedSyncTag = syncTag.trim().toLowerCase();
      const filteredPosts = allPosts.filter(post => {
        const allTagNames = this.resolveTagNames(post, tagCache);
        post.relatedTagNames = allTagNames;
        return allTagNames.some(tag => tag.trim().toLowerCase() === normalizedSyncTag);
      });

      console.log(`📊 ${allPosts.length}件中 ${filteredPosts.length}件に「${syncTag}」タグがあります`);

      return filteredPosts;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to fetch published posts:', errorMessage);
      throw error;
    }
  }

  /** Tags DBで「ブログ表示」が有効なタグをGeminiの選択肢として取得する。 */
  async getPublicTagCatalog(): Promise<PublicTagOption[]> {
    const database = await this.notion.databases.retrieve({ database_id: this.databaseId }) as any;
    const tagsPropertyName = this.env.NOTION_TAGS_PROPERTY || 'Tags';
    const publicPropertyName = this.env.NOTION_PUBLIC_TAG_PROPERTY || 'ブログ表示';
    const descriptionPropertyName = this.env.NOTION_TAG_DESCRIPTION_PROPERTY || 'タグの説明';
    const archivePropertyName = this.env.NOTION_TAG_ARCHIVE_PROPERTY || 'アーカイブ';
    const tagsProperty = database.properties?.[tagsPropertyName];
    const tagsDatabaseId = tagsProperty?.type === 'relation'
      ? tagsProperty.relation?.database_id
      : undefined;

    if (!tagsDatabaseId) {
      console.warn(`⚠️  ${tagsPropertyName}がRelationではないため公開タグ候補を取得できません`);
      return [];
    }

    const catalog: PublicTagOption[] = [];
    let startCursor: string | undefined;
    do {
      const response = await this.notion.databases.query({
        database_id: tagsDatabaseId,
        filter: {
          property: publicPropertyName,
          checkbox: { equals: true }
        },
        start_cursor: startCursor,
        page_size: 100
      }) as DatabaseQueryResponse;

      for (const tagPage of response.results) {
        if (tagPage.properties[archivePropertyName]?.checkbox === true) continue;
        const name = this.getPageTitle(tagPage).trim();
        if (!name || name === 'Untitled') continue;
        const description = tagPage.properties[descriptionPropertyName]?.rich_text
          ?.map(item => item.plain_text)
          .join('')
          .trim();
        catalog.push({ name, ...(description ? { description } : {}) });
      }

      startCursor = response.has_more ? response.next_cursor || undefined : undefined;
    } while (startCursor);

    const internalTags = new Set(
      (this.env.NOTION_INTERNAL_TAGS || 'Study.Log,INBOX')
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
    );
    return catalog.filter(tag => !internalTags.has(tag.name.toLowerCase()));
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

    if (uniqueTagIds.size === 0) return new Map();

    console.log(`🏷️  ${uniqueTagIds.size}個のRelationタグを解決中...`);
    
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

  private resolveTagNames(post: NotionPage, tagCache: Map<string, string>): string[] {
    const multiSelectTags = post.properties.Tags?.multi_select?.map(tag => tag.name) ?? [];
    if (multiSelectTags.length > 0) return multiSelectTags;

    return (post.properties.Tags?.relation ?? [])
      .map(tag => tagCache.get(tag.id))
      .filter((title): title is string => Boolean(title) && title !== 'Unknown' && title !== 'Untitled');
  }

  /**
   * 記事タイトルを抽出（デバッグ用に独立）
   */
  extractPostTitle(post: NotionPage): string {
    const properties = post.properties;
    
    if (properties.Title?.title && properties.Title.title.length > 0) {
      return properties.Title.title.map(item => item.plain_text).join('');
    }
    
    if (properties.Name?.title && properties.Name.title.length > 0) {
      return properties.Name.title.map(item => item.plain_text).join('');
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
        return properties.title.title.map(item => item.plain_text).join('');
      }
      
      // 2. Nameプロパティ（カスタムタイトルフィールド）
      if (properties.Name?.title && properties.Name.title.length > 0) {
        return properties.Name.title.map(item => item.plain_text).join('');
      }
      
      // 3. タグデータベース特有の構造を確認
      // タグページの各プロパティをチェック
      for (const [key, value] of Object.entries(properties)) {
        if (value?.title && Array.isArray(value.title) && value.title.length > 0) {
          console.log(`🏷️  タグタイトル発見 - プロパティ: ${key}, 値: ${value.title[0].plain_text}`);
          return value.title.map(item => item.plain_text).join('');
        }
      }
      
      // 4. rich_textタイプも確認
      for (const [key, value] of Object.entries(properties)) {
        if (value?.rich_text && Array.isArray(value.rich_text) && value.rich_text.length > 0) {
          console.log(`🏷️  タグリッチテキスト発見 - プロパティ: ${key}, 値: ${value.rich_text[0].plain_text}`);
          return value.rich_text.map(item => item.plain_text).join('');
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
