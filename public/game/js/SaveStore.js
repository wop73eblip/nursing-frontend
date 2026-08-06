// SaveStore.js — 存檔層（依帳號分開儲存、自動存檔）
// -------------------------------------------------------------
// 把「存到哪裡」抽象成 adapter：
//   - LocalSaveAdapter：存瀏覽器 localStorage（未登入 / 本機開發用）
//   - ApiSaveAdapter：透過後端存進 Supabase，綁定登入帳號（見 ApiSaveAdapter.js）
// 兩者介面一致（async load / save / clear），可直接互換。
//
// 所有方法都是「非同步」——因為 API 版本要等網路。localStorage 版本雖然
// 是同步的，也包成 async，讓上層一律用 await 處理，程式碼統一。
// -------------------------------------------------------------

const NS = "nursing-game"; // localStorage 命名空間

export class LocalSaveAdapter {
  _key(userId) {
    return `${NS}:save:${userId}`;
  }
  async load(userId) {
    try {
      const raw = localStorage.getItem(this._key(userId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("[SaveStore] 讀檔失敗", e);
      return null;
    }
  }
  async save(userId, data) {
    try {
      localStorage.setItem(this._key(userId), JSON.stringify(data));
    } catch (e) {
      console.warn("[SaveStore] 存檔失敗", e);
    }
  }
  async clear(userId) {
    localStorage.removeItem(this._key(userId));
  }
}

export class SaveStore {
  constructor(adapter) {
    this.adapter = adapter || new LocalSaveAdapter();
    this._timer = null;
    this._pending = null; // { userId, data }
  }

  load(userId) {
    return this.adapter.load(userId);
  }
  clear(userId) {
    return this.adapter.clear(userId);
  }

  // 自動存檔：進度到哪存到哪。短時間內多次變更只實際寫一次（debounce），
  // 存最新的一份，避免每動一下就打一次 API。
  autosave(userId, data, delay = 400) {
    this._pending = { userId, data };
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      const p = this._pending;
      this._pending = null;
      if (p) {
        Promise.resolve(this.adapter.save(p.userId, p.data)).catch((e) =>
          console.warn("[SaveStore] 自動存檔失敗", e)
        );
      }
    }, delay);
  }

  // 立即寫入（例如切換帳號前先存好）。回傳 Promise 可 await。
  saveNow(userId, data) {
    clearTimeout(this._timer);
    this._pending = null;
    return this.adapter.save(userId, data);
  }
}
