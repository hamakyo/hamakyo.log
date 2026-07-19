import { expect, test } from '@playwright/test';

const mainRoutes = [
  { path: '/', heading: 'Kyoshiro Hama' },
  { path: '/blog', heading: 'Posts' },
  { path: '/tags', heading: 'Tags' }
];

for (const route of mainRoutes) {
  test(`${route.path} が表示できる`, async ({ page }) => {
    const response = await page.goto(route.path);

    expect(response?.ok()).toBe(true);
    await expect(page.locator('h1').filter({ hasText: route.heading }).first()).toBeVisible();
  });
}

test('アーカイブが記事一覧を表示する', async ({ page }) => {
  const response = await page.goto('/archive');

  expect(response?.ok()).toBe(true);
  await expect(page.locator('main a[href^="/blog/"]').first()).toBeVisible();
});

test.describe('PC表示', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('記事の目次を表示し、#と見出しの間隔を確保する', async ({ page }) => {
    await page.goto('/blog/automate-notion-blog-sync-with-gemini');

    await expect(page.getByRole('heading', {
      name: 'Notion同期のSlugと公開タグをGemini 3.1 Flash-Liteに任せた'
    })).toBeVisible();
    await expect(page.getByRole('heading', { name: '目次', exact: true })).toBeVisible();

    const firstItem = page.locator('#toc > li').first();
    await expect(firstItem).toBeVisible();
    const marker = await firstItem.evaluate(element => {
      const style = getComputedStyle(element, '::before');
      return {
        content: style.content,
        marginRight: Number.parseFloat(style.marginRight)
      };
    });

    expect(marker.content).toContain('#');
    expect(marker.marginRight).toBeGreaterThanOrEqual(8);
  });
});

test.describe('モバイル表示', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('メニューを操作でき、横スクロールが発生しない', async ({ page }) => {
    await page.goto('/blog/automate-notion-blog-sync-with-gemini');

    await expect(page.getByRole('heading', { name: '目次', exact: true })).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Open main menu' });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'main menu' })).toBeVisible();

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  });
});
