import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ArticleMetadata } from './utils/ai-metadata-generator.js';
import type { NotionPage } from './types/notion.js';
import { NotionSyncManager } from './sync-notion.js';

function post(id: string, title: string, lastEdited = '2026-07-01T12:00:00.000Z'): NotionPage {
  return {
    id,
    created_time: '2026-07-01T00:00:00.000Z',
    last_edited_time: lastEdited,
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [{ type: 'text', plain_text: title }]
      },
      Created: {
        id: 'created',
        type: 'created_time',
        created_time: '2026-07-01T00:00:00.000Z'
      }
    },
    parent: { type: 'database_id', database_id: 'memos-db' },
    archived: false,
    url: `https://notion.so/${id}`
  };
}

function dependencies(posts: () => NotionPage[]) {
  let markdownCalls = 0;
  let metadataCalls = 0;
  const notionClient = {
    testConnection: async () => true,
    inspectDatabase: async () => {},
    getSyncTargetPosts: async () => posts(),
    extractPostTitle: (item: NotionPage) => item.properties.Name?.title?.[0]?.plain_text ?? 'Untitled',
    getPublicTagCatalog: async () => [{ name: 'Astro' }]
  };
  const markdownConverter = {
    convertToMarkdown: async (_id: string, title: string) => {
      markdownCalls++;
      return `# ${title}\n\n本文`;
    }
  };
  const metadataGenerator = {
    generate: async (): Promise<ArticleMetadata> => {
      metadataCalls++;
      return {
        slug: 'generated-article',
        publicTags: ['Astro'],
        newTagSuggestions: [],
        source: 'gemini'
      };
    }
  };

  return {
    notionClient,
    markdownConverter,
    metadataGenerator,
    calls: () => ({ markdownCalls, metadataCalls })
  };
}

async function temporaryContentDir(t: test.TestContext): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hamakyo-sync-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('新規作成・スキップ・更新を通してslugとタグを固定する', async t => {
  const contentDir = await temporaryContentDir(t);
  let currentPost = post('notion-1', '最初のタイトル');
  const deps = dependencies(() => [currentPost]);
  const options = {
    ...deps,
    contentDir,
    env: {
      NOTION_TOKEN: 'test-token',
      NOTION_DATABASE_ID: 'memos-db',
      NOTION_SYNC_TAG: 'Study.Log',
      NOTION_INTERNAL_TAGS: 'Study.Log,INBOX'
    }
  };

  const created = await new NotionSyncManager(options).run();
  const filePath = path.join(contentDir, 'generated-article.md');
  const createdContent = await fs.readFile(filePath, 'utf8');

  assert.equal(created.created, 1);
  assert.match(createdContent, /notionId: "notion-1"/);
  assert.match(createdContent, /slug: "generated-article"/);
  assert.match(createdContent, /tags: \["astro"\]/);
  assert.deepEqual(deps.calls(), { markdownCalls: 1, metadataCalls: 1 });

  const skipped = await new NotionSyncManager(options).run();
  assert.equal(skipped.skipped, 1);
  assert.deepEqual(deps.calls(), { markdownCalls: 1, metadataCalls: 1 });

  currentPost = post('notion-1', '変更後のタイトル', '2026-07-02T12:00:00.000Z');
  const updated = await new NotionSyncManager(options).run();
  const updatedContent = await fs.readFile(filePath, 'utf8');

  assert.equal(updated.updated, 1);
  assert.match(updatedContent, /title: "変更後のタイトル"/);
  assert.match(updatedContent, /slug: "generated-article"/);
  assert.match(updatedContent, /tags: \["astro"\]/);
  assert.deepEqual(deps.calls(), { markdownCalls: 2, metadataCalls: 1 });
});

test('重複するAI slugにはNotion IDを付けて衝突を避ける', async t => {
  const contentDir = await temporaryContentDir(t);
  const items = [
    post('aaaaaaaa-1111', '記事A'),
    post('bbbbbbbb-2222', '記事B')
  ];
  const deps = dependencies(() => items);
  const stats = await new NotionSyncManager({
    ...deps,
    contentDir,
    env: { NOTION_TOKEN: 'test-token', NOTION_DATABASE_ID: 'memos-db' }
  }).run();
  const files = (await fs.readdir(contentDir)).sort();

  assert.equal(stats.created, 2);
  assert.deepEqual(files, [
    'generated-article-bbbbbbbb.md',
    'generated-article.md'
  ]);
});

test('1記事の変換失敗後も残りの記事を同期する', async t => {
  const contentDir = await temporaryContentDir(t);
  const items = [post('broken', '失敗記事'), post('healthy', '成功記事')];
  const deps = dependencies(() => items);
  deps.markdownConverter.convertToMarkdown = async (id: string, title: string) => {
    if (id === 'broken') throw new Error('conversion failed');
    return `# ${title}`;
  };

  const stats = await new NotionSyncManager({
    ...deps,
    contentDir,
    env: { NOTION_TOKEN: 'test-token', NOTION_DATABASE_ID: 'memos-db' }
  }).run();

  assert.equal(stats.errors, 1);
  assert.equal(stats.created, 1);
  assert.equal(stats.success, 1);
  assert.equal((await fs.readdir(contentDir)).length, 1);
});
