import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

// 遊戲內容管理（僅超級管理員）。分三個頁籤：
//   玩家留言：看/刪玩家留言
//   主線內容：改對話/道具文字（存 game_content）
//   首頁模組：改「學習系統」首頁卡片的大標/小標/圖片（存 rules.modules，依 key 合併）

type Choice = { t?: string; [k: string]: unknown };
type Node = { who?: string; text?: string; choices?: Choice[]; [k: string]: unknown };
type Dialogue = { start?: string; nodes?: Record<string, Node>; [k: string]: unknown };
type Dialogues = Record<string, Dialogue>;
type Item = { name?: string; icon?: string; desc?: string; [k: string]: unknown };
type Items = Record<string, Item>;
type Msg = { id: number; uid: string; name?: string; text: string; created_at: string };
type Tab = "messages" | "content" | "home";
type HomeCfg = { title: string; tagline: string; image: string };

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const HOME_DEFAULT = { title: "學習系統", tagline: "護理訓練小遊戲" };

function fmtTime(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function GameAdminPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("messages");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // 主線內容
  const [dialogues, setDialogues] = useState<Dialogues>({});
  const [items, setItems] = useState<Items>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 玩家留言
  const [messages, setMessages] = useState<Msg[]>([]);

  // 首頁模組（學習系統卡片）
  const [homeCfg, setHomeCfg] = useState<HomeCfg>({ title: "", tagline: "", image: "" });
  const [savingHome, setSavingHome] = useState(false);

  function switchTab(t: Tab) { setTab(t); setStatus(null); }

  // ---- 玩家留言 ----
  async function loadMessages() {
    try { setMessages((await api.get("/game/messages")).data.messages || []); } catch { /* 忽略 */ }
  }
  async function deleteMessage(id: number) {
    if (!confirm("確定刪除這則留言？")) return;
    try {
      await api.delete(`/game/messages/${id}`);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch { alert("刪除失敗，請稍後再試。"); }
  }
  useEffect(() => { loadMessages(); }, []);

  // ---- 主線內容 ----
  useEffect(() => {
    (async () => {
      try {
        const [dDefault, iDefault] = await Promise.all([
          fetch("/game/data/dialogues.json").then((r) => r.json()),
          fetch("/game/data/items.json").then((r) => r.json()),
        ]);
        let dLive = dDefault, iLive = iDefault;
        try {
          const { data } = (await api.get("/game/content")).data;
          if (data?.dialogues) dLive = data.dialogues;
          if (data?.items) iLive = data.items;
        } catch { /* 後端沒內容 → 用預設 */ }
        setDialogues(dLive);
        setItems(iLive);
      } catch { /* 忽略 */ }
      finally { setLoading(false); }
    })();
  }, []);

  // ---- 首頁模組 ----
  useEffect(() => {
    (async () => {
      try {
        const rules = (await api.get("/rules")).data.rules || {};
        const d = (rules.modules || []).find((m: { key?: string }) => m.key === "data");
        if (d) setHomeCfg({ title: d.title || "", tagline: d.tagline || "", image: d.image || "" });
      } catch { /* 用空值＝顯示預設 */ }
    })();
  }, []);

  function editNode(dlgId: string, nodeId: string, field: "who" | "text", value: string) {
    setDialogues((prev) => { const n = clone(prev); (n[dlgId].nodes as Record<string, Node>)[nodeId][field] = value; return n; });
  }
  function editChoice(dlgId: string, nodeId: string, idx: number, value: string) {
    setDialogues((prev) => { const n = clone(prev); (n[dlgId].nodes as Record<string, Node>)[nodeId].choices![idx].t = value; return n; });
  }
  function editItem(id: string, field: "name" | "icon" | "desc", value: string) {
    setItems((prev) => { const n = clone(prev); n[id][field] = value; return n; });
  }

  async function saveContent() {
    setSaving(true); setStatus(null);
    try {
      await api.post("/game/content", { data: { dialogues, items } });
      setStatus({ kind: "ok", msg: "已儲存！玩家重新整理遊戲就會看到新內容。" });
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setStatus({ kind: "err", msg: s === 403 ? "沒有權限（需超級管理員）。" : "儲存失敗，請稍後再試。" });
    } finally { setSaving(false); }
  }

  function onHomeImagePick(file: File) {
    if (file.size > 800 * 1024) { setStatus({ kind: "err", msg: "圖片請小於 800KB" }); return; }
    const reader = new FileReader();
    reader.onload = () => setHomeCfg((c) => ({ ...c, image: String(reader.result) }));
    reader.readAsDataURL(file);
  }
  async function saveHome() {
    setSavingHome(true); setStatus(null);
    try {
      await api.post("/rules", { rules: { modules: [{ key: "data", title: homeCfg.title, tagline: homeCfg.tagline, image: homeCfg.image }] } });
      setStatus({ kind: "ok", msg: "已儲存！下次進首頁即套用。" });
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setStatus({ kind: "err", msg: s === 403 ? "沒有權限（需超級管理員）。" : "儲存失敗，請稍後再試。" });
    } finally { setSavingHome(false); }
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { background: #f0f4f8 !important; color-scheme: light !important; }
        .ga-root { min-height:100svh; background:#f0f4f8; padding:24px 16px 96px;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft JhengHei","PingFang TC",sans-serif;
          display:flex; flex-direction:column; align-items:center; color:#0f172a; }
        .ga-wrap { width:100%; max-width:640px; }
        .ga-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .ga-back { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:7px 14px;
          font-size:13px; color:#475569; cursor:pointer; font-weight:600; }
        .ga-h1 { font-size:20px; font-weight:800; margin:0; }
        /* 頁籤：比照護理排班 .np-tabs */
        .ga-tabs { display:flex; gap:2px; margin-bottom:14px; }
        .ga-tab { padding:8px 16px; border-radius:8px 8px 0 0; font-size:14px; font-weight:600;
          border:none; background:#e9edf3; color:#6b7280; cursor:pointer; font-family:inherit; transition:background .12s; }
        .ga-tab.active { background:#2563eb; color:#fff; }
        .ga-note { color:#64748b; font-size:13px; margin:2px 0 14px; line-height:1.6; }
        .ga-sec { font-size:15px; font-weight:800; margin:20px 0 10px; color:#1e293b; }
        .ga-card { background:#fff; border:1px solid rgba(15,23,42,.06); border-radius:16px;
          padding:14px 16px; margin-bottom:12px; box-shadow:0 2px 10px rgba(15,23,42,.05); }
        .ga-id { font-size:12px; color:#94a3b8; font-weight:700; margin-bottom:8px; letter-spacing:.3px; }
        .ga-row { margin-bottom:10px; }
        .ga-label { font-size:12px; color:#64748b; font-weight:700; display:block; margin-bottom:4px; }
        .ga-input, .ga-textarea { width:100%; border:1.5px solid #e2e8f0; border-radius:10px;
          padding:9px 11px; font-size:14px; font-family:inherit; color:#0f172a; background:#fff; }
        .ga-input:focus, .ga-textarea:focus { outline:none; border-color:#60a5fa; }
        .ga-textarea { resize:vertical; min-height:52px; line-height:1.6; }
        .ga-who { max-width:200px; }
        .ga-savebar { position:fixed; left:0; right:0; bottom:0; background:#fffffff2; backdrop-filter:blur(6px);
          border-top:1px solid #e2e8f0; padding:12px 16px; display:flex; justify-content:center; }
        .ga-savebar-inner { width:100%; max-width:640px; display:flex; align-items:center; gap:12px; }
        .ga-save { flex:1; background:#2563eb; color:#fff; border:none; border-radius:12px; padding:13px;
          font-size:15px; font-weight:800; cursor:pointer; }
        .ga-save:disabled { opacity:.5; cursor:default; }
        .ga-status { font-size:13px; font-weight:700; }
        .ga-status.ok { color:#16a34a; } .ga-status.err { color:#dc2626; }
        .ga-hint { font-size:12px; color:#94a3b8; margin-top:6px; }
        .ga-prev { display:flex; align-items:center; gap:14px; padding:12px 10px; background:#f0f4f8; border-radius:12px; margin-bottom:12px; }
        .ga-prev-ic { width:64px; height:64px; border-radius:22.37%; display:flex; align-items:center;
          justify-content:center; overflow:hidden; font-size:30px; flex-shrink:0; background:#e7f6ec; }
        .ga-prev-ic img { width:100%; height:100%; object-fit:cover; }
      `}</style>

      <div className="ga-root">
        <div className="ga-wrap">
          <div className="ga-top">
            <button className="ga-back" onClick={() => nav("/data")}>← 返回</button>
            <h1 className="ga-h1">📝 遊戲內容管理</h1>
            <span style={{ width: 56 }} />
          </div>

          <div className="ga-tabs">
            <button className={`ga-tab${tab === "messages" ? " active" : ""}`} onClick={() => switchTab("messages")}>玩家留言</button>
            <button className={`ga-tab${tab === "content" ? " active" : ""}`} onClick={() => switchTab("content")}>主線內容</button>
            <button className={`ga-tab${tab === "home" ? " active" : ""}`} onClick={() => switchTab("home")}>首頁模組</button>
          </div>

          {/* ── 玩家留言 ── */}
          {tab === "messages" && (
            <>
              <div className="ga-sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span>📌 玩家留言（{messages.length}）</span>
                <button className="ga-back" style={{ fontSize: 12 }} onClick={loadMessages}>重新整理</button>
              </div>
              {messages.length === 0 ? (
                <div className="ga-card" style={{ color: "#94a3b8", fontSize: 13 }}>目前沒有留言。</div>
              ) : (
                messages.map((m) => (
                  <div className="ga-card" key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ga-id" style={{ marginBottom: 4 }}>{m.name || m.uid} · {fmtTime(m.created_at)}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                    </div>
                    <button className="ga-back" style={{ color: "#dc2626", flexShrink: 0 }} onClick={() => deleteMessage(m.id)}>刪除</button>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── 主線內容 ── */}
          {tab === "content" && (
            <>
              <div className="ga-note">改<b>對話文字</b>和<b>道具文字</b>，按下方「儲存」，玩家重新整理遊戲就會看到——不用改程式、不用部署。</div>
              {loading ? (
                <div className="ga-card">載入中…</div>
              ) : (
                <>
                  <div className="ga-sec">💬 對話</div>
                  {Object.entries(dialogues).map(([dlgId, dlg]) => (
                    <div className="ga-card" key={dlgId}>
                      <div className="ga-id">{dlgId}</div>
                      {Object.entries(dlg.nodes ?? {}).map(([nodeId, node]) => (
                        <div key={nodeId} style={{ marginBottom: 12 }}>
                          <div className="ga-row">
                            <label className="ga-label">說話者</label>
                            <input className="ga-input ga-who" value={node.who ?? ""}
                              onChange={(e) => editNode(dlgId, nodeId, "who", e.target.value)} />
                          </div>
                          <div className="ga-row">
                            <label className="ga-label">內容</label>
                            <textarea className="ga-textarea" value={node.text ?? ""}
                              onChange={(e) => editNode(dlgId, nodeId, "text", e.target.value)} />
                          </div>
                          {(node.choices ?? []).map((c, i) => (
                            <div className="ga-row" key={i}>
                              <label className="ga-label">選項 {i + 1}</label>
                              <input className="ga-input" value={c.t ?? ""}
                                onChange={(e) => editChoice(dlgId, nodeId, i, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="ga-sec">🎒 道具</div>
                  {Object.entries(items).map(([id, it]) => (
                    <div className="ga-card" key={id}>
                      <div className="ga-id">{id}</div>
                      <div className="ga-row" style={{ display: "flex", gap: 10 }}>
                        <div style={{ width: 70 }}>
                          <label className="ga-label">圖示</label>
                          <input className="ga-input" style={{ textAlign: "center" }} value={it.icon ?? ""}
                            onChange={(e) => editItem(id, "icon", e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="ga-label">名稱</label>
                          <input className="ga-input" value={it.name ?? ""}
                            onChange={(e) => editItem(id, "name", e.target.value)} />
                        </div>
                      </div>
                      <div className="ga-row">
                        <label className="ga-label">說明</label>
                        <textarea className="ga-textarea" value={it.desc ?? ""}
                          onChange={(e) => editItem(id, "desc", e.target.value)} />
                      </div>
                    </div>
                  ))}
                  <div className="ga-hint">提示：內容可用 <code>&lt;b&gt;粗體&lt;/b&gt;</code>。不要改上方灰色英文代號（程式用的名稱）。</div>
                </>
              )}
            </>
          )}

          {/* ── 首頁模組（學習系統卡片）── */}
          {tab === "home" && (
            <>
              <div className="ga-note">登入後首頁「學習系統」卡片的外觀。留空的欄位會用預設值。</div>
              <div className="ga-card">
                <div className="ga-prev">
                  <div className="ga-prev-ic">
                    {homeCfg.image ? <img src={homeCfg.image} alt="" /> : <span>🗂️</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{homeCfg.title || HOME_DEFAULT.title}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{homeCfg.tagline || HOME_DEFAULT.tagline}</div>
                  </div>
                </div>
                <div className="ga-row">
                  <label className="ga-label">🖼 圖片（留空＝預設圖示，建議正方形、小於 800KB）</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="file" accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onHomeImagePick(f); e.currentTarget.value = ""; }} />
                    {homeCfg.image && <button className="ga-back" onClick={() => setHomeCfg((c) => ({ ...c, image: "" }))}>移除圖片</button>}
                  </div>
                </div>
                <div className="ga-row">
                  <label className="ga-label">大標</label>
                  <input className="ga-input" placeholder={HOME_DEFAULT.title}
                    value={homeCfg.title} onChange={(e) => setHomeCfg((c) => ({ ...c, title: e.target.value }))} />
                </div>
                <div className="ga-row">
                  <label className="ga-label">小標</label>
                  <input className="ga-input" placeholder={HOME_DEFAULT.tagline}
                    value={homeCfg.tagline} onChange={(e) => setHomeCfg((c) => ({ ...c, tagline: e.target.value }))} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 存檔列：只有「主線內容」「首頁模組」需要 */}
        {tab === "content" && (
          <div className="ga-savebar"><div className="ga-savebar-inner">
            {status && <span className={`ga-status ${status.kind}`}>{status.msg}</span>}
            <button className="ga-save" onClick={saveContent} disabled={saving || loading}>{saving ? "儲存中…" : "儲存"}</button>
          </div></div>
        )}
        {tab === "home" && (
          <div className="ga-savebar"><div className="ga-savebar-inner">
            {status && <span className={`ga-status ${status.kind}`}>{status.msg}</span>}
            <button className="ga-save" onClick={saveHome} disabled={savingHome}>{savingHome ? "儲存中…" : "儲存首頁模組"}</button>
          </div></div>
        )}
      </div>
    </>
  );
}
