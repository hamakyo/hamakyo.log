/**
 * Notion API レスポンス型定義
 */

export interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: NotionProperties;
  parent: {
    type: string;
    database_id: string;
  };
  archived: boolean;
  url: string;
}

export interface NotionProperties {
  [key: string]: NotionProperty;
}

export interface NotionProperty {
  id: string;
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  relation?: NotionRelation[];
  created_time?: string;
  last_edited_time?: string;
}

export interface NotionRichText {
  type: string;
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
}

export interface NotionRelation {
  id: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  has_children: boolean;
  parent: {
    type: string;
    page_id: string;
  };
  [key: string]: any; // 各ブロック固有のプロパティ
}

export interface DatabaseQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * 同期統計情報
 */
export interface SyncStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
  created: number;
  updated: number;
}

/**
 * 画像処理結果
 */
export interface ImageProcessResult {
  original: string;
  replacement: string;
}

/**
 * フロントマター情報
 */
export interface Frontmatter {
  title: string;
  description: string;
  pubDate: string;
  [key: string]: any;
}