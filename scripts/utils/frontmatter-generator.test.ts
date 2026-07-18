import assert from 'node:assert/strict';
import test from 'node:test';
import type { NotionPage } from '../types/notion.js';
import {
  generateFrontmatter,
  generateSlug,
  normalizeSlug
} from './frontmatter-generator.js';

function createPost(properties: NotionPage['properties']): NotionPage {
  return {
    id: '12345678-abcd-efgh-ijkl-1234567890ab',
    created_time: '2026-07-01T00:00:00.000Z',
    last_edited_time: '2026-07-02T03:04:05.000Z',
    properties,
    parent: { type: 'database_id', database_id: 'database-id' },
    archived: false,
    url: 'https://notion.so/example'
  };
}

test('日本語だけのタイトルはNotion ID付きslugになる', () => {
  assert.equal(
    generateSlug('L2とL3の違い', '12345678-abcd-efgh'),
    'l2-l3'
  );
  assert.equal(
    generateSlug('記事タイトル', '12345678-abcd-efgh'),
    'post-12345678'
  );
});

test('slugをURL安全な形式へ正規化する', () => {
  assert.equal(normalizeSlug(' Next.js 15 & Cloudflare Workers '), 'next-js-15-and-cloudflare-workers');
});

test('frontmatterへnotionId・固定slug・正規化タグを出力する', () => {
  const post = createPost({
    Name: {
      id: 'title',
      type: 'title',
      title: [
        { type: 'text', plain_text: 'Docker' },
        { type: 'text', plain_text: '入門' }
      ]
    },
    PublishDate: {
      id: 'date',
      type: 'date',
      date: { start: '2026-06-30' }
    }
  });

  const frontmatter = generateFrontmatter(post, {
    slug: 'docker-basics',
    tags: ['Docker', ' guide ', 'docker']
  });

  assert.match(frontmatter, /title: "Docker入門"/);
  assert.match(frontmatter, /pubDate: "2026-06-30"/);
  assert.match(frontmatter, /notionId: "12345678-abcd-efgh-ijkl-1234567890ab"/);
  assert.match(frontmatter, /slug: "docker-basics"/);
  assert.match(frontmatter, /tags: \["docker", "guide"\]/);
});
