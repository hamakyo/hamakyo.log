import assert from 'node:assert/strict';
import test from 'node:test';
import { GeminiMetadataGenerator, validateMetadata } from './ai-metadata-generator.js';

const input = {
  title: 'AstroでNotion同期を改善する',
  markdown: '# 本文\nNotionとAstroを同期します。',
  notionId: '12345678-abcd-efgh-ijkl-1234567890ab',
  allowedTags: [
    { name: 'Astro', description: 'Astroの記事' },
    { name: 'Notion' },
    { name: 'INBOX' },
    { name: 'Study.Log' }
  ],
  internalTags: ['INBOX', 'Study.Log']
};

test('Gemini出力を正規化し、許可された公開タグだけを採用する', () => {
  const metadata = validateMetadata({
    slug: ' Astro Notion Sync ',
    publicTags: ['notion', 'INBOX', 'Unknown', 'ASTRO', 'Notion'],
    newTagSuggestions: ['Content Pipeline', 'Astro', 'Study.Log']
  }, input);

  assert.deepEqual(metadata, {
    slug: 'astro-notion-sync',
    publicTags: ['Notion', 'Astro'],
    newTagSuggestions: ['Content Pipeline'],
    source: 'gemini'
  });
});

test('規約外のslugは拒否する', () => {
  assert.throws(() => validateMetadata({
    slug: 'x',
    publicTags: [],
    newTagSuggestions: []
  }, input), /slugが規約に適合しません/);
});

test('APIキー未設定時は決定的なslugと空タグへフォールバックする', async () => {
  const generator = new GeminiMetadataGenerator({ apiKey: '' });
  const metadata = await generator.generate({
    ...input,
    title: '記事タイトル'
  });

  assert.equal(metadata.slug, 'post-12345678');
  assert.deepEqual(metadata.publicTags, []);
  assert.equal(metadata.source, 'fallback');
  assert.match(metadata.warning ?? '', /GEMINI_API_KEY/);
});

test('Gemini Structured Outputを解析する', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: JSON.stringify({
              slug: 'notion-astro-sync',
              publicTags: ['Notion', 'Astro'],
              newTagSuggestions: []
            })
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const generator = new GeminiMetadataGenerator({
    apiKey: 'test-key',
    fetchImpl,
    timeoutMs: 1_000
  });

  const metadata = await generator.generate(input);

  assert.equal(metadata.source, 'gemini');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /gemini-3\.1-flash-lite/);
  assert.equal((requests[0].init?.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
  const body = JSON.parse(String(requests[0].init?.body));
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.publicTags.items.enum, [
    'Astro',
    'Notion'
  ]);
});

test('Geminiが2回失敗しても同期用フォールバックを返す', async () => {
  let attempts = 0;
  const generator = new GeminiMetadataGenerator({
    apiKey: 'test-key',
    fetchImpl: async () => {
      attempts++;
      return new Response('rate limited', { status: 429 });
    },
    timeoutMs: 1_000
  });

  const metadata = await generator.generate(input);

  assert.equal(attempts, 2);
  assert.equal(metadata.source, 'fallback');
  assert.equal(metadata.slug, 'astro-notion');
  assert.deepEqual(metadata.publicTags, []);
  assert.match(metadata.warning ?? '', /Gemini API 429/);
});
