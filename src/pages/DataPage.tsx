import { useNavigate } from "react-router-dom";
import { getAuth } from "../auth";

// 學習系統：目前放「護理訓練遊戲」一個項目，之後可再擴充其他模組。
type DataCard = {
  key: string;
  title: string;
  tagline: string;
  emoji: string;
  bg: string;
  open: () => void;
};

export default function DataPage() {
  const nav = useNavigate();
  const user = getAuth();

  const cards: DataCard[] = [
    {
      key: "game",
      title: "護理訓練遊戲",
      tagline: "劇情互動・邊玩邊學",
      emoji: "🏥",
      bg: "#fff1e0",
      // 同網域靜態遊戲，會沿用目前登入帳號自動存檔
      open: () => { window.location.href = "/game/index.html"; },
    },
  ];

  // 「遊戲內容管理」卡（遊戲後台）：僅超級管理員可見
  if ((user?.role ?? "") === "superadmin") {
    cards.push({
      key: "game-admin",
      title: "遊戲內容管理",
      tagline: "改對話・道具文字",
      emoji: "📝",
      bg: "#e7f0ff",
      open: () => nav("/game-admin"),
    });
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { background: #f0f4f8 !important; color-scheme: light !important; }
        .dp-root {
          min-height: 100svh; background: #f0f4f8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", "PingFang TC", sans-serif;
          display: flex; flex-direction: column; align-items: center; padding: 32px 16px 48px;
        }
        .dp-top { width: 100%; max-width: 480px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .dp-back {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 7px 14px;
          font-size: 13px; color: #475569; cursor: pointer; font-family: inherit; font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: background .15s, transform .1s;
        }
        .dp-back:hover { background: #f8fafc; }
        .dp-back:active { transform: scale(0.97); }
        .dp-hello { font-size: 15px; color: #475569; }
        .dp-hello b { color: #0f172a; font-weight: 700; }
        .dp-heading { width: 100%; max-width: 480px; font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 16px; letter-spacing: -0.3px; }
        .dp-grid { width: 100%; max-width: 480px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .dp-card {
          background: #fff; border-radius: 22px;
          box-shadow: 0 4px 20px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.05);
          padding: 22px 16px 20px; display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: 10px; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease;
          border: 1px solid rgba(15,23,42,0.04); -webkit-tap-highlight-color: transparent;
        }
        .dp-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,23,42,0.12); }
        .dp-card:active { transform: translateY(-1px) scale(0.99); }
        .dp-icon { width: 76px; height: 76px; border-radius: 22.37%; display: flex; align-items: center; justify-content: center; font-size: 38px; line-height: 1; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.03); }
        .dp-title { font-size: 17px; font-weight: 800; color: #0f172a; }
        .dp-tag { font-size: 12.5px; color: #94a3b8; line-height: 1.45; }
        @media (max-width: 360px) {
          .dp-card { padding: 18px 10px 16px; border-radius: 18px; }
          .dp-icon { width: 64px; height: 64px; font-size: 32px; }
          .dp-title { font-size: 15px; }
        }
      `}</style>

      <div className="dp-root">
        <div className="dp-top">
          <button className="dp-back" onClick={() => nav("/home")}>← 返回</button>
          <div className="dp-hello">哈囉，<b>{user?.name || "使用者"}</b></div>
        </div>

        <div className="dp-heading">學習系統</div>

        <div className="dp-grid">
          {cards.map(c => (
            <div key={c.key} className="dp-card" onClick={c.open} role="button">
              <div className="dp-icon" style={{ background: c.bg }}><span>{c.emoji}</span></div>
              <div className="dp-title">{c.title}</div>
              <div className="dp-tag">{c.tagline}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
