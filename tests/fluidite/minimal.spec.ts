import { test, expect } from '@playwright/test';

test('minimal test', async ({ page }) => {
    await page.goto('http://127.0.0.1:5180');
    expect(await page.title()).toBeDefined();
});
