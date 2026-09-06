// actions.js — 場景事件（action）派發機制
// -------------------------------------------------------------
// hotspot 的 "action" 欄位對應到這裡的一個 handler。
// 新增事件只要在 actionHandlers 裡加一筆，不用改 SceneViewer。
//
// handler 收到的 ctx（由 Game 組好）：
//   ctx.action     觸發的事件名稱
//   ctx.hotspot    被點擊的 hotspot 資料
//   ctx.sceneId    目前場景 ID
//   ctx.viewer     SceneViewer 實例（可 viewer.goto(...)）
//   ctx.game       Game 主控
//   ctx.state      GameState（讀/寫旗標、道具）
//   ctx.dialogue   對話框系統（ctx.dialogue.run("對話id")）
//   ctx.inventory  背包系統（ctx.inventory.getSelected() 可知玩家選了哪個道具）
// -------------------------------------------------------------

export const actionHandlers = {
  // 點大門：提示要刷卡
  door_locked(ctx) {
    ctx.dialogue.run("door_no_card");
  },

  // 點讀卡機：有「選取」職員證才開門，否則提示先選道具
  swipe_card(ctx) {
    if (ctx.inventory.getSelected() === "staff_card") {
      ctx.inventory.clearSelection();   // 刷完取消選取
      ctx.viewer.goto("gate_front_open");   // 開門 → 下一張圖
    } else {
      ctx.dialogue.run("need_select_card");
    }
  },

  // 護理長辦公室：打開留言板
  open_message_board(ctx) {
    if (ctx.game.messageBoard) ctx.game.messageBoard.open();
    else console.warn("[action] 留言板尚未初始化");
  },

  // 會議室電腦：終端機輸入，答案 "er"（不分大小寫）→ 開下一張圖
  // 如果鑰匙已被拿走，直接跳到「沒 CD」版本，避免又出現一次可點的鑰匙 hotspot。
  open_pc_terminal(ctx) {
    ctx.game.terminal.open({
      answer: "er",
      onSuccess: () => {
        const dest = ctx.state.hasItem("conference_cabinet_key")
          ? "conference_room_pc-nocd"
          : "conference_room_pc-cd";
        ctx.viewer.goto(dest);
      },
    });
  },

  // 會議室 CD 場景：點櫃子上的鑰匙 → 顯示對話（含 give 道具）→ 對話關閉後換成 -nocd 場景
  take_cabinet_key(ctx) {
    ctx.dialogue.run("got_cabinet_key", () => {
      ctx.viewer.goto("conference_room_pc-nocd");
    });
  },

  // 會議室櫃子鎖孔：要先在背包點選「會議室櫃子鑰匙」再點鎖孔才會開
  // 開了以後鑰匙就消失（單次使用）
  use_cabinet_key(ctx) {
    if (ctx.inventory.getSelected() === "conference_cabinet_key") {
      ctx.inventory.clearSelection();
      ctx.state.removeItem("conference_cabinet_key");
      ctx.viewer.goto("conference_RLQ_open");
    } else {
      ctx.dialogue.run("need_select_cabinet_key");
    }
  },

  // 之後陸續補：其他 hotspot 事件 ...
};

// 統一派發入口。找不到 handler 只警告、不報錯，
// 方便先在 scenes.json 佈好 action 名稱，之後再補實作。
export function dispatchAction(ctx) {
  const handler = actionHandlers[ctx.action];
  if (typeof handler === "function") {
    handler(ctx);
  } else {
    console.warn(`[action] 尚未定義的事件：「${ctx.action}」（hotspot: ${ctx.hotspot?.id}）`);
  }
}
