import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export class NotionClient {
  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_TOKEN,
    });
    this.databaseId = process.env.NOTION_DATABASE_ID;
  }

  /**
   * Notionデータベースから公開済みの記事を取得
   * @param {Array<string>} requiredTags 必須タグの配列（オプション）
   * @returns {Promise<Array>} 記事の配列
   */
  async getPublishedPosts(requiredTags = []) {
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
      });

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
      const filteredPosts = [];
      
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
      console.error('Failed to fetch published posts:', error.message);
      throw error;
    }
  }

  /**
   * 全てのタグページの情報を効率的に取得してキャッシュ
   */
  async buildTagCache(posts) {
    const uniqueTagIds = new Set();
    
    // 全ての記事から使用されているタグIDを収集
    posts.forEach(post => {
      const tags = post.properties.Tags?.relation || [];
      tags.forEach(tag => uniqueTagIds.add(tag.id));
    });

    console.log(`🏷️  ${uniqueTagIds.size}個のユニークタグを発見`);
    
    // タグIDとタイトルのマッピングを構築
    const tagCache = new Map();
    const tagIds = Array.from(uniqueTagIds);
    
    // バッチでタグ情報を取得（並列処理で高速化）
    const batchSize = 10; // Notion APIの制限を考慮
    for (let i = 0; i < tagIds.length; i += batchSize) {
      const batch = tagIds.slice(i, i + batchSize);
      
      const tagPromises = batch.map(async (tagId) => {
        try {
          const page = await this.notion.pages.retrieve({ page_id: tagId });
          const title = this.getPageTitle(page);
          return { id: tagId, title };
        } catch (error) {
          console.warn(`タグ取得エラー (ID: ${tagId}): ${error.message}`);
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
   * デバッグ用: タグフィルタリングの詳細情報を出力
   */
  debugTagFiltering(posts, requiredTags, tagCache) {
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
   * キャッシュを使用した効率的なタグチェック
   */
  hasRequiredTagsCached(relationTags, requiredTags, tagCache) {
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
   * スリープ関数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 指定されたページIDのコンテンツを取得
   * @param {string} pageId ページID
   * @returns {Promise<Object>} ページの詳細情報
   */
  async getPageContent(pageId) {
    try {
      const [page, blocks] = await Promise.all([
        this.notion.pages.retrieve({ page_id: pageId }),
        this.getPageBlocks(pageId)
      ]);

      return {
        page,
        blocks
      };
    } catch (error) {
      console.error(`Failed to fetch content for page ${pageId}:`, error.message);
      throw error;
    }
  }

  /**
   * ページのブロックを再帰的に取得
   * @param {string} pageId ページID
   * @returns {Promise<Array>} ブロックの配列
   */
  async getPageBlocks(pageId) {
    try {
      const blocks = [];
      let cursor = null;

      do {
        const response = await this.notion.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100
        });

        for (const block of response.results) {
          // 子ブロックがある場合は再帰的に取得
          if (block.has_children) {
            block.children = await this.getPageBlocks(block.id);
          }
          blocks.push(block);
        }

        cursor = response.next_cursor;
      } while (cursor);

      return blocks;
    } catch (error) {
      console.error(`Failed to fetch blocks for page ${pageId}:`, error.message);
      throw error;
    }
  }

  /**
   * API接続をテスト
   * @returns {Promise<boolean>} 接続成功かどうか
   */
  async testConnection() {
    try {
      await this.notion.databases.retrieve({
        database_id: this.databaseId
      });
      return true;
    } catch (error) {
      console.error('Notion connection test failed:', error.message);
      return false;
    }
  }

  /**
   * 指定されたタグが含まれているかチェック（relation型タグ用）
   * @param {Array} relationTags relation型のタグ配列
   * @param {Array<string>} requiredTags 必須タグ名の配列
   * @returns {Promise<boolean>} 必要なタグが全て含まれているか
   */
  // このメソッドは hasRequiredTagsCached に置き換えられました
  // 効率性のため削除

  /**
   * ページタイトルを取得するヘルパー
   * @param {Object} page Notionページオブジェクト
   * @returns {string} ページタイトル
   */
  getPageTitle(page) {
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
        console.log(`    ${key}: ${value?.type || 'unknown'} - ${JSON.stringify(value).substring(0, 100)}...`);
      }
      
      return 'Untitled';
    } catch (error) {
      console.warn(`タグタイトル取得エラー: ${error.message}`);
      return 'Untitled';
    }
  }

  /**
   * データベースの構造を表示（デバッグ用）
   * @returns {Promise<void>}
   */
  async inspectDatabase() {
    try {
      const db = await this.notion.databases.retrieve({
        database_id: this.databaseId
      });
      
      console.log('📋 データベース構造:');
      console.log(`  タイトル: ${db.title[0]?.plain_text || 'Untitled'}`);
      console.log('  プロパティ:');
      
      for (const [key, property] of Object.entries(db.properties)) {
        console.log(`    - ${key} (${property.type})`);
      }
      console.log('');
      
      return db.properties;
    } catch (error) {
      console.error('Failed to inspect database:', error.message);
      throw error;
    }
  }
}