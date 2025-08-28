import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Notion画像の処理とローカル保存を管理
 */
class ImageProcessor {
  constructor() {
    // 画像保存ディレクトリ
    this.imagesDir = path.join(process.cwd(), 'public', 'images', 'notion');
    this.supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  }

  /**
   * 画像保存ディレクトリを作成
   */
  async ensureImageDirectory() {
    try {
      await fs.mkdir(this.imagesDir, { recursive: true });
      console.log(`📁 画像ディレクトリを確保: ${this.imagesDir}`);
    } catch (error) {
      console.warn(`画像ディレクトリ作成警告: ${error.message}`);
    }
  }

  /**
   * NotionのblockからURLを抽出
   */
  extractImageUrlFromBlock(block) {
    switch (block.type) {
      case 'image':
        if (block.image.type === 'external') {
          return block.image.external.url;
        } else if (block.image.type === 'file') {
          return block.image.file.url;
        }
        break;
      
      case 'embed':
        // 画像系のembedをチェック
        const url = block.embed.url;
        if (this.isImageUrl(url)) {
          return url;
        }
        break;
    }
    return null;
  }

  /**
   * URLが画像かどうかを判定
   */
  isImageUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      
      // 拡張子チェック
      const hasImageExtension = this.supportedFormats.some(ext => 
        pathname.endsWith(ext)
      );
      
      // Notion画像URLパターンチェック
      const isNotionImage = url.includes('notion.so') && 
        (url.includes('/image/') || pathname.includes('.'));
      
      return hasImageExtension || isNotionImage;
    } catch {
      return false;
    }
  }

  /**
   * 画像をダウンロードしてローカルに保存
   */
  async downloadAndSaveImage(imageUrl, postTitle = 'untitled') {
    try {
      console.log(`🔄 画像ダウンロード開始: ${imageUrl.substring(0, 50)}...`);
      
      // 画像データを取得
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NotionSync/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Content-Typeから拡張子を判定
      const contentType = response.headers.get('content-type') || '';
      const extension = this.getExtensionFromContentType(contentType);
      
      // ファイル名を生成（ハッシュベース）
      const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
      const sanitizedTitle = this.sanitizeFileName(postTitle);
      const fileName = `${sanitizedTitle}_${urlHash.substring(0, 8)}${extension}`;
      const filePath = path.join(this.imagesDir, fileName);

      // 既存ファイルチェック
      try {
        await fs.access(filePath);
        console.log(`⏭️  画像スキップ（既存）: ${fileName}`);
        return this.getRelativeImagePath(fileName);
      } catch {
        // ファイルが存在しない場合は続行
      }

      // ファイルを保存
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      console.log(`✅ 画像保存完了: ${fileName} (${buffer.length}bytes)`);
      return this.getRelativeImagePath(fileName);

    } catch (error) {
      console.error(`❌ 画像ダウンロードエラー: ${error.message}`);
      
      // エラーの場合は元のURLを返す（フォールバック）
      return imageUrl;
    }
  }

  /**
   * Content-Typeから適切な拡張子を取得
   */
  getExtensionFromContentType(contentType) {
    const typeMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    
    return typeMap[contentType.toLowerCase()] || '.jpg';
  }

  /**
   * ファイル名として安全な文字列に変換
   */
  sanitizeFileName(fileName) {
    return fileName
      .replace(/[<>:"/\\|?*]/g, '') // 無効文字を削除
      .replace(/\s+/g, '-') // スペースをハイフンに
      .replace(/[^\w\-]/g, '') // 英数字とハイフンのみ
      .toLowerCase()
      .substring(0, 30); // 長さ制限
  }

  /**
   * 相対パスを生成（Markdown用）
   */
  getRelativeImagePath(fileName) {
    return `/images/notion/${fileName}`;
  }

  /**
   * Markdownテキスト内の画像URLを処理
   */
  async processImagesInMarkdown(markdown, postTitle = 'untitled') {
    console.log(`🖼️  画像処理開始: ${postTitle}`);
    
    // 画像保存ディレクトリを確保
    await this.ensureImageDirectory();

    // Markdown内の画像パターンを検索
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let processedMarkdown = markdown;
    const imagePromises = [];

    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
      const [fullMatch, alt, url] = match;
      
      if (this.isImageUrl(url)) {
        // 画像ダウンロードを非同期で実行
        const downloadPromise = this.downloadAndSaveImage(url, postTitle)
          .then(localPath => ({
            original: fullMatch,
            replacement: `![${alt}](${localPath})`
          }));
        
        imagePromises.push(downloadPromise);
      }
    }

    // 全ての画像ダウンロードを待機
    if (imagePromises.length > 0) {
      console.log(`⏳ ${imagePromises.length}個の画像をダウンロード中...`);
      
      const results = await Promise.allSettled(imagePromises);
      
      // 成功したダウンロードのみを適用
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { original, replacement } = result.value;
          processedMarkdown = processedMarkdown.replace(original, replacement);
        } else {
          console.warn(`画像処理失敗 ${index + 1}: ${result.reason}`);
        }
      });
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      console.log(`📊 画像処理完了: ${successCount}/${imagePromises.length}件成功`);
    }

    return processedMarkdown;
  }

  /**
   * スリープ関数（レート制限対応）
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ImageProcessor;