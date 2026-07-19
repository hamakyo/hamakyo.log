import assert from 'node:assert/strict';
import test from 'node:test';
import type { Client } from '@notionhq/client';
import type { NotionPage } from '../types/notion.js';
import { NotionClient } from './notion-client.js';

function page(
  id: string,
  title: string,
  tags: string[] = [],
  extraProperties: NotionPage['properties'] = {}
): NotionPage {
  return {
    id,
    created_time: '2026-07-01T00:00:00.000Z',
    last_edited_time: '2026-07-01T00:00:00.000Z',
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [{ type: 'text', plain_text: title }]
      },
      Tags: {
        id: 'tags',
        type: 'relation',
        relation: tags.map(tagId => ({ id: tagId }))
      },
      ...extraProperties
    },
    parent: { type: 'database_id', database_id: 'database-id' },
    archived: false,
    url: `https://notion.so/${id}`
  };
}

test('Relationタグをページングして解決し、同期タグで絞り込む', async () => {
  const queryCalls: Array<Record<string, unknown>> = [];
  const posts = [
    page('post-1', '対象記事', ['study-log', 'inbox']),
    page('post-2', '対象外記事', ['other']),
    page('post-3', '大文字小文字違い', ['study-log-upper'])
  ];
  const tagNames: Record<string, string> = {
    'study-log': 'Study.Log',
    inbox: 'INBOX',
    other: 'Study.Other',
    'study-log-upper': 'STUDY.LOG'
  };
  const notion = {
    databases: {
      query: async (args: Record<string, unknown>) => {
        queryCalls.push(args);
        if (!args.start_cursor) {
          return { results: posts.slice(0, 2), has_more: true, next_cursor: 'next' };
        }
        return { results: posts.slice(2), has_more: false, next_cursor: null };
      }
    },
    pages: {
      retrieve: async ({ page_id }: { page_id: string }) => page(page_id, tagNames[page_id])
    }
  } as unknown as Client;

  const client = new NotionClient({ notion, databaseId: 'memos-db', env: {} });
  const result = await client.getSyncTargetPosts(' study.log ');

  assert.deepEqual(result.map(post => post.id), ['post-1', 'post-3']);
  assert.deepEqual(result[0].relatedTagNames, ['Study.Log', 'INBOX']);
  assert.equal(queryCalls.length, 2);
  assert.equal(queryCalls[0].database_id, 'memos-db');
  assert.equal(queryCalls[1].start_cursor, 'next');
});

test('ブログ表示タグから内部タグとアーカイブ済みタグを除外する', async () => {
  const queryCalls: Array<Record<string, unknown>> = [];
  const notion = {
    databases: {
      retrieve: async () => ({
        properties: {
          Tags: { type: 'relation', relation: { database_id: 'tags-db' } }
        }
      }),
      query: async (args: Record<string, unknown>) => {
        queryCalls.push(args);
        return {
          results: [
            page('tag-astro', 'Astro', [], {
              'タグの説明': {
                id: 'description',
                type: 'rich_text',
                rich_text: [{ type: 'text', plain_text: 'Astroの記事' }]
              },
              'アーカイブ': { id: 'archive', type: 'checkbox', checkbox: false }
            }),
            page('tag-inbox', 'INBOX'),
            page('tag-sync', 'Study.Log'),
            page('tag-old', 'Old', [], {
              'アーカイブ': { id: 'archive', type: 'checkbox', checkbox: true }
            })
          ],
          has_more: false,
          next_cursor: null
        };
      }
    }
  } as unknown as Client;
  const client = new NotionClient({
    notion,
    databaseId: 'memos-db',
    env: { NOTION_INTERNAL_TAGS: 'Study.Log,INBOX' }
  });

  const catalog = await client.getPublicTagCatalog();

  assert.deepEqual(catalog, [{ name: 'Astro', description: 'Astroの記事' }]);
  assert.equal(queryCalls[0].database_id, 'tags-db');
  assert.deepEqual(queryCalls[0].filter, {
    property: 'ブログ表示',
    checkbox: { equals: true }
  });
});

test('TagsがRelationでなければ公開タグ候補を空で返す', async () => {
  const notion = {
    databases: {
      retrieve: async () => ({ properties: { Tags: { type: 'multi_select' } } })
    }
  } as unknown as Client;
  const client = new NotionClient({ notion, databaseId: 'memos-db', env: {} });

  assert.deepEqual(await client.getPublicTagCatalog(), []);
});
