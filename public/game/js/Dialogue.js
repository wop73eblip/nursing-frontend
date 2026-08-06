// Dialogue.js — 對話框系統（資料驅動）
// -------------------------------------------------------------
// 對話腳本放在 data/dialogues.json，一段對話是一棵「節點樹」：
//   {
//     "start": "a",
//     "nodes": {
//       "a": { "who":"旁白", "text":"...", "next":"b" },
//       "b": { "who":"學姐", "text":"...", "choices":[
//                { "t":"選項一", "next":"c", "set":"某旗標", "give":"某道具" },
//                { "t":"選項二", "next":null }   // next 為 null = 對話結束
//              ]},
//       "c": { "who":"你", "text":"...", "give":"handover_note", "next":null }
//     }
//   }
//
// 節點欄位：
//   who     說話者名稱
//   text    內文（可含簡單 HTML，如 <b>）
//   next    下一個節點 id；null 代表結束
//   choices 分支選項；有 choices 就不顯示「繼續」鍵
//   set     顯示此節點/選到此選項時，設定的劇情旗標
//   give    顯示此節點/選到此選項時，取得的道具 id
//
// 副作用（set / give）不直接改狀態，而是丟給 onEffect 回呼，
// 由 Game 決定怎麼套用到 GameState —— 保持對話系統與狀態解耦。
// -------------------------------------------------------------

export class Dialogue {
  /**
   * @param {Element}  mount     疊在場景上的容器（position:relative）
   * @param {Object}   dialogues dialogues.json 解析後的物件
   * @param {Function} onEffect  ({set?, give?}) => void
   */
  constructor({ mount, dialogues, onEffect }) {
    this.dialogues = dialogues || {};
    this.onEffect = onEffect || (() => {});
    this.active = false;
    this._done = null;
    this._buildDom(mount);

    // 鍵盤：對話中按 Enter / 空白鍵 = 繼續
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.key === "Enter" || e.key === " ") {
        if (this.contBtn.style.display !== "none") {
          e.preventDefault();
          this.contBtn.click();
        }
      }
    });
  }

  _buildDom(mount) {
    this.overlay = document.createElement("div");
    this.overlay.className = "dlg-overlay";
    this.overlay.innerHTML = `
      <div class="dlg-box">
        <div class="dlg-who"></div>
        <div class="dlg-text"></div>
        <div class="dlg-choices"></div>
        <div class="dlg-cont"><button type="button" class="dlg-cont-btn">繼續 ▸</button></div>
      </div>`;
    mount.appendChild(this.overlay);
    this.whoEl = this.overlay.querySelector(".dlg-who");
    this.textEl = this.overlay.querySelector(".dlg-text");
    this.choicesEl = this.overlay.querySelector(".dlg-choices");
    this.contBtn = this.overlay.querySelector(".dlg-cont-btn");
  }

  isActive() {
    return this.active;
  }

  /** 執行一段對話。done：對話結束時的回呼 */
  run(dialogueId, done) {
    const dlg = this.dialogues[dialogueId];
    if (!dlg) {
      console.warn(`[Dialogue] 找不到對話：「${dialogueId}」`);
      return;
    }
    this.active = true;
    this._done = done || null;
    this.overlay.classList.add("on");
    this._showNode(dlg, dlg.start);
  }

  _showNode(dlg, nodeId) {
    const node = dlg.nodes[nodeId];
    if (!node) {
      console.warn(`[Dialogue] 找不到節點：「${nodeId}」`);
      return this._end();
    }

    // 進入節點時套用副作用（set / give）
    this._applyEffect(node);

    this.whoEl.innerHTML = node.who || "";
    this.textEl.innerHTML = node.text || "";
    this.choicesEl.innerHTML = "";

    if (node.choices && node.choices.length) {
      // 分支：隱藏「繼續」，列出選項
      this.contBtn.parentElement.style.display = "none";
      node.choices.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dlg-opt";
        b.innerHTML = c.t;
        b.addEventListener("click", () => {
          this._applyEffect(c); // 選項本身也能 set / give
          this._goto(dlg, c.next);
        });
        this.choicesEl.appendChild(b);
      });
    } else {
      // 線性：顯示「繼續」
      this.contBtn.parentElement.style.display = "";
      this.contBtn.onclick = () => this._goto(dlg, node.next);
    }
  }

  _goto(dlg, nextId) {
    if (nextId == null) return this._end();
    this._showNode(dlg, nextId);
  }

  _applyEffect(obj) {
    if (obj.set || obj.give) {
      this.onEffect({ set: obj.set, give: obj.give });
    }
  }

  _end() {
    this.active = false;
    this.overlay.classList.remove("on");
    const done = this._done;
    this._done = null;
    if (done) done();
  }
}
