// MessageBoard.js — 遊戲內留言板
// -------------------------------------------------------------
// 玩家點場景裡的留言板 hotspot → 開這個面板：打字、送出。
//   - 送出：POST /game/messages（身分由後端從 token 決定）
//   - 顯示：GET /game/messages（一般玩家後端只回自己的；管理員回全部）
// 未登入（本機開發）時只提示「登入後才能留言」。
// -------------------------------------------------------------

export class MessageBoard {
  /**
   * @param {Element} mount    疊在場景上的容器（通常是 #stage）
   * @param {string}  apiBase  後端網址
   * @param {Object}  auth     登入資訊 { token, name } 或 null
   */
  constructor({ mount, apiBase, auth }) {
    this.apiBase = (apiBase || "").replace(/\/$/, "");
    this.auth = auth || null;
    this._build(mount);
  }

  _build(mount) {
    this.overlay = document.createElement("div");
    this.overlay.className = "mb-overlay";
    this.overlay.innerHTML = `
      <div class="mb-panel">
        <div class="mb-head">
          <span class="mb-title">📌 留言板</span>
          <button type="button" class="mb-close" aria-label="關閉">✕</button>
        </div>
        <div class="mb-compose">
          <textarea class="mb-input" rows="3" maxlength="500" placeholder="寫下你的留言…"></textarea>
          <div class="mb-actions">
            <span class="mb-status"></span>
            <button type="button" class="mb-send">送出</button>
          </div>
        </div>
        <div class="mb-listwrap">
          <div class="mb-listtitle">我的留言</div>
          <div class="mb-list"></div>
        </div>
      </div>`;
    mount.appendChild(this.overlay);

    this.input = this.overlay.querySelector(".mb-input");
    this.sendBtn = this.overlay.querySelector(".mb-send");
    this.statusEl = this.overlay.querySelector(".mb-status");
    this.listEl = this.overlay.querySelector(".mb-list");

    this.overlay.querySelector(".mb-close").addEventListener("click", () => this.close());
    // 點面板外的暗色區也可關閉
    this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) this.close(); });
    this.sendBtn.addEventListener("click", () => this._send());
  }

  isOpen() { return this.overlay.classList.contains("on"); }

  open() {
    this.overlay.classList.add("on");
    this.statusEl.textContent = "";
    if (!this.auth) {
      this.input.disabled = true;
      this.sendBtn.disabled = true;
      this.input.placeholder = "登入後才能留言";
      this.listEl.innerHTML = `<div class="mb-empty">登入後才能使用留言板。</div>`;
      return;
    }
    this.input.disabled = false;
    this.sendBtn.disabled = false;
    this._load();
    // 給手機一點時間彈出鍵盤前先聚焦
    setTimeout(() => this.input.focus(), 100);
  }

  close() {
    this.overlay.classList.remove("on");
    this.input.blur();
  }

  _headers(json) {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    if (this.auth?.token) h["Authorization"] = `Bearer ${this.auth.token}`;
    return h;
  }

  async _load() {
    this.listEl.innerHTML = `<div class="mb-empty">載入中…</div>`;
    try {
      const r = await fetch(`${this.apiBase}/game/messages`, { headers: this._headers(false) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const { messages } = await r.json();
      this._render(messages || []);
    } catch (e) {
      this.listEl.innerHTML = `<div class="mb-empty">留言載入失敗，請稍後再試。</div>`;
    }
  }

  _render(messages) {
    if (!messages.length) {
      this.listEl.innerHTML = `<div class="mb-empty">還沒有留言，寫下第一則吧！</div>`;
      return;
    }
    this.listEl.innerHTML = "";
    messages.forEach((m) => {
      const div = document.createElement("div");
      div.className = "mb-item";
      div.innerHTML = `<div class="mb-item-meta">${this._fmt(m.created_at)}</div>
        <div class="mb-item-text"></div>`;
      div.querySelector(".mb-item-text").textContent = m.text; // textContent 防 XSS
      this.listEl.appendChild(div);
    });
  }

  _fmt(iso) {
    try {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch { return ""; }
  }

  async _send() {
    const text = this.input.value.trim();
    if (!text) { this.statusEl.textContent = "請先輸入內容"; return; }
    this.sendBtn.disabled = true;
    this.statusEl.textContent = "送出中…";
    try {
      const r = await fetch(`${this.apiBase}/game/messages`, {
        method: "POST",
        headers: this._headers(true),
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      this.input.value = "";
      this.statusEl.textContent = "已送出 ✓";
      await this._load();
    } catch (e) {
      this.statusEl.textContent = "送出失敗，請稍後再試";
    } finally {
      this.sendBtn.disabled = false;
    }
  }
}
