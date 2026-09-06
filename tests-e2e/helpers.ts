/**
 * E2E test helpers:auth token 產生、tab 切換 helper。
 *
 * 用 API JWT 塞 localStorage 繞過 UI 登入,test 中不需密碼。
 * SECRET_KEY 從 backend/.env 讀(local test 用),CI 用 GitHub secrets。
 */
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

// ESM 模式下沒有 __dirname,用 import.meta.url 換算
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 讀 backend/.env 拿 SECRET_KEY */
function readSecretKey(): string {
  // 1) env 優先(CI 環境)
  if (process.env.TEST_SECRET_KEY) return process.env.TEST_SECRET_KEY;
  // 2) 讀 backend/.env(local dev)
  const envPath = path.resolve(__dirname, '../../backend/.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `找不到 SECRET_KEY:設 env TEST_SECRET_KEY,或確保 backend/.env 存在`
    );
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(/^SECRET_KEY=(.+)$/m);
  if (!match) throw new Error('backend/.env 找不到 SECRET_KEY');
  return match[1].trim();
}

/** 產生 test JWT(superadmin,2 小時有效) */
export function makeTestToken(role: string = 'superadmin', name: string = 'e2e-tester'): string {
  const secret = readSecretKey();
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'e2e_test_user',
    role,
    name,
    exp: Math.floor(Date.now() / 1000) + 2 * 3600,
  };
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const message = `${b64(header)}.${b64(payload)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${message}.${signature}`;
}

/** 用 JWT 直接進 admin 頁,繞過 UI 登入 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const token = makeTestToken('superadmin');
  // 先 goto root 才能 setItem(localStorage 綁 origin)
  await page.goto('/');
  await page.evaluate((tok) => {
    localStorage.setItem('token', tok);
    localStorage.setItem('user', JSON.stringify({
      uid: 'e2e_test_user',
      name: 'e2e-tester',
      role: 'superadmin',
      token: tok,
    }));
  }, token);
  await page.goto('/admin');
  // 等到 tab 列表出現(標記已進入 admin 頁)
  await page.waitForSelector('text=排班規則', { timeout: 15_000 });
}

/** 切到指定 tab */
export async function clickTab(page: Page, label: string): Promise<void> {
  await page.click(`text=${label}`);
  // 等 tab 切換動畫完成
  await page.waitForTimeout(300);
}
