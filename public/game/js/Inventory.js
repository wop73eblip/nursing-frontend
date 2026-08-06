// Inventory.js — 道具 / 背包系統（固定格數 + 可選取）
// -------------------------------------------------------------
// 道具「持有清單」放在 GameState.inventory（會進存檔）。
// 道具「定義」（名稱/圖示/說明）放在 data/items.json。
//
// 顯示：固定 N 格（預設 3）方形格子，持有的道具依序填入，空格留白。
// 選取：點一格會「選取」該道具（再點一次取消）。被選取的道具會高亮，
//       hotspot 可用 getSelected() 判斷玩家有沒有選某道具（＝對物件使用道具）。
// -------------------------------------------------------------

export class Inventory {
  /**
   * @param {Element}  mount   背包列容器
   * @param {Object}   items   items.json（id -> {name, icon, desc}）
   * @param {GameState}state   讀持有清單用
   * @param {number}  [slots=3] 格子數
   * @param {Function}[onSelectChange] 選取變更回呼 (selectedId|null) => void
   */
  constructor({ mount, items, state, slots = 3, onSelectChange }) {
    this.mount = mount;
    this.items = items || {};
    this.state = state;
    this.slots = slots;
    this.selected = null;
    this.onSelectChange = onSelectChange || (() => {});
  }

  getSelected() { return this.selected; }

  clearSelection() {
    if (this.selected !== null) {
      this.selected = null;
      this.render();
      this.onSelectChange(null);
    }
  }

  _toggle(id) {
    this.selected = this.selected === id ? null : id;
    this.render();
    this.onSelectChange(this.selected);
  }

  render() {
    const held = this.state.inventory;
    // 選取的道具若已不在背包，取消選取
    if (this.selected && !held.includes(this.selected)) this.selected = null;

    this.mount.innerHTML = "";
    for (let i = 0; i < this.slots; i++) {
      const id = held[i];
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className =
        "inv-slot" + (id ? " filled" : "") + (id && id === this.selected ? " selected" : "");
      if (id) {
        const def = this.items[id] || { name: id, icon: "❓" };
        slot.dataset.item = id;
        slot.title = def.name;
        slot.innerHTML = `<span class="inv-icon">${def.icon}</span><span class="inv-name">${def.name}</span>`;
        slot.addEventListener("click", () => this._toggle(id));
      } else {
        slot.disabled = true;
      }
      this.mount.appendChild(slot);
    }
  }
}
