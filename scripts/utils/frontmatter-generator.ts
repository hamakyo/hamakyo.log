import type { NotionPage, Frontmatter } from '../types/notion.js';

interface FrontmatterOptions {
  slug: string;
  tags: string[];
}

/**
 * NotionページからMarkdownのフロントマターを生成
 */
export function generateFrontmatter(post: NotionPage, options: FrontmatterOptions): string {
  const frontmatter: Frontmatter = {
    title: extractTitle(post),
    pubDate: extractPubDate(post),
    notionId: post.id,
    slug: options.slug,
  };

  const tags = normalizeTags(options.tags);
  if (tags.length > 0) frontmatter.tags = tags;

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
export function generateFileName(title: string, notionId: string = ''): string {
  return `${generateSlug(title, notionId)}.md`;
}

/**
 * URL用のslugを生成する。日本語だけのタイトルでもNotion IDを使って必ず一意な候補にする。
 */
export function generateSlug(title: string, notionId: string): string {
  const normalized = normalizeSlug(title);
  if (normalized) return normalized;

  const idSuffix = notionId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8);
  return `post-${idSuffix || 'untitled'}`;
}

export function normalizeSlug(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/g, '');
}

/**
 * タイトルを抽出
 */
export function extractTitle(post: NotionPage): string {
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

  const configuredDate = properties.PublishDate?.date?.start || properties.Date?.date?.start;
  if (configuredDate) {
    return new Date(configuredDate).toISOString().split('T')[0];
  }
  
  // 作成日を使用
  if (properties.Created?.created_time) {
    const date = new Date(properties.Created.created_time);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD形式
  }
  
  // フォールバック: 現在の日付
  return new Date().toISOString().split('T')[0];
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(
    tags
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)
  ));
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
