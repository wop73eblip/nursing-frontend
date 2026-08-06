// Game.js — 遊戲主控：把各系統接起來
// -------------------------------------------------------------
// 職責：
//   - 建立 SaveStore / GameState，接好「狀態變更 → 自動存檔 → 更新 UI」
//   - 建立 SceneViewer（場景）、Dialogue（對話）、Inventory（背包）
//   - hotspot 觸發時，組好完整 ctx 丟給 actions.js 派發
//   - 提供切換帳號（載入該帳號的存檔）、清除存檔
//
// 注意：存檔可能是「網路存檔」（ApiSaveAdapter），讀檔要等網路，
// 所以載入流程是非同步的 —— 建構子只做同步準備，實際載入放在 init()，
// 使用端要 `const g = new Game(...); await g.init();`。
// -------------------------------------------------------------

import { SceneViewer } from "./SceneViewer.js";
import { dispatchAction } from "./actions.js";
import { SaveStore } from "./SaveStore.js";
import { GameState } from "./GameState.js";
import { Dialogue } from "./Dialogue.js";
import { Inventory } from "./Inventory.js";
import { Terminal } from "./Terminal.js";

export class Game {
  /**
   * @param {Object}    opts
   * @param {Element}   opts.sceneMount  場景掛載點（#scene）
   * @param {Element}   opts.dialogMount 對話框掛載點（疊在場景上，通常是 #stage）
   * @param {Element}   opts.invMount    背包列掛載點（#inv）
   * @param {Object}    opts.scenes      scenes.json
   * @param {Object}    opts.dialogues   dialogues.json
   * @param {Object}    opts.items       items.json
   * @param {string}    opts.userId      目前帳號 id
   * @param {Object}   [opts.adapter]    存檔 adapter（不給＝用 localStorage）
   * @param {string}   [opts.imageBase]  圖片前綴
   * @param {Function} [opts.onUpdate]   UI 需要更新時的回呼
   */
  constructor(opts) {
    this.opts = opts;
    this.scenes = opts.scenes;
    this.dialogues = opts.dialogues;
    this.items = opts.items;
    this.userId = opts.userId;
    this.imageBase = opts.imageBase ?? "assets/";
    this.onUpdate = opts.onUpdate || (() => {});
    this.startItems = opts.startItems || []; // 每個帳號內建道具（例如職員證）
    this.messageBoard = opts.messageBoard || null; // 留言板（由 index.html 建好傳入）
    this.firstScene = Object.keys(this.scenes)[0];

    // ---- 存檔 + 狀態 ----
    this.store = new SaveStore(opts.adapter); // 給 adapter 就用它（例如 ApiSaveAdapter）
    this.state = new GameState({
      userId: this.userId,
      startItems: this.startItems,
      onChange: (data) => this._onStateChange(data),
    });

    // ---- 背包（3 格、可選取道具）----
    this.inventory = new Inventory({
      mount: opts.invMount,
      items: this.items,
      state: this.state,
      slots: 3,
    });

    // ---- 對話框 ----
    this.dialogue = new Dialogue({
      mount: opts.dialogMount,
      dialogues: this.dialogues,
      onEffect: ({ set, give }) => {
        if (set) this.state.setFlag(set);
        if (give) this.state.addItem(give);
      },
    });

    // ---- 終端機解謎（電腦螢幕輸入）----
    this.terminal = new Terminal({ mount: opts.dialogMount });

    this.viewer = null; // 等 init() 載入存檔後才建立（要用存到哪個場景當起點）
  }

  // 非同步載入存檔並開場
  async init() {
    const saved = await this.store.load(this.userId);
    this.state.load(saved, this.firstScene);
    // 存檔記的場景若已不存在（改版後場景改名/移除），回到起始場景，避免整頁空白
    if (!this.scenes[this.state.sceneId]) this.state.data.sceneId = this.firstScene;

    this.viewer = new SceneViewer({
      mount: this.opts.sceneMount,
      scenes: this.scenes,
      imageBase: this.imageBase,
      startScene: this.state.sceneId, // 從存檔的場景接續
      onAction: (ctx) => this._onAction(ctx),
      onSceneChange: (id) => {
        this.state.setScene(id); // 換場景 → 進狀態 → 自動存檔
        this.onUpdate(this);
      },
    });

    this.inventory.render();
    this.onUpdate(this);
    return this;
  }

  // 狀態一有變更就自動存檔，並刷新背包/標題
  _onStateChange(data) {
    this.store.autosave(this.userId, data);
    this.inventory.render();
    this.onUpdate(this);
  }

  // hotspot 觸發：組好 ctx 交給 actions.js
  _onAction(ctx) {
    if (this.dialogue.isActive()) return; // 對話中不重複觸發
    dispatchAction({
      ...ctx,
      game: this,
      state: this.state,
      dialogue: this.dialogue,
      inventory: this.inventory,
    });
  }

  // ---- 帳號 / 存檔控制 ----

  // 切換帳號（本機開發用；正式登入版帳號固定為登入者，不會用到）
  async switchUser(newUserId) {
    if (!newUserId || newUserId === this.userId) return;
    await this.store.saveNow(this.userId, this.state.data); // 先把目前帳號存起來
    this.userId = newUserId;
    this.state.userId = newUserId;
    this.state.load(await this.store.load(newUserId), this.firstScene);
    if (!this.scenes[this.state.sceneId]) this.state.data.sceneId = this.firstScene;
    this.viewer.goto(this.state.sceneId);
    this.inventory.render();
    this.onUpdate(this);
  }

  // 清除目前帳號存檔並重新開始
  async resetProgress() {
    await this.store.clear(this.userId);
    this.state.reset(this.firstScene);
    this.viewer.goto(this.firstScene);
    this.inventory.render();
    this.onUpdate(this);
  }

  setDevMode(on) {
    this.viewer.setDevMode(on);
  }
}
