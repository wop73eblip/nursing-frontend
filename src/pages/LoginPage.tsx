import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { saveAuth } from "../auth";

export default function LoginPage() {
  const nav = useNavigate();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setCapsLock(e.getModifierState("CapsLock"));
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { uid: uid.trim().toLowerCase(), password });
      saveAuth({ uid: data.uid, name: data.name, role: data.role, token: data.access_token });
      // 登入後一律進首頁模組選擇畫面，由使用者選擇要進入的系統
      nav("/home");
    } catch (err: any) {
      setError(err.response?.data?.detail || "喔喔!! 帳號或密碼錯了");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f4f8 !important; color-scheme: light !important; }
        .lp-root {
          min-height: 100svh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background: #f0f4f8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", "PingFang TC", sans-serif;
        }
        .lp-card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
          padding: 36px 32px 32px;
          width: 100%;
          max-width: 400px;
        }
        .lp-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
        }
        .lp-logo-icon {
          width: 56px;
          height: 56px;
          background: #1d4ed8;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lp-logo-title {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.3px;
        }
        .lp-logo-sub {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .lp-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
        }
        .lp-field {
          margin-bottom: 16px;
        }
        .lp-input-wrap {
          position: relative;
        }
        .lp-input {
          width: 100%;
          padding: 11px 14px;
          border: 1.5px solid #d1d5db;
          border-radius: 10px;
          font-size: 15px;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          font-family: inherit;
          color-scheme: light;
          -webkit-appearance: none;
        }
        .lp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .lp-input-pw {
          padding-right: 46px;
        }
        .lp-eye {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          color: #9ca3af;
          display: flex;
          align-items: center;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          line-height: 0;
        }
        .lp-eye:hover { color: #374151; background: #f3f4f6; }
        .lp-hint {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-top: 7px;
          font-size: 12px;
          color: #6b7280;
          line-height: 1.5;
        }
        .lp-hint-icon { flex-shrink: 0; margin-top: 1px; }
        .lp-caps {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 8px 10px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          color: #92400e;
          font-size: 12px;
          font-weight: 500;
        }
        .lp-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          color: #dc2626;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .lp-btn {
          width: 100%;
          padding: 13px;
          background: #1d4ed8;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, transform 0.1s;
          margin-top: 4px;
        }
        .lp-btn:hover:not(:disabled) { background: #1e40af; }
        .lp-btn:active:not(:disabled) { transform: scale(0.99); }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .lp-divider {
          border: none;
          border-top: 1px solid #f1f5f9;
          margin: 24px 0 18px;
        }
        .lp-roles {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .lp-role-label {
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 8px;
          font-weight: 500;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .lp-badge {
          padding: 3px 10px;
          border-radius: 99px;
          font-size: 12px;
          font-weight: 600;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 0.7s linear infinite; display: inline-block; }
        @media (max-width: 440px) {
          .lp-card { padding: 28px 20px 24px; border-radius: 14px; }
        }
      `}</style>

      <div className="lp-root">
        <div className="lp-card">
          <form onSubmit={handleSubmit} autoComplete="off">
            {/* 帳號 */}
            <div className="lp-field">
              <label className="lp-label">帳號</label>
              <input
                className="lp-input"
                type="text"
                placeholder="請輸入帳號"
                value={uid}
                onChange={e => setUid(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            {/* 密碼 */}
            <div className="lp-field">
              <label className="lp-label">密碼</label>
              <div className="lp-input-wrap">
                <input
                  className="lp-input lp-input-pw"
                  type={showPw ? "text" : "password"}
                  placeholder="請輸入密碼"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lp-eye"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                  aria-label={showPw ? "隱藏密碼" : "顯示密碼"}
                >
                  {showPw
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>

              {/* 固定提示 */}
              <div className="lp-hint">
                <span className="lp-hint-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </span>
                <span>密碼有區分大小寫，請注意</span>
              </div>

              {/* 大寫鎖定警示（動態出現） */}
              {capsLock && (
                <div className="lp-caps">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  <span>目前 CapsLock 已開啟</span>
                </div>
              )}
            </div>

            {/* 錯誤 */}
            {error && (
              <div className="lp-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {error}
              </div>
            )}

            <button type="submit" className="lp-btn" disabled={loading || !uid || !password}>
              {loading
                ? <span><span className="spin" style={{ display: "inline-block", marginRight: 8 }}>⟳</span>登入中...</span>
                : "登入"
              }
            </button>
          </form>

        </div>
      </div>
    </>
  );
}
