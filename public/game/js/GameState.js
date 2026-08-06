// GameState.js — 遊戲狀態（單一資料來源）
// -------------------------------------------------------------
// 存的東西就是要進存檔的東西：
//   sceneId    目前所在場景
//   flags      劇情旗標（例如 read_handover: true，用來記「已經做過什麼」）
//   inventory  持有道具 id 陣列
//   visited    去過哪些場景
//
// startItems：每個帳號「內建」的道具（例如職員證）。開新局會直接放進背包；
// 讀舊存檔時也會補上（確保每個帳號一定有這些內建道具）。
//
// 任何一次「有意義的變更」都會呼叫 onChange(data)，
// Game 會把它接到 SaveStore.autosave —— 這就是「進度到哪存到哪」。
// -------------------------------------------------------------

function blank(startScene, startItems) {
  return { sceneId: startScene, flags: {}, inventory: [...(startItems || [])], visited: {} };
}

export class GameState {
  constructor({ userId, onChange, startItems }) {
    this.userId = userId;
    this.onChange = onChange || (() => {});
    this.startItems = startItems || [];
    this.data = blank(null, this.startItems);
  }

  // 從存檔載入；沒有存檔就用 fallbackScene 開新局
  load(saved, fallbackScene) {
    if (saved) {
      this.data = {
        sceneId: saved.sceneId || fallbackScene,
        flags: saved.flags || {},
        inventory: saved.inventory || [],
        visited: saved.visited || {},
      };
      // 補上每個帳號應有的內建道具（例如職員證），避免舊存檔缺漏
      for (const id of this.startItems) {
        if (!this.data.inventory.includes(id)) this.data.inventory.push(id);
      }
    } else {
      this.data = blank(fallbackScene, this.startItems);
    }
  }

  reset(startScene) {
    this.data = blank(startScene, this.startItems);
    this._changed();
  }

  _changed() {
    this.onChange(this.data);
  }

  // ---- 場景 ----
  get sceneId() { return this.data.sceneId; }
  setScene(id) {
    this.data.sceneId = id;
    this.data.visited[id] = true;
    this._changed();
  }
  hasVisited(id) { return !!this.data.visited[id]; }

  // ---- 劇情旗標 ----
  getFlag(key) { return !!this.data.flags[key]; }
  setFlag(key, value = true) {
    this.data.flags[key] = value;
    this._changed();
  }

  // ---- 道具 ----
  get inventory() { return this.data.inventory; }
  hasItem(id) { return this.data.inventory.includes(id); }
  addItem(id) {
    if (!this.hasItem(id)) {
      this.data.inventory.push(id);
      this._changed();
    }
  }
  removeItem(id) {
    this.data.inventory = this.data.inventory.filter((x) => x !== id);
    this._changed();
  }
}
