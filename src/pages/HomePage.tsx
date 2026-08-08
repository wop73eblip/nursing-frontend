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
  schedule: { emoji: "🗓️", bg: "#e0edff" },
  data:     { emoji: "🗂️", bg: "#e7f6ec" },
};

// 「系統卡片」編輯區的預設 meta（superadmin 才會用到）
const DEFAULT_MODULE_META = [
  { key: "schedule", title: "排班系統", tagline: "不來預班就沒得預班囉～" },
  { key: "data",     title: "學習系統", tagline: "護理訓練小遊戲" },
];

type CardTab = "schedule";   // 未來可加 "data" 等

export default function HomePage() {
  const nav = useNavigate();
  const user = getAuth();
  const isSuperadmin = user?.role === "superadmin";

  const [modules, setModules] = useState<ModuleCard[]>(() => {
    try { const c = localStorage.getItem("homeModules"); if (c) return JSON.parse(c); } catch {}
    return FALLBACK;
  });

  // 系統卡片編輯（只 superadmin 用）
  const [moduleCfgs, setModuleCfgs] = useState<{ key: string; title: string; tagline: string; image: string }[]>(
    DEFAULT_MODULE_META.map(d => ({ ...d, image: "" }))
  );
  const [savingModules, setSavingModules] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cardTab, setCardTab] = useState<CardTab>("schedule");

  useEffect(() => {
    api.get("/home-config")
      .then(({ data }) => {
        const m: ModuleCard[] = data.modules ?? FALLBACK;
        setModules(m);
        try { localStorage.setItem("homeModules", JSON.stringify(m)); } catch {}
      })
      .catch(() => {});
  }, []);

  // superadmin 才 fetch /rules（因為要含所有欄位；權限已在後端擋）
  useEffect(() => {
    if (!isSuperadmin) return;
    api.get("/rules")
      .then(({ data }) => {
        const rules = data?.rules || {};
        if (rules.modules) {
          const saved: Record<string, any> = Object.fromEntries((rules.modules as any[]).map(m => [m.key, m]));
          setModuleCfgs(DEFAULT_MODULE_META.map(d => ({
            key: d.key,
            title: saved[d.key]?.title ?? d.title,
            tagline: saved[d.key]?.tagline ?? d.tagline,
            image: saved[d.key]?.image ?? "",
          })));
        }
      })
      .catch(() => {});
  }, [isSuperadmin]);

  function openModule(m: ModuleCard) {
    if (!m.enabled) return;
    if (m.key === "schedule") {
      nav(["nurse", "dual"].includes(user?.role ?? "") ? "/nurse" : "/admin");
    } else if (m.key === "data") {
      nav("/data");
    }
  }

  function logout() {
    clearAuth();
    nav("/login", { replace: true });
  }

  function showMsg(ok: boolean, text: string) {
    setSaveMsg({ ok, text });
    setTimeout(() => setSaveMsg(null), 2200);
  }

  async function saveModuleConfig() {
    setSavingModules(true);
    try {
      // 學習系統卡片由「學習系統後台」管理，這裡只送非 data 模組（後端依 key 合併）
      await api.post("/rules", { rules: { modules: moduleCfgs.filter(m => m.key !== "data") } });
      showMsg(true, "✓ 首頁模組已儲存");
      // 存後刷新展示區（不重整整頁）
      api.get("/home-config").then(({ data }) => {
        const m: ModuleCard[] = data.modules ?? FALLBACK;
        setModules(m);
        try { localStorage.setItem("homeModules", JSON.stringify(m)); } catch {}
      }).catch(() => {});
    } catch (err: any) {
      showMsg(false, "✗ " + (err.response?.data?.detail ?? err.message ?? "儲存失敗"));
    } finally { setSavingModules(false); }
  }

  function onModuleImagePick(key: string, file: File) {
    if (file.size > 800 * 1024) { showMsg(false, "✗ 圖片請小於 800KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setModuleCfgs(p => p.map(m => m.key === key ? { ...m, image: String(reader.result) } : m));
    reader.readAsDataURL(file);
  }

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

        /* 系統卡片編輯區（superadmin，方框風格比照 GameAdminPage） */
        .hp-admin {
          width: 100%; max-width: 480px;
          margin-top: 28px;
        }
        .hp-admin-heading {
          font-size: 17px; font-weight: 800; color: #0f172a;
          margin-bottom: 10px; display: flex; align-items: baseline; gap: 8px;
        }
        .hp-admin-heading .lock { font-size: 11px; color: #94a3b8; font-weight: 600; }
        /* 頁籤：比照 GameAdminPage .ga-tabs */
        .hp-admin-tabs {
          display: flex; gap: 2px; margin-bottom: 14px;
        }
        .hp-admin-tab {
          padding: 8px 16px; border-radius: 8px 8px 0 0;
          font-size: 14px; font-weight: 600;
          border: none; background: #e9edf3; color: #6b7280;
          cursor: pointer; font-family: inherit;
          transition: background .12s;
        }
        .hp-admin-tab.active { background: #2563eb; color: #fff; }
        .hp-note { color: #64748b; font-size: 13px; margin: 2px 0 14px; line-height: 1.6; }
        /* 方框卡：比照 .ga-card */
        .hp-editor-row {
          background: #fff; border: 1px solid rgba(15,23,42,.06);
          border-radius: 16px; padding: 14px 16px; margin-bottom: 12px;
          box-shadow: 0 2px 10px rgba(15,23,42,.05);
        }
        .hp-editor-title { font-size: 14px; font-weight: 800; color: #1e293b; margin-bottom: 10px; }
        /* 預覽區：比照 .ga-prev */
        .hp-preview {
          display: flex; align-items: center; gap: 14px;
          padding: 12px 10px; background: #f0f4f8;
          border-radius: 12px; margin-bottom: 12px;
        }
        .hp-preview-icon {
          width: 64px; height: 64px; border-radius: 22.37%;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; font-size: 30px; flex-shrink: 0;
        }
        .hp-preview-icon img { width: 100%; height: 100%; object-fit: cover; }
        .hp-preview-text .t { font-size: 16px; font-weight: 800; color: #0f172a; }
        .hp-preview-text .s { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        /* 欄位 row + label + input：比照 .ga-row / .ga-label / .ga-input */
        .hp-field { margin-bottom: 10px; }
        .hp-field-label { font-size: 12px; color: #64748b; font-weight: 700; display: block; margin-bottom: 4px; }
        .hp-field-help  { font-size: 12px; color: #94a3b8; margin-top: 6px; }
        .hp-finput {
          width: 100%; border: 1.5px solid #e2e8f0; border-radius: 10px;
          padding: 9px 11px; font-size: 14px; font-family: inherit;
          color: #0f172a; background: #fff;
        }
        .hp-finput:focus { outline: none; border-color: #60a5fa; }
        /* 按鈕：小的次按鈕（移除圖片）比照 .ga-back；主按鈕比照 .ga-save */
        .hp-btn {
          border: none; border-radius: 10px; font-family: inherit; cursor: pointer;
          font-size: 13px; font-weight: 700; padding: 7px 14px;
        }
        .hp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .hp-btn-gray {
          background: #fff; border: 1px solid #e2e8f0; color: #475569;
        }
        .hp-btn-primary {
          background: #2563eb; color: #fff; border-radius: 12px;
          padding: 13px 20px; font-size: 15px; font-weight: 800;
          width: 100%;
        }
        .hp-actions {
          display: flex; align-items: center; gap: 12px; margin-top: 4px;
        }
        .hp-actions .help { font-size: 12px; color: #94a3b8; }
        .hp-msg { font-size: 13px; font-weight: 700; }
        .hp-msg.ok  { color: #16a34a; }
        .hp-msg.err { color: #dc2626; }

        @media (max-width: 360px) {
          .hp-card { padding: 18px 10px 16px; border-radius: 18px; }
          .hp-icon { width: 64px; height: 64px; font-size: 32px; }
          .hp-title { font-size: 15px; }
          .hp-admin-tab { padding: 7px 14px; font-size: 13px; }
        }
      `}</style>

      <div className="hp-root">
        <div className="hp-top">
          <div className="hp-hello">哈囉，<b>{user?.name || "使用者"}</b></div>
          <button className="hp-logout" onClick={logout}>登出</button>
        </div>

        <div className="hp-heading">選擇系統</div>

        <div className="hp-grid">
          {modules.map(m => {
            const ic = ICON[m.key] ?? { emoji: "📦", bg: "#eef2f7" };
            return (
              <div
                key={m.key}
                className={`hp-card ${m.enabled ? "enabled" : "disabled"}`}
                onClick={() => openModule(m)}
                role="button"
                aria-disabled={!m.enabled}
              >
                {!m.enabled && <span className="hp-soon">即將推出</span>}
                <div className="hp-icon" style={{ background: m.image ? "transparent" : ic.bg }}>
                  {m.image ? <img src={m.image} alt={m.title} /> : <span>{ic.emoji}</span>}
                </div>
                <div className="hp-title">{m.title}</div>
                <div className="hp-tag">{m.tagline}</div>
              </div>
            );
          })}
        </div>

        {/* 系統卡片編輯區（僅 superadmin，方框風格比照 GameAdminPage） */}
        {isSuperadmin && (
          <div className="hp-admin">
            <div className="hp-admin-heading">
              系統卡片
              <span className="lock">🔒 僅 superadmin 可見</span>
            </div>

            <div className="hp-admin-tabs">
              <button
                className={`hp-admin-tab ${cardTab === "schedule" ? "active" : ""}`}
                onClick={() => setCardTab("schedule")}
              >排班系統</button>
            </div>

            {cardTab === "schedule" && (
              <>
                <div className="hp-note">
                  登入後首頁「排班系統」卡片的外觀。留空的欄位會用預設值。
                </div>
                {moduleCfgs.filter(m => m.key !== "data").map(m => {
                  const meta = DEFAULT_MODULE_META.find(d => d.key === m.key);
                  return (
                    <div key={m.key} className="hp-editor-row">
                      {/* 預覽 */}
                      <div className="hp-preview">
                        <div className="hp-preview-icon" style={{ background: m.image ? "transparent" : (m.key==="schedule"?"#e0edff":"#e7f6ec") }}>
                          {m.image
                            ? <img src={m.image} alt="" />
                            : <span>{m.key==="schedule"?"🗓️":"🗂️"}</span>}
                        </div>
                        <div className="hp-preview-text">
                          <div className="t">{m.title || meta?.title}</div>
                          <div className="s">{m.tagline || meta?.tagline}</div>
                        </div>
                      </div>
                      {/* 圖片 */}
                      <div className="hp-field">
                        <label className="hp-field-label">🖼 圖片（留空＝預設圖示，建議正方形、小於 800KB）</label>
                        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                          <input type="file" accept="image/*"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) onModuleImagePick(m.key, f);
                              e.currentTarget.value = "";
                            }} />
                          {m.image && (
                            <button className="hp-btn hp-btn-gray"
                              onClick={() => setModuleCfgs(p => p.map(x => x.key===m.key ? { ...x, image:"" } : x))}
                            >移除圖片</button>
                          )}
                        </div>
                      </div>
                      {/* 大標 */}
                      <div className="hp-field">
                        <label className="hp-field-label">大標</label>
                        <input className="hp-finput" placeholder={meta?.title}
                          value={m.title}
                          onChange={e => setModuleCfgs(p => p.map(x => x.key===m.key ? { ...x, title:e.target.value } : x))} />
                      </div>
                      {/* 小標 */}
                      <div className="hp-field">
                        <label className="hp-field-label">小標</label>
                        <input className="hp-finput" placeholder={meta?.tagline}
                          value={m.tagline}
                          onChange={e => setModuleCfgs(p => p.map(x => x.key===m.key ? { ...x, tagline:e.target.value } : x))} />
                      </div>
                    </div>
                  );
                })}
                <button className="hp-btn hp-btn-primary" onClick={saveModuleConfig} disabled={savingModules}>
                  {savingModules ? "儲存中…" : "儲存首頁模組"}
                </button>
                <div className="hp-actions" style={{ justifyContent:"center", marginTop:8 }}>
                  {saveMsg
                    ? <span className={`hp-msg ${saveMsg.ok ? "ok" : "err"}`}>{saveMsg.text}</span>
                    : <span className="help">儲存後立即套用</span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
