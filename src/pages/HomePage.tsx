import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { getAuth, clearAuth } from "../auth";

type ModuleCard = {
  key: string;
  title: string;
  tagline: string;
  image: string;    // base64 data URI，空＝用預設圖示
  enabled: boolean;
};

// 預設卡片（後端抓到前先顯示，避免留白；抓到後以後端為準）
const FALLBACK: ModuleCard[] = [
  { key: "schedule", title: "排班系統", tagline: "不來預班就沒得預班囉～", image: "", enabled: true },
  { key: "data",     title: "學習系統", tagline: "護理訓練小遊戲",           image: "", enabled: true },
];

// 各模組的預設圖示（無自訂圖片時顯示）與底色
const ICON: Record<string, { emoji: string; bg: string }> = {
  schedule:  { emoji: "🗓️", bg: "#e0edff" },
  data:      { emoji: "🗂️", bg: "#e7f6ec" },
  "sys-cards": { emoji: "🎴", bg: "#f3e8ff" },   // 系統卡片（僅 superadmin）
};

export default function HomePage() {
  const nav = useNavigate();
  const user = getAuth();
  const isSuperadmin = user?.role === "superadmin";

  const [modules, setModules] = useState<ModuleCard[]>(() => {
    try { const c = localStorage.getItem("homeModules"); if (c) return JSON.parse(c); } catch {}
    return FALLBACK;
  });

  useEffect(() => {
    api.get("/home-config")
      .then(({ data }) => {
        const m: ModuleCard[] = data.modules ?? FALLBACK;
        setModules(m);
        try { localStorage.setItem("homeModules", JSON.stringify(m)); } catch {}
      })
      .catch(() => {});
  }, []);

  function openModule(m: ModuleCard) {
    if (!m.enabled) return;
    if (m.key === "schedule") {
      nav(["nurse", "dual"].includes(user?.role ?? "") ? "/nurse" : "/admin");
    } else if (m.key === "data") {
      nav("/data");
    } else if (m.key === "sys-cards") {
      nav("/system-cards");
    }
  }

  function logout() {
    clearAuth();
    nav("/login", { replace: true });
  }

  // superadmin 額外看到「系統卡片」入口卡（不寫進 /home-config，只在 UI 追加）
  const displayModules: ModuleCard[] = isSuperadmin
    ? [...modules, { key: "sys-cards", title: "系統卡片", tagline: "設定各系統首頁卡片", image: "", enabled: true }]
    : modules;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { background: #f0f4f8 !important; color-scheme: light !important; }
        .hp-root {
          min-height: 100svh;
          background: #f0f4f8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", "PingFang TC", sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 32px 16px 48px;
        }
        .hp-top {
          width: 100%; max-width: 480px;
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 24px;
        }
        .hp-hello { font-size: 15px; color: #475569; }
        .hp-hello b { color: #0f172a; font-weight: 700; }
        .hp-logout {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
          padding: 7px 14px; font-size: 13px; color: #475569; cursor: pointer;
          font-family: inherit; font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: background .15s, transform .1s;
        }
        .hp-logout:hover { background: #f8fafc; }
        .hp-logout:active { transform: scale(0.97); }
        .hp-heading {
          width: 100%; max-width: 480px;
          font-size: 22px; font-weight: 800; color: #0f172a;
          margin-bottom: 16px; letter-spacing: -0.3px;
        }
        .hp-grid {
          width: 100%; max-width: 480px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .hp-card {
          background: #fff;
          border-radius: 22px;
          box-shadow: 0 4px 20px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.05);
          padding: 22px 16px 20px;
          display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: 10px;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease;
          border: 1px solid rgba(15,23,42,0.04);
          position: relative;
          -webkit-tap-highlight-color: transparent;
        }
        .hp-card.enabled:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,23,42,0.12); }
        .hp-card.enabled:active { transform: translateY(-1px) scale(0.99); }
        .hp-card.disabled { cursor: not-allowed; opacity: 0.72; }
        /* Squircle 圖示：iOS app icon 圓角比例 */
        .hp-icon {
          width: 76px; height: 76px;
          border-radius: 22.37%;
          display: flex; align-items: center; justify-content: center;
          font-size: 38px; line-height: 1;
          overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.03);
        }
        .hp-icon img { width: 100%; height: 100%; object-fit: cover; }
        .hp-title { font-size: 17px; font-weight: 800; color: #0f172a; }
        .hp-tag { font-size: 12.5px; color: #94a3b8; line-height: 1.45; }
        .hp-soon {
          position: absolute; top: 10px; right: 10px;
          background: #f1f5f9; color: #94a3b8;
          font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 99px;
        }
        .hp-lock {
          position: absolute; top: 10px; right: 10px;
          font-size: 11px; color: #94a3b8; font-weight: 700;
        }
        @media (max-width: 360px) {
          .hp-card { padding: 18px 10px 16px; border-radius: 18px; }
          .hp-icon { width: 64px; height: 64px; font-size: 32px; }
          .hp-title { font-size: 15px; }
        }
      `}</style>

      <div className="hp-root">
        <div className="hp-top">
          <div className="hp-hello">哈囉，<b>{user?.name || "使用者"}</b></div>
          <button className="hp-logout" onClick={logout}>登出</button>
        </div>

        <div className="hp-heading">選擇系統</div>

        <div className="hp-grid">
          {displayModules.map(m => {
            const ic = ICON[m.key] ?? { emoji: "📦", bg: "#eef2f7" };
            const showLock = m.key === "sys-cards";
            return (
              <div
                key={m.key}
                className={`hp-card ${m.enabled ? "enabled" : "disabled"}`}
                onClick={() => openModule(m)}
                role="button"
                aria-disabled={!m.enabled}
              >
                {!m.enabled && <span className="hp-soon">即將推出</span>}
                {showLock && <span className="hp-lock">🔒</span>}
                <div className="hp-icon" style={{ background: m.image ? "transparent" : ic.bg }}>
                  {m.image ? <img src={m.image} alt={m.title} /> : <span>{ic.emoji}</span>}
                </div>
                <div className="hp-title">{m.title}</div>
                <div className="hp-tag">{m.tagline}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
