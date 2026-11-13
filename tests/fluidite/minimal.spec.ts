import { test, expect } from './base';

test('minimal test', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toBeDefined();
});
