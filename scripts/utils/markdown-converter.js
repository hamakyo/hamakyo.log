import { NotionToMarkdown } from 'notion-to-md';

/**
 * NotionページコンテンツをMarkdownに変換するユーティリティ
 */
export class MarkdownConverter {
  constructor(notionClient) {
    this.n2m = new NotionToMarkdown({ 
      notionClient: notionClient.notion,
      config: {
        parseChildPages: false, // 子ページは解析しない
        convertUnsupportedBlock: true, // サポートされていないブロックも変換
      }
    });
    
    // ImageProcessorは後で初期化
    
    // カスタム変換設定
    this.setupCustomTransformers();
  }

  /**
   * NotionページをMarkdownに変換
   * @param {string} pageId ページID
   * @returns {Promise<string>} Markdown文字列
   */
  async convertToMarkdown(pageId, postTitle = 'untitled') {
    try {
      const mdBlocks = await this.n2m.pageToMarkdown(pageId);
      const markdown = this.n2m.toMarkdownString(mdBlocks);
      
      // 変換後の後処理（画像処理を含む）
      return await this.postProcessMarkdown(markdown.parent, postTitle);
    } catch (error) {
      console.error(`Failed to convert page ${pageId} to markdown:`, error.message);
      throw error;
    }
  }

  /**
   * カスタム変換ルールを設定
   */
  setupCustomTransformers() {
    // コールアウトブロックのカスタム変換
    this.n2m.setCustomTransformer('callout', (block) => {
      const { callout } = block;
      const icon = callout.icon?.emoji || '💡';
      const text = callout.rich_text.map(t => t.plain_text).join('');
      
      return `> ${icon} **${text}**`;
    });

    // コードブロックのカスタム変換
    this.n2m.setCustomTransformer('code', (block) => {
      const { code } = block;
      const language = code.language || '';
      const codeText = code.rich_text.map(t => t.plain_text).join('');
      
      return `\`\`\`${language}\n${codeText}\n\`\`\``;
    });

    // 引用ブロックのカスタム変換
    this.n2m.setCustomTransformer('quote', (block) => {
      const { quote } = block;
      const text = quote.rich_text.map(t => t.plain_text).join('');
      
      return `> ${text}`;
    });

    // 区切り線のカスタム変換
    this.n2m.setCustomTransformer('divider', () => {
      return '---';
    });

    // 表のカスタム変換
    this.n2m.setCustomTransformer('table', (block) => {
      // notion-to-mdのデフォルト処理を使用
      return false; // falseを返すとデフォルト処理が実行される
    });
  }

  /**
   * Markdown変換後の後処理
   * @param {string} markdown Markdown文字列
   * @returns {string} 後処理済みMarkdown文字列
   */
  async postProcessMarkdown(markdown, postTitle = 'untitled') {
    if (!markdown) return '';

    let processed = markdown;

    // 複数の連続する空行を2つの空行に制限
    processed = processed.replace(/\n{3,}/g, '\n\n');

    // 行末の不要な空白を削除
    processed = processed.replace(/[ \t]+$/gm, '');

    // ファイル先頭と末尾の不要な空行を削除
    processed = processed.trim();

    // コードブロック内のインデント調整
    processed = this.fixCodeBlockIndentation(processed);

    // リンクの正規化
    processed = this.normalizeLinks(processed);

    // 画像URLの処理（ダウンロード＆パス変換）
    processed = await this.processImageUrls(processed, postTitle);

    return processed;
  }

  /**
   * コードブロック内のインデントを調整
   * @param {string} markdown Markdown文字列
   * @returns {string} 調整済みMarkdown文字列
   */
  fixCodeBlockIndentation(markdown) {
    return markdown.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
      if (!code) return match;

      // インデントを正規化
      const lines = code.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim() !== '');
      
      if (nonEmptyLines.length === 0) return match;

      // 最小インデントを計算
      const minIndent = Math.min(...nonEmptyLines.map(line => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
      }));

      // 最小インデント分を削除
      const adjustedLines = lines.map(line => {
        if (line.trim() === '') return '';
        return line.substring(minIndent);
      });

      const adjustedCode = adjustedLines.join('\n').trim();
      const lang = language || '';
      
      return `\`\`\`${lang}\n${adjustedCode}\n\`\`\``;
    });
  }

  /**
   * リンクの正規化
   * @param {string} markdown Markdown文字列
   * @returns {string} 正規化済みMarkdown文字列
   */
  normalizeLinks(markdown) {
    // Notionの内部リンクを外部リンクとして処理
    return markdown.replace(
      /\[([^\]]+)\]\(https:\/\/www\.notion\.so\/([a-f0-9-]+)\)/g,
      '[$1](https://www.notion.so/$2)'
    );
  }

  /**
   * 画像URLの処理
   * @param {string} markdown Markdown文字列
   * @returns {string} 処理済みMarkdown文字列
   */
  async processImageUrls(markdown, postTitle = 'untitled') {
    // 動的にImageProcessorをインポート
    if (!this.imageProcessor) {
      const ImageProcessor = (await import('./image-processor.js')).default;
      this.imageProcessor = new ImageProcessor();
    }
    
    // ImageProcessorを使用して画像をダウンロードし、パスを変換
    return await this.imageProcessor.processImagesInMarkdown(markdown, postTitle);
  }

  /**
   * メタデータの抽出
   * @param {string} markdown Markdown文字列
   * @returns {Object} 抽出されたメタデータ
   */
  extractMetadata(markdown) {
    const metadata = {
      wordCount: 0,
      readingTime: 0,
      headings: [],
      codeBlocks: 0,
      images: 0
    };

    // 文字数カウント（コードブロックと画像を除く）
    const cleanText = markdown
      .replace(/```[\s\S]*?```/g, '') // コードブロックを除去
      .replace(/!\[.*?\]\(.*?\)/g, '') // 画像を除去
      .replace(/\[.*?\]\(.*?\)/g, '') // リンクを除去
      .replace(/[#*>`-]/g, '') // Markdownマークアップを除去
      .trim();
    
    metadata.wordCount = cleanText.length;
    metadata.readingTime = Math.ceil(cleanText.length / 500); // 1分間に500文字と仮定

    // 見出しの抽出
    const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm);
    if (headingMatches) {
      metadata.headings = headingMatches.map(heading => {
        const level = heading.match(/^#+/)[0].length;
        const text = heading.replace(/^#+\s+/, '');
        return { level, text };
      });
    }

    // コードブロック数
    const codeBlockMatches = markdown.match(/```[\s\S]*?```/g);
    metadata.codeBlocks = codeBlockMatches ? codeBlockMatches.length : 0;

    // 画像数
    const imageMatches = markdown.match(/!\[.*?\]\(.*?\)/g);
    metadata.images = imageMatches ? imageMatches.length : 0;

    return metadata;
  }
}