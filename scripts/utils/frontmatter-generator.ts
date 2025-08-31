import type { NotionPage, Frontmatter } from '../types/notion.js';

/**
 * NotionページからMarkdownのフロントマターを生成
 */
export function generateFrontmatter(post: NotionPage): string {
  const frontmatter: Frontmatter = {
    title: extractTitle(post),
    pubDate: extractPubDate(post),
  };

  // 追加のメタデータがあれば含める
  const additionalMeta = extractAdditionalMetadata(post);
  Object.assign(frontmatter, additionalMeta);

  // YAML形式で出力
  const yamlLines = ['---'];
  
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined && value !== null && value !== '') {
      let formattedValue: string;
      
      if (Array.isArray(value)) {
        // 配列の場合はYAML配列形式
        formattedValue = `[${value.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(', ')}]`;
      } else if (typeof value === 'string') {
        // 文字列の場合はクォートで囲む
        formattedValue = `"${value.replace(/"/g, '\\"')}"`;
      } else {
        // その他はそのまま
        formattedValue = String(value);
      }
      
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
  const sanitized = title
    .replace(/[<>:"/\\|?*]/g, '') // 無効な文字を削除
    .replace(/\s+/g, '') // スペースを削除
    .replace(/[^\w\-\.]/g, '') // 英数字、ハイフン、ドットのみ
    .toLowerCase()
    .substring(0, 100); // 長さ制限

  // フォールバック: 正規化後が空なら untitled-YYYYMMDD.md を採用
  const isEmpty = !sanitized || sanitized.replace(/\./g, '') === '';
  if (isEmpty) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `untitled-${y}${m}${d}.md`;
  }

  return sanitized + '.md';
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
 * 説明を抽出
 */
function extractDescription(post: NotionPage): string {
  // タイトルをそのまま説明として使用（空文字を避けるため）
  const title = extractTitle(post);
  return title.length > 250 ? title.substring(0, 247) + '...' : title;
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
  
  // 更新日時を追加
  if (post.last_edited_time) {
    const iso = new Date(post.last_edited_time).toISOString();
    metadata.updatedDate = iso.split('T')[0];
    metadata.updatedAt = iso; // フルISOを保持（スキップ判定の精度向上）
  }
  
  return metadata;
}
