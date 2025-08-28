/**
 * NotionページからAstroブログのfrontmatterを生成するユーティリティ
 */

/**
 * NotionページのプロパティからfrontmatterYAMLを生成
 * @param {Object} notionPage Notionページオブジェクト
 * @returns {string} frontmatter YAML文字列
 */
export function generateFrontmatter(notionPage) {
  const properties = notionPage.properties;
  const frontmatter = {};

  // タイトル
  frontmatter.title = extractTitle(properties);
  
  // 説明
  frontmatter.description = extractDescription(properties);
  
  // 公開日
  frontmatter.pubDate = extractPublishDate(properties);
  
  // ヒーロー画像（オプション）
  const heroImage = extractHeroImage(properties);
  if (heroImage) {
    frontmatter.heroImage = heroImage;
  }
  
  // タグ（オプション）
  const tags = extractTags(properties);
  if (tags && tags.length > 0) {
    frontmatter.tags = tags;
  }

  // シリーズ（オプション）
  const series = extractSeries(properties);
  if (series) {
    frontmatter.series = series;
  }

  return generateYAML(frontmatter);
}

/**
 * タイトルを抽出
 * @param {Object} properties Notionページのプロパティ
 * @returns {string} タイトル
 */
function extractTitle(properties) {
  // Titleプロパティから取得
  if (properties.Title && properties.Title.title && properties.Title.title.length > 0) {
    return properties.Title.title[0].plain_text;
  }
  
  // Nameプロパティから取得（フォールバック）
  if (properties.Name && properties.Name.title && properties.Name.title.length > 0) {
    return properties.Name.title[0].plain_text;
  }
  
  return 'Untitled';
}

/**
 * 説明を抽出
 * @param {Object} properties Notionページのプロパティ
 * @returns {string} 説明
 */
function extractDescription(properties) {
  // Descriptionプロパティから取得
  if (properties.Description && properties.Description.rich_text && properties.Description.rich_text.length > 0) {
    return properties.Description.rich_text[0].plain_text;
  }
  
  // Summaryプロパティから取得（フォールバック）
  if (properties.Summary && properties.Summary.rich_text && properties.Summary.rich_text.length > 0) {
    return properties.Summary.rich_text[0].plain_text;
  }
  
  return '';
}

/**
 * 公開日を抽出
 * @param {Object} properties Notionページのプロパティ
 * @returns {string} 公開日（YYYY-MM-DD形式）
 */
function extractPublishDate(properties) {
  // PublishDateプロパティから取得
  if (properties.PublishDate && properties.PublishDate.date && properties.PublishDate.date.start) {
    return properties.PublishDate.date.start;
  }
  
  // Dateプロパティから取得（フォールバック）
  if (properties.Date && properties.Date.date && properties.Date.date.start) {
    return properties.Date.date.start;
  }
  
  // Createdプロパティから取得（フォールバック）
  if (properties.Created && properties.Created.created_time) {
    return properties.Created.created_time.split('T')[0];
  }
  
  // 現在の日付を使用
  return new Date().toISOString().split('T')[0];
}

/**
 * ヒーロー画像を抽出
 * @param {Object} properties Notionページのプロパティ
 * @returns {Object|null} ヒーロー画像オブジェクト
 */
function extractHeroImage(properties) {
  // HeroImageプロパティから取得
  if (properties.HeroImage && properties.HeroImage.files && properties.HeroImage.files.length > 0) {
    const file = properties.HeroImage.files[0];
    return {
      src: file.file ? file.file.url : file.external.url,
      alt: file.name || 'Hero image'
    };
  }
  
  // Imageプロパティから取得（フォールバック）
  if (properties.Image && properties.Image.files && properties.Image.files.length > 0) {
    const file = properties.Image.files[0];
    return {
      src: file.file ? file.file.url : file.external.url,
      alt: file.name || 'Hero image'
    };
  }
  
  return null;
}

/**
 * タグを抽出
 * @param {Object} properties Notionページのプロパティ
 * @returns {Array} タグの配列
 */
function extractTags(properties) {
  // Tagsプロパティから取得
  if (properties.Tags && properties.Tags.multi_select && properties.Tags.multi_select.length > 0) {
    return properties.Tags.multi_select.map(tag => tag.name);
  }
  
  // Categoryプロパティから取得（フォールバック）
  if (properties.Category && properties.Category.multi_select && properties.Category.multi_select.length > 0) {
    return properties.Category.multi_select.map(tag => tag.name);
  }
  
  return [];
}

/**
 * シリーズを抽出
 * @param {Object} properties Notionページのプロパティ
 * @returns {string|null} シリーズ名
 */
function extractSeries(properties) {
  // Seriesプロパティから取得
  if (properties.Series && properties.Series.select && properties.Series.select.name) {
    return properties.Series.select.name;
  }
  
  return null;
}

/**
 * オブジェクトからYAML文字列を生成
 * @param {Object} data frontmatterオブジェクト
 * @returns {string} YAML文字列
 */
function generateYAML(data) {
  let yaml = '---\n';
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }
    
    if (typeof value === 'string') {
      yaml += `${key}: "${value}"\n`;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      yaml += `${key}: ${value}\n`;
    } else if (Array.isArray(value)) {
      yaml += `${key}:\n`;
      for (const item of value) {
        yaml += `  - "${item}"\n`;
      }
    } else if (typeof value === 'object') {
      yaml += `${key}:\n`;
      for (const [objKey, objValue] of Object.entries(value)) {
        yaml += `  ${objKey}: "${objValue}"\n`;
      }
    }
  }
  
  yaml += '---\n';
  return yaml;
}

/**
 * ページタイトルからファイル名を生成
 * @param {string} title ページタイトル
 * @returns {string} ファイル名（.md拡張子付き）
 */
export function generateFileName(title) {
  // 特殊文字を除去し、スペースをハイフンに置換
  const slug = title
    .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '') // 特殊文字除去（日本語文字は保持）
    .trim()
    .replace(/\s+/g, '-') // スペースをハイフンに置換
    .toLowerCase();
  
  return `${slug}.md`;
}