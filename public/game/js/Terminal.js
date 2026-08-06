// Terminal.js — 電腦終端機輸入解謎
// -------------------------------------------------------------
// 點場景裡的電腦螢幕 hotspot → 開這個終端機面板：
//   顯示「輸入：_ _ _ _ _」，玩家用鍵盤（含手機螢幕鍵盤）打字，
//   按 ENTER（實體 Enter、手機鍵盤的「前往」、或畫面上的 ENTER 鍵）。
//   答對（不分大小寫）→ 立刻呼叫 onSuccess（換場景），不需再點一次。
// 用 <form> + type=submit，手機上按鍵盤 Enter 就直接送出，不會有
// 「第一下只收鍵盤、要點第二下」的問題。
// -------------------------------------------------------------

export class Terminal {
  constructor({ mount }) {
    this._answer = "";
    this._onSuccess = null;
    this._wrongMsg = "ERROR";
    this._build(mount);

    // 面板開著時按 Esc 關閉（Enter 交給表單處理）
    window.addEventListener("keydown", (e) => {
      if (this.isOpen() && e.key === "Escape") this.close();
    });
  }

  _build(mount) {
    this.overlay = document.createElement("div");
    this.overlay.className = "term-overlay";
    this.overlay.innerHTML = `
      <div class="term-monitor">
        <form class="term-form">
          <div class="term-screen">
            <div class="term-title">◉ SYSTEM LOGIN</div>
            <div class="term-promptline">輸入：<input class="term-input" type="text"
              enterkeyhint="go" autocomplete="off" autocapitalize="off" autocorrect="off"
              spellcheck="false"></div>
            <div class="term-msg"></div>
          </div>
          <div class="term-bar">
            <button type="button" class="term-close">✕</button>
            <button type="submit" class="term-enter">ENTER ⏎</button>
          </div>
        </form>
      </div>`;
    mount.appendChild(this.overlay);

    this.input = this.overlay.querySelector(".term-input");
    this.msgEl = this.overlay.querySelector(".term-msg");
    this.overlay.querySelector(".term-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });
    this.overlay.querySelector(".term-close").addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) this.close(); });
    // 註：不在 input 事件裡清 msg。手機 IME 按 Enter 送出時常會多觸發一次
    //     input 事件，會把剛剛設好的 ERROR 秒清。訊息只在 open()／下一次送出
    //     時清即可。
  }

  isOpen() { return this.overlay.classList.contains("on"); }

  /**
   * @param {string}   opts.answer     正確答案（比對時不分大小寫、去頭尾空白）
   * @param {Function} opts.onSuccess  答對後立刻執行（例如換場景）
   * @param {string}  [opts.wrongMsg] 答錯提示（預設 "ERROR"）
   */
  open({ answer, onSuccess, wrongMsg }) {
    this._answer = String(answer || "");
    this._onSuccess = onSuccess || null;
    this._wrongMsg = wrongMsg || "ERROR";
    this.input.value = "";
    this.msgEl.textContent = "";
    this.msgEl.className = "term-msg";
    this.overlay.classList.add("on");
    setTimeout(() => this.input.focus(), 100);
  }

  close() {
    this.overlay.classList.remove("on");
    this.input.blur();
  }

  _submit() {
    const val = this.input.value.trim().toLowerCase();
    if (val === this._answer.trim().toLowerCase()) {
      // 答對：立刻關閉並執行下一步（換場景），不需再點
      const cb = this._onSuccess;
      this.close();
      if (cb) cb();
    } else {
      // 答錯：顯示 ERROR。class 用 term-err（不用 err），因為頁尾另一個 .err
      // 有 display:none 會把整個 msgEl 藏起來 —— 這曾經是 ERROR 完全不顯示的原因。
      this.msgEl.className = "term-msg term-err";
      this.msgEl.textContent = this._wrongMsg;
      this.input.select();
    }
  }
}
