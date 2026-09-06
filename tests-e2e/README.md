# Frontend E2E 測試(Playwright)

## 快速使用

```bash
cd frontend
npx playwright test                    # 打線上 default(https://nursing-system.pages.dev)
npx playwright test --ui               # 開 UI 模式(視覺化跑測試)
npx playwright test smoke              # 只跑 smoke 測試
npx playwright test --debug            # debug 模式(step by step)
```

## 打本地 dev server(需先開 vite + backend)

```bash
# Terminal A: cd backend && venv/Scripts/python -m uvicorn main:app --port 8877
# Terminal B: cd frontend && npm run dev
# Terminal C:
cd frontend
TEST_BASE_URL=http://localhost:5173 npx playwright test
```

## 目前涵蓋

### `smoke.spec.ts`(純讀取,不動 DB;共 8 個 test,~10 秒)
- 未登入導向登入頁
- 主頁能看到 7 個主 tab
- 「排班規則」顯示關鍵 checkbox(一例一休、應休優先、應休縮減公平硬性)
- 「排班規則」內能展開「進階調參」看 penalty 欄位
- 「規則總覽」列出 H1/H2/H14/H20
- 「一鍵生成」顯示生成前確認清單 + 人力試算
- H2 desc 涵蓋指定休
- H14 顯示為軟目標

## 加寫入類測試

若需要測「儲存 → 驗證 → 恢復」流程,可用類似 pattern:
1. 讀當前值 → 存為 original
2. 改新值
3. 點「儲存」
4. 重整
5. 驗證新值有存
6. 改回 original

**注意**:寫入類測試會動線上 DB,執行前務必確定不影響 production 使用者。

## 認證方式

Test 用 backend `SECRET_KEY` 直接產 JWT 塞 localStorage,**不用密碼**。
本機跑會自動讀 `backend/.env`;CI 環境用 env `TEST_SECRET_KEY`。

## 加新測試

在 `tests-e2e/` 建 `xxx.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin, clickTab } from './helpers';

test('我的測試', async ({ page }) => {
  await loginAsAdmin(page);
  await clickTab(page, '排班規則');
  await expect(page.locator('text=XXX')).toBeVisible();
});
```

## 失敗時

Playwright 自動存:
- 螢幕截圖:`test-results/`
- 錄影:`test-results/`
- Trace:`test-results/`(可用 `npx playwright show-trace xxx.zip` 回放)

## 定期跑

以後改 frontend 前跑一次:
```bash
cd frontend && npx playwright test
```

全綠再 deploy,拆 code 也不怕破壞既有功能。
