import { NotionToMarkdown } from 'notion-to-md';
import type { NotionClient } from './notion-client.js';
import type { NotionPage } from '../types/notion.js';

/**
 * NotionページをMarkdownに変換するクラス
 */
export class MarkdownConverter {
  private n2m: NotionToMarkdown;
  private imageProcessor?: any; // 動的インポート用

  constructor(notionClient: NotionClient) {
    this.n2m = new NotionToMarkdown({ 
      notionClient: (notionClient as any).notion,
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
   */
  async convertToMarkdown(pageId: string, postTitle: string = 'untitled'): Promise<string> {
    try {
      const mdBlocks = await this.n2m.pageToMarkdown(pageId);
      const markdown = this.n2m.toMarkdownString(mdBlocks);
      
      // 変換後の後処理（画像処理を含む）
      return await this.postProcessMarkdown(markdown.parent, postTitle);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to convert page ${pageId} to markdown:`, errorMessage);
      throw error;
    }
  }

  /**
   * カスタム変換ルールを設定
   */
  private setupCustomTransformers(): void {
    // コードブロックのカスタム変換
    this.n2m.setCustomTransformer('code', (block: any) => {
      const { code } = block;
      const language = code.language || '';
      const codeText = code.rich_text
        .map((text: any) => text.plain_text)
        .join('');
      
      return `\`\`\`${language}\n${codeText}\n\`\`\``;
    });

    // 引用ブロックのカスタム変換
    this.n2m.setCustomTransformer('quote', (block: any) => {
      const text = block.quote.rich_text
        .map((text: any) => text.plain_text)
        .join('');
      
      return `> ${text}`;
    });

    // コールアウトブロックのカスタム変換
    this.n2m.setCustomTransformer('callout', (block: any) => {
      const { callout } = block;
      const icon = callout.icon?.emoji || '💡';
      const text = callout.rich_text
        .map((text: any) => text.plain_text)
        .join('');
      
      return `${icon} **${text}**`;
    });

    // 区切り線のカスタム変換
    this.n2m.setCustomTransformer('divider', () => {
      return '---';
    });
  }

  /**
   * Markdown変換後の後処理
   */
  async postProcessMarkdown(markdown: string, postTitle: string = 'untitled'): Promise<string> {
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
   */
  private fixCodeBlockIndentation(markdown: string): string {
    return markdown.replace(
      /```(\w*)\n([\s\S]*?)\n```/g,
      (match: string, language: string, code: string) => {
        // 各行の先頭から共通する空白を削除
        const lines = code.split('\n');
        
        // 空行でない行のみを対象に最小インデントを計算
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        if (nonEmptyLines.length === 0) return match;
        
        const minIndent = Math.min(
          ...nonEmptyLines.map(line => {
            const match = line.match(/^[ \t]*/);
            return match ? match[0].length : 0;
          })
        );
        
        // 共通インデントを削除
        const adjustedLines = lines.map(line => {
          if (line.trim().length === 0) return line;
          return line.slice(minIndent);
        });
        
        return `\`\`\`${language}\n${adjustedLines.join('\n')}\n\`\`\``;
      }
    );
  }

  /**
   * リンクの正規化
   */
  private normalizeLinks(markdown: string): string {
    // Notion内部リンクを相対リンクに変換（必要に応じて実装）
    return markdown.replace(
      /\[([^\]]+)\]\(https:\/\/www\.notion\.so\/[^)]+\)/g,
      '[$1](#)' // 一時的にダミーリンクに置換
    );
  }

  /**
   * 画像URLの処理
   */
  async processImageUrls(markdown: string, postTitle: string = 'untitled'): Promise<string> {
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
   */
  extractMetadata(markdown: string): { description: string; headings: string[] } {
    const metadata = {
      description: '',
      headings: [] as string[]
    };

    // 最初の段落を説明として抽出
    const paragraphMatch = markdown.match(/^([^#\n]+)/);
    if (paragraphMatch) {
      metadata.description = paragraphMatch[1].trim().substring(0, 160);
    }

    // 見出しを抽出
    const headingMatches = markdown.matchAll(/^#{1,6}\s+(.+)$/gm);
    for (const match of headingMatches) {
      metadata.headings.push(match[1]);
    }

    return metadata;
  }
}