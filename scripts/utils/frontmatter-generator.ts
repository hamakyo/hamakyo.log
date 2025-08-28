import type { NotionPage, Frontmatter } from '../types/notion.js';

/**
 * NotionページからMarkdownのフロントマターを生成
 */
export function generateFrontmatter(post: NotionPage): string {
  const frontmatter: Frontmatter = {
    title: extractTitle(post),
    description: extractDescription(post),
    pubDate: extractPubDate(post),
  };

  // 追加のメタデータがあれば含める
  const additionalMeta = extractAdditionalMetadata(post);
  Object.assign(frontmatter, additionalMeta);

  // YAML形式で出力
  const yamlLines = ['---'];
  
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined && value !== null && value !== '') {
      // 文字列の場合はクォートで囲む
      const formattedValue = typeof value === 'string' 
        ? `"${value.replace(/"/g, '\\"')}"` 
        : String(value);
      yamlLines.push(`${key}: ${formattedValue}`);
    }
  }
  
  yamlLines.push('---');
  
  return yamlLines.join('\n');
}

/**
 * ファイル名を生成（安全な形式に変換）
 */
export function generateFileName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '') // 無効な文字を削除
    .replace(/\s+/g, '') // スペースを削除
    .replace(/[^\w\-\.]/g, '') // 英数字、ハイフン、ドットのみ
    .toLowerCase()
    .substring(0, 100) // 長さ制限
    + '.md';
}

/**
 * タイトルを抽出
 */
function extractTitle(post: NotionPage): string {
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
 * 説明を抽出（今後の拡張用）
 */
function extractDescription(post: NotionPage): string {
  // 将来的にはNotionの説明フィールドから抽出
  return '';
}

/**
 * 公開日を抽出
 */
function extractPubDate(post: NotionPage): string {
  const properties = post.properties;
  
  // 作成日を使用
  if (properties.Created?.created_time) {
    const date = new Date(properties.Created.created_time);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD形式
  }
  
  // フォールバック: 現在の日付
  return new Date().toISOString().split('T')[0];
}

/**
 * 追加メタデータを抽出
 */
function extractAdditionalMetadata(post: NotionPage): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  // タグ情報を追加する場合
  const tags = post.properties.Tags?.relation;
  if (tags && tags.length > 0) {
    // タグIDの配列として保存（必要に応じてタイトルに変換）
    metadata.tags = tags.map(tag => tag.id);
  }
  
  // 更新日時を追加
  if (post.last_edited_time) {
    metadata.updatedDate = new Date(post.last_edited_time).toISOString().split('T')[0];
  }
  
  return metadata;
}