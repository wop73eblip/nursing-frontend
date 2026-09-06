/**
 * Smoke tests:確保各 tab 能開、關鍵元素能看到。
 * 純讀取,不改變 DB 狀態。
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, clickTab } from './helpers';

test.describe('未登入行為', () => {
  test('未登入應該導向登入頁', async ({ page }) => {
    await page.goto('/admin');
    // 應該看到登入表單(有 email/password 欄位)或被導回 login
    const loginSignals = ['登入', 'Login', '帳號', 'email'];
    const found = await Promise.race(
      loginSignals.map((t) =>
        page.waitForSelector(`text=/${t}/i`, { timeout: 10_000 }).then(() => true).catch(() => false)
      )
    );
    expect(found).toBe(true);
  });
});

test.describe('已登入 admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('主頁能看到所有 tab', async ({ page }) => {
    // 依據 AdminPage.tsx TABS 定義
    const expectedTabs = ['手動填寫', '排班週期', '排班規則', '規則總覽', '一鍵生成', '帳號管理', '班別設定'];
    for (const label of expectedTabs) {
      const visible = await page.locator(`text=${label}`).first().isVisible();
      expect(visible, `tab "${label}" 應該可見`).toBe(true);
    }
  });

  test('「排班規則」tab 顯示關鍵設定', async ({ page }) => {
    await clickTab(page, '排班規則');
    // 應該看到「一例一休」「應休優先」「應休縮減公平硬性」這幾個 checkbox
    await expect(page.locator('text=/一例一休/').first()).toBeVisible();
    await expect(page.locator('text=/應休優先/').first()).toBeVisible();
    await expect(page.locator('text=/應休縮減公平硬性/').first()).toBeVisible();
  });

  test('「排班規則」內能展開「進階調參」看 penalty 欄位', async ({ page }) => {
    await clickTab(page, '排班規則');
    // summary 標題總是可見(details 折疊時)
    const summary = page.locator('summary:has-text("進階調參")').first();
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toBeVisible();
    // 點展開 details
    await summary.click();
    await page.waitForTimeout(300);
    // 展開後 penalty 欄位應該可見
    await expect(page.locator('text=/H14 雙週期加總比例目標/').first()).toBeVisible();
    await expect(page.locator('text=/每人少休上限/').first()).toBeVisible();
  });

  test('「規則總覽」tab 列出硬規則', async ({ page }) => {
    await clickTab(page, '規則總覽');
    await expect(page.locator('text=H1').first()).toBeVisible();
    await expect(page.locator('text=H2').first()).toBeVisible();
    await expect(page.locator('text=H14').first()).toBeVisible();
    await expect(page.locator('text=H20').first()).toBeVisible();
  });

  test('「一鍵生成」tab 顯示生成前確認清單', async ({ page }) => {
    await clickTab(page, '一鍵生成');
    await expect(page.locator('text=/生成前確認清單/').first()).toBeVisible();
    await expect(page.locator('text=/一鍵生成排班/').first()).toBeVisible();
    await expect(page.locator('text=/人力試算/').first()).toBeVisible();
  });

  test('「規則總覽」H2 desc 涵蓋指定休', async ({ page }) => {
    await clickTab(page, '規則總覽');
    // H2 desc 明列「指定休 OFF」(strict mode 用 first)
    await expect(page.locator('text=/指定休.*OFF/').first()).toBeVisible();
  });

  test('「規則總覽」H14 顯示為軟目標', async ({ page }) => {
    await clickTab(page, '規則總覽');
    await expect(page.locator('text=/雙週期加總比例目標/').first()).toBeVisible();
  });
});
