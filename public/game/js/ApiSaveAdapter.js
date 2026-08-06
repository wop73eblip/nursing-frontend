// ApiSaveAdapter.js — 透過後端 API 存檔（最終存進 Supabase，綁定登入帳號）
// -------------------------------------------------------------
// 為什麼不直接連 Supabase？
//   直接連 Supabase 需要「service key」這把萬能鑰匙，一旦放進網頁就等於
//   公開給所有人，任何人都能改資料庫。所以正確做法是：
//   遊戲 → 呼叫你自己的後端 (FastAPI) → 後端用 service key 存進 Supabase。
//
// 身分怎麼來？
//   沿用排班系統登入後存在 localStorage 的 JWT token。後端會從 token 解出
//   uid，前端傳什麼身分都不算數 —— 你只能存/讀自己的進度。
//
// 介面與 LocalSaveAdapter 一致（load / save / clear），所以兩者可互換。
// -------------------------------------------------------------

export class ApiSaveAdapter {
  /**
   * @param {string} base 後端網址（例如 https://xxx.up.railway.app）
   */
  constructor(base) {
    this.base = (base || "").replace(/\/$/, "");
  }

  _headers(withJson) {
    const token = localStorage.getItem("token");
    const h = {};
    if (withJson) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  // 讀自己的存檔；沒有存檔回 null（新玩家）
  async load(/* userId 由後端從 token 決定，這裡不需要 */) {
    let res;
    try {
      // 10 秒逾時：後端沒回應時快速失敗並顯示原因，不要讓玩家一直空等。
      // 注意：這裡失敗一定要往外丟錯（不能當成「新玩家」開空白局），
      // 否則空白進度會在自動存檔時覆蓋掉雲端上的真實存檔。
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      res = await fetch(`${this.base}/game/save`, { headers: this._headers(false), signal: ctrl.signal });
      clearTimeout(timer);
    } catch (e) {
      // 連不上（網路/快取到舊網址/防火牆）：把目標網址一起顯示，方便判斷
      throw new Error(`連不到伺服器（${this.base}）。請按 Ctrl+F5 重新整理再試；若在院內網路，請改用行動網路測試。`);
    }
    if (res.status === 401) throw new Error("登入已過期，請重新登入");
    if (!res.ok) throw new Error(`讀取存檔失敗：HTTP ${res.status}（${this.base}）`);
    const json = await res.json();
    return json.data || null;
  }

  async save(_userId, data) {
    const res = await fetch(`${this.base}/game/save`, {
      method: "PUT",
      headers: this._headers(true),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error("存檔失敗：HTTP " + res.status);
  }

  async clear() {
    const res = await fetch(`${this.base}/game/save`, {
      method: "DELETE",
      headers: this._headers(false),
    });
    if (!res.ok) throw new Error("清除存檔失敗：HTTP " + res.status);
  }
}
