import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 測試設定。
 *
 * 執行方式:
 *   Terminal 1(啟動 backend + frontend dev server,或直接打線上):
 *     TEST_BASE_URL=https://nursing-system.pages.dev   (線上,推薦)
 *   或
 *     Terminal A: cd backend && venv/Scripts/python -m uvicorn main:app --port 8877
 *     Terminal B: cd frontend && npm run dev  (預設 5173)
 *     TEST_BASE_URL=http://localhost:5173
 *
 *   Terminal 2: npx playwright test
 */
export default defineConfig({
  testDir: './tests-e2e',
  timeout: 60_000,           // 每個測試最多 60s
  expect: { timeout: 10_000 },
  fullyParallel: false,      // 避免多個 test 同時動 DB
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'https://nursing-system.pages.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
