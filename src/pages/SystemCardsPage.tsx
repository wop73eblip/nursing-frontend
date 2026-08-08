import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

// 系統卡片管理（僅超級管理員）
// 目前只有一個頁籤：排班系統（編輯首頁「排班系統」卡片的大標/小標/圖片）
// 未來可再加其他頁籤（如「首頁佈景」「模組排序」等）
type Tab = "schedule";
type ModuleCfg = { key: string; title: string; tagline: string; image: string };

const DEFAULT_MODULE_META: ModuleCfg[] = [
  { key: "schedule", title: "排班系統", tagline: "不來預班就沒得預班囉～", image: "" },
];

export default function SystemCardsPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("schedule");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [moduleCfgs, setModuleCfgs] = useState<ModuleCfg[]>(DEFAULT_MODULE_META);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rules = (await api.get("/rules")).data.rules || {};
        const savedList: any[] = rules.modules || [];
        const saved = Object.fromEntries(savedList.map(m => [m.key, m]));
        setModuleCfgs(DEFAULT_MODULE_META.map(d => ({
          key: d.key,
          title: saved[d.key]?.title ?? d.title,
          tagline: saved[d.key]?.tagline ?? d.tagline,
          image: saved[d.key]?.image ?? "",
        })));
      } catch { /* 用預設 */ }
    })();
  }, []);

  function onImagePick(key: string, file: File) {
    if (file.size > 800 * 1024) { setStatus({ kind: "err", msg: "圖片請小於 800KB" }); return; }
    const reader = new FileReader();
    reader.onload = () => setModuleCfgs(p => p.map(m => m.key === key ? { ...m, image: String(reader.result) } : m));
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true); setStatus(null);
    try {
      // 只送非 data 模組（後端依 key 合併；學習系統卡片由「學習系統後台」管理）
      await api.post("/rules", { rules: { modules: moduleCfgs.filter(m => m.key !== "data") } });
      setStatus({ kind: "ok", msg: "已儲存！下次進首頁即套用。" });
    } catch (e: any) {
      const s = e?.response?.status;
      setStatus({ kind: "err", msg: s === 403 ? "沒有權限（需超級管理員）。" : "儲存失敗，請稍後再試。" });
    } finally { setSaving(false); }
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { background: #f0f4f8 !important; color-scheme: light !important; }
        .sc-root { min-height:100svh; background:#f0f4f8; padding:24px 16px 96px;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft JhengHei","PingFang TC",sans-serif;
          display:flex; flex-direction:column; align-items:center; color:#0f172a; }
        .sc-wrap { width:100%; max-width:640px; }
        .sc-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .sc-back { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:7px 14px;
          font-size:13px; color:#475569; cursor:pointer; font-weight:600; font-family:inherit; }
        .sc-h1 { font-size:20px; font-weight:800; margin:0; }

        .sc-tabs { display:flex; gap:2px; margin-bottom:14px; }
        .sc-tab { padding:8px 16px; border-radius:8px 8px 0 0; font-size:14px; font-weight:600;
          border:none; background:#e9edf3; color:#6b7280; cursor:pointer; font-family:inherit;
          transition:background .12s; }
        .sc-tab.active { background:#2563eb; color:#fff; }

        .sc-note { color:#64748b; font-size:13px; margin:2px 0 14px; line-height:1.6; }

        .sc-card { background:#fff; border:1px solid rgba(15,23,42,.06); border-radius:16px;
          padding:14px 16px; margin-bottom:12px; box-shadow:0 2px 10px rgba(15,23,42,.05); }

        .sc-prev { display:flex; align-items:center; gap:14px; padding:12px 10px; background:#f0f4f8;
          border-radius:12px; margin-bottom:12px; }
        .sc-prev-ic { width:64px; height:64px; border-radius:22.37%; display:flex; align-items:center;
          justify-content:center; overflow:hidden; font-size:30px; flex-shrink:0; }
        .sc-prev-ic img { width:100%; height:100%; object-fit:cover; }
        .sc-prev-t { font-size:16px; font-weight:800; color:#0f172a; }
        .sc-prev-s { font-size:12px; color:#94a3b8; margin-top:2px; }

        .sc-row { margin-bottom:10px; }
        .sc-label { font-size:12px; color:#64748b; font-weight:700; display:block; margin-bottom:4px; }
        .sc-input { width:100%; border:1.5px solid #e2e8f0; border-radius:10px;
          padding:9px 11px; font-size:14px; font-family:inherit; color:#0f172a; background:#fff; }
        .sc-input:focus { outline:none; border-color:#60a5fa; }

        .sc-savebar { position:fixed; left:0; right:0; bottom:0; background:#fffffff2; backdrop-filter:blur(6px);
          border-top:1px solid #e2e8f0; padding:12px 16px; display:flex; justify-content:center; }
        .sc-savebar-inner { width:100%; max-width:640px; display:flex; align-items:center; gap:12px; }
        .sc-save { flex:1; background:#2563eb; color:#fff; border:none; border-radius:12px; padding:13px;
          font-size:15px; font-weight:800; cursor:pointer; font-family:inherit; }
        .sc-save:disabled { opacity:.5; cursor:default; }
        .sc-status { font-size:13px; font-weight:700; }
        .sc-status.ok { color:#16a34a; } .sc-status.err { color:#dc2626; }
      `}</style>

      <div className="sc-root">
        <div className="sc-wrap">
          <div className="sc-top">
            <button className="sc-back" onClick={() => nav("/home")}>← 返回</button>
            <h1 className="sc-h1">🎴 系統卡片</h1>
            <span style={{ width: 56 }} />
          </div>

          <div className="sc-tabs">
            <button className={`sc-tab${tab === "schedule" ? " active" : ""}`} onClick={() => setTab("schedule")}>排班系統</button>
          </div>

          {tab === "schedule" && (
            <>
              <div className="sc-note">
                登入後首頁「排班系統」卡片的外觀。留空的欄位會用預設值。
              </div>
              {moduleCfgs.filter(m => m.key !== "data").map(m => {
                const meta = DEFAULT_MODULE_META.find(d => d.key === m.key);
                return (
                  <div key={m.key} className="sc-card">
                    <div className="sc-prev">
                      <div className="sc-prev-ic" style={{ background: m.image ? "transparent" : (m.key === "schedule" ? "#e0edff" : "#e7f6ec") }}>
                        {m.image
                          ? <img src={m.image} alt="" />
                          : <span>{m.key === "schedule" ? "🗓️" : "🗂️"}</span>}
                      </div>
                      <div>
                        <div className="sc-prev-t">{m.title || meta?.title}</div>
                        <div className="sc-prev-s">{m.tagline || meta?.tagline}</div>
                      </div>
                    </div>

                    <div className="sc-row">
                      <label className="sc-label">🖼 圖片（留空＝預設圖示，建議正方形、小於 800KB）</label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="file" accept="image/*"
                          onChange={e => { const f = e.target.files?.[0]; if (f) onImagePick(m.key, f); e.currentTarget.value = ""; }} />
                        {m.image && (
                          <button className="sc-back"
                            onClick={() => setModuleCfgs(p => p.map(x => x.key === m.key ? { ...x, image: "" } : x))}
                          >移除圖片</button>
                        )}
                      </div>
                    </div>

                    <div className="sc-row">
                      <label className="sc-label">大標</label>
                      <input className="sc-input" placeholder={meta?.title}
                        value={m.title}
                        onChange={e => setModuleCfgs(p => p.map(x => x.key === m.key ? { ...x, title: e.target.value } : x))} />
                    </div>

                    <div className="sc-row">
                      <label className="sc-label">小標</label>
                      <input className="sc-input" placeholder={meta?.tagline}
                        value={m.tagline}
                        onChange={e => setModuleCfgs(p => p.map(x => x.key === m.key ? { ...x, tagline: e.target.value } : x))} />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="sc-savebar">
          <div className="sc-savebar-inner">
            {status && <span className={`sc-status ${status.kind}`}>{status.msg}</span>}
            <button className="sc-save" onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存首頁模組"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
