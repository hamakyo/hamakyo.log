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
  /** MemosのTags Relationから解決したタグ名。同期判定に使用する。 */
  relatedTagNames?: string[];
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
  multi_select?: NotionSelectOption[];
  select?: NotionSelectOption | null;
  status?: NotionSelectOption | null;
  checkbox?: boolean;
  date?: {
    start: string;
    end?: string | null;
  } | null;
  created_time?: string;
  last_edited_time?: string;
}

export interface NotionSelectOption {
  id?: string;
  name: string;
  color?: string;
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
  pubDate: string;
  notionId: string;
  slug: string;
  description?: string;
  tags?: string[];
  [key: string]: any;
}
