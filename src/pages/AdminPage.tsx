import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import api from "../api";
import { getAuth, clearAuth } from "../auth";

// ─── 常數
const DEFAULT_WORK: ShiftDef[] = [
  { code: "D",  label: "白班",   type: "work" },
  { code: "E",  label: "小夜",   type: "work" },
  { code: "N",  label: "大夜",   type: "work" },
  { code: "會", label: "開會",   type: "work" },
  { code: "公", label: "公假",   type: "work" },
  { code: "書記", label: "書記班", type: "work", admin_only: true },
];
const DEFAULT_OFF: ShiftDef[] = [
  { code: "OFF", label: "休假", type: "off" },
  { code: "V",   label: "特休", type: "off" },
  { code: "半",  label: "半職", type: "off" },
  { code: "喪",  label: "喪假", type: "off" },
  { code: "員",  label: "員旅", type: "off" },
  { code: "延休", label: "延休", type: "off", admin_only: true },
  { code: "補休", label: "補休", type: "off", admin_only: true },
  { code: "調移", label: "調移", type: "off", admin_only: true },
];
const DOW_ZH = ["日","一","二","三","四","五","六"];
const ROLE_ABBR:   Record<string,string> = { nurse:"護", dual:"兼", admin:"管", superadmin:"超" };

// ─── Types
type Tab = "schedule"|"users"|"cycle"|"rules"|"shifts_cfg"|"generate"|"logs";

interface ShiftDef { code: string; label: string; type: "work"|"off"; admin_only?: boolean; }
interface User {
  uid: string; name: string; role: string; level: string;
  attr: string; halftime: boolean; note: string; sort_order: number;
}
interface ShiftRow { nurse_uid: string; date: string; shift: string; confirmed?: boolean; }

function isOff(code: string, offShifts: ShiftDef[]) { return offShifts.some(s => s.code === code); }
function shiftColor(code: string, offShifts: ShiftDef[]) { return isOff(code, offShifts) ? "#dc2626" : "#111827"; }

// ─── 班別 Modal
function ShiftModal({
  date, nurseName, current, workShifts, offShifts, onSelect, onClose,
}: {
  date: string; nurseName: string; current: string;
  workShifts: ShiftDef[]; offShifts: ShiftDef[];
  onSelect: (s: string | null) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);
  const btn: React.CSSProperties = {
    padding: "5px 11px", borderRadius: 7, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div ref={ref} style={{ background:"#fff", borderRadius:14, padding:"16px 16px 12px", width:"100%", maxWidth:320, boxShadow:"0 20px 60px rgba(0,0,0,.25)", userSelect:"none" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>{nurseName}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:20, lineHeight:1, padding:2 }}>×</button>
        </div>
        <div style={{ fontSize:12, color:"#9ca3af", marginBottom:14 }}>{date}</div>
        <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:6 }}>上班</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {workShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btn, color:"#111827",
              border: current===s.code ? "2px solid #2563eb" : "1.5px solid #e5e7eb",
              background: current===s.code ? "#eff6ff" : "#f9fafb" }}
              title={s.label}>{s.code}</button>
          ))}
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:"#dc2626", marginBottom:6 }}>放假 / 調整</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {offShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btn, color:"#dc2626",
              border: current===s.code ? "2px solid #dc2626" : "1.5px solid #fecaca",
              background: current===s.code ? "#fef2f2" : "#fff5f5" }}
              title={s.label}>{s.code}</button>
          ))}
        </div>
        {current && (<>
          <div style={{ borderTop:"1px solid #f3f4f6", margin:"10px 0 6px" }} />
          <button onClick={() => onSelect(null)} style={{ width:"100%", padding:7, background:"none", border:"none", color:"#9ca3af", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✕ 清除班別</button>
        </>)}
      </div>
    </div>
  );
}

// ─── 通用 Dialog
function Dialog({ title, body, actions }: {
  title: string;
  body: React.ReactNode;
  actions: { label: string; primary?: boolean; danger?: boolean; onClick: () => void }[];
}) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:14, padding:"22px 20px 18px", width:"100%", maxWidth:360, boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.7, marginBottom:18 }}>{body}</div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          {actions.map((a, i) => (
            <button key={i} onClick={a.onClick} style={{
              padding:"9px 18px", borderRadius:9, border:"none", fontSize:13, fontWeight:600,
              cursor:"pointer", fontFamily:"inherit",
              background: a.danger ? "#dc2626" : a.primary ? "#2563eb" : "#f3f4f6",
              color: (a.primary || a.danger) ? "#fff" : "#374151",
            }}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 滑動選取彈出視窗
function SwipeRangePopup({
  nurseName, dates, workShifts, offShifts, onSelect, onClose,
}: {
  nurseName: string;
  dates: string[];
  workShifts: ShiftDef[];
  offShifts: ShiftDef[];
  onSelect: (shift: string) => void;
  onClose: () => void;
}) {
  const first = dates[0], last = dates[dates.length - 1];
  const label = first === last
    ? first
    : `${first} ～ ${last}（${dates.length} 天）`;

  const btnBase: React.CSSProperties = {
    padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #e5e7eb",
    background: "#f9fafb", color: "#111827",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "16px 16px 14px",
        width: "100%", maxWidth: 320, boxShadow: "0 16px 48px rgba(0,0,0,.22)",
        userSelect: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>批次填入</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>{nurseName}　{label}</div>
        <div style={{ fontSize: 11, color: "#374151", fontWeight: 700, marginBottom: 6 }}>上班</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {workShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={btnBase}>{s.code}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>放假 / 調整</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {offShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btnBase, color: "#dc2626", borderColor: "#fecaca", background: "#fff5f5" }}>{s.code}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 主頁面
export default function AdminPage() {
  const nav = useNavigate();
  const user = getAuth()!;
  const isSuperAdmin = user.role === "superadmin";
  const isDual = user.role === "dual";

  const [tab, setTab] = useState<Tab>("schedule");
  const [ym, setYm] = useState(dayjs().format("YYYY-MM"));

  // 全域資料
  const [users, setUsers] = useState<User[]>([]);
  const [schedule, setSchedule] = useState<ShiftRow[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [, setAllRules] = useState<any>({});

  // 班別設定（從 rules 讀出，預設為 DEFAULT）
  const [workShifts, setWorkShifts] = useState<ShiftDef[]>(DEFAULT_WORK);
  const [offShifts, setOffShifts] = useState<ShiftDef[]>(DEFAULT_OFF);

  // 班表 tab
  const [popup, setPopup] = useState<{ date: string; nurseUid: string; nurseName: string } | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [confirmingAll, setConfirmingAll] = useState(false);

  // 批次填寫
  const [shiftAnchor, setShiftAnchor] = useState<{ nurseUid: string; date: string; shift: string } | null>(null);
  const [ctrlSelected, setCtrlSelected] = useState<Set<string>>(new Set()); // "uid_date"
  const [shiftRange, setShiftRange] = useState<Set<string>>(new Set()); // "uid_date" for shift-range highlight
  const [batchPopup, setBatchPopup] = useState<{ nurseUid: string; nurseName: string; dates: string[] } | null>(null);
  const [dragFill, setDragFill] = useState<{ nurseUid: string; dates: Set<string>; shift: string } | null>(null);
  const dragFillRef = useRef<{ nurseUid: string; dates: Set<string>; shift: string } | null>(null);
  const batchSaveRef = useRef(batchSave);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{x: number; y: number}>({x: 0, y: 0});
  const touchSrcRef   = useRef<{nurseUid: string; date: string; shift: string} | null>(null);
  // Refs 避免 stale closure（StrictMode / 事件監聽器共用）
  const ctrlSelectedRef = useRef<Set<string>>(new Set());
  const shiftRangeRef = useRef<Set<string>>(new Set());
  const scheduleRef = useRef<ShiftRow[]>([]);
  const shiftAnchorRef = useRef<{ nurseUid: string; date: string; shift: string } | null>(null);
  // Ctrl+click 時追蹤最後一個被點到的「有班別格子」作為來源
  const ctrlSrcShift = useRef<{ nurseUid: string; shift: string } | null>(null);
  // 滑動選取
  const swipeRef = useRef<{ nurseUid: string; startDate: string; dates: Set<string>; active: boolean } | null>(null);
  const allDaysRef = useRef<string[]>([]);
  const [swipeDates, setSwipeDates] = useState<Set<string>>(new Set());
  const [swipePopup, setSwipePopup] = useState<{ nurseUid: string; nurseName: string; dates: string[] } | null>(null);
  // 捲動速度
  const [scrollSpeed, setScrollSpeed] = useState<number>(() => Number(localStorage.getItem('scrollSpeed') ?? 10));
  const autoScrollFrameRef = useRef<number | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const nurseUsersRef = useRef<User[]>([]);
  const scrollSpeedRef = useRef<number>(10);
  useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);
  useEffect(() => { ctrlSelectedRef.current = ctrlSelected; }, [ctrlSelected]);
  useEffect(() => { shiftRangeRef.current = shiftRange; }, [shiftRange]);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { shiftAnchorRef.current = shiftAnchor; }, [shiftAnchor]);
  useEffect(() => { batchSaveRef.current = batchSave; });

  // 帳號管理
  const [newUser, setNewUser] = useState({ uid:"", password:"", name:"", role:"nurse", level:"member", attr:"輪班DEN", halftime:false, note:"" });
  const [creating, setCreating] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User & { new_password: string; showEditPwd?: boolean }>>({});
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [clearLogsConfirm, setClearLogsConfirm] = useState<{hours:number; label:string} | null>(null);
  // iOS 風格拖曳（帳號管理）
  type DragState = { fromIdx: number; overIdx: number; offsetY: number; startY: number; curY: number; itemH: number };
  const userDragRef = useRef<DragState | null>(null);
  const [userDragOver, setUserDragOver] = useState<number | null>(null);
  const [userDragging, setUserDragging] = useState<number | null>(null);
  const userItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // iOS 風格拖曳（班別設定）
  type ShiftDragState = { type: "work"|"off"; fromIdx: number; overIdx: number; startY: number; curY: number; itemH: number };
  const shiftDragRef = useRef<ShiftDragState | null>(null);
  const [shiftDragOver, setShiftDragOver] = useState<{ type:"work"|"off"; idx:number } | null>(null);
  const [shiftDragging, setShiftDragging] = useState<{ type:"work"|"off"; idx:number } | null>(null);
  const shiftWorkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shiftOffRefs  = useRef<(HTMLDivElement | null)[]>([]);

  // 週期設定
  const [cycle, setCycle] = useState({
    start_date: "",      // YYYY-MM-DD
    end_date: "",        // YYYY-MM-DD
    period_days: 28,     // 週期長度（天）
    deadline_date: "",   // 填表截止日 YYYY-MM-DD
    holiday_days: 0,     // 國定假日天數 0~5
  });

  // 排班規則
  const [rulesForm, setRulesForm] = useState({
    max_off_days: 8,           // 每人可申請休假天數上限
    daily_d: 3, daily_e: 3, daily_n: 3, // 各班每日人數
    special_dates: [] as { date: string; d: number; e: number; n: number }[], // 特殊日期覆蓋
    max_consecutive_work: 5,   // 連續上班天數上限（跨週累計）
    weekly_max_two_shifts: true, // 每週至多兩種班別
    lock_first_day: true,      // 第一天鎖定
    no_reverse_shift: true,    // 反向班禁止（硬規則）
    prefer_smooth: true,       // 盡量順班（軟規則）
    notes: "",
  });

  // 輪班比例
  const [ratioForm, setRatioForm] = useState({
    de_d: 1, de_e: 1,          // 輪班DE
    en_e: 1, en_n: 1,          // 輪班EN
    dn_d: 1, dn_n: 1,          // 輪班DN
    den_d: 1, den_e: 1, den_n: 1, // 輪班DEN
  });
  const [ratioCalc, setRatioCalc] = useState<null | { label: string; days: string; isOverride?: boolean }[]>(null);
  // 個別護理師比例覆蓋
  type RatioOverride = { nurse_uid: string; ratio: Record<string, number> };
  const [ratioOverrides, setRatioOverrides] = useState<RatioOverride[]>([]);
  // 帳號管理：attr 變更提示
  const [attrChangeWarn, setAttrChangeWarn] = useState<{ uid: string; oldAttr: string; newAttr: string } | null>(null);
  const [deleteShiftTarget, setDeleteShiftTarget] = useState<{type:"work"|"off"; idx:number; code:string} | null>(null);

  // 班別設定編輯暫存（含 admin_only 旗標）
  const [editWorkShifts, setEditWorkShifts] = useState<ShiftDef[]>(DEFAULT_WORK);
  const [editOffShifts, setEditOffShifts] = useState<ShiftDef[]>(DEFAULT_OFF);

  // Toast
  const [toast, setToast] = useState({ msg:"", ok:true });
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const year = parseInt(ym.slice(0,4));
  const month = parseInt(ym.slice(5,7));

  // 週期相關計算
  const cycleIsSet = !!(cycle.start_date && cycle.end_date);
  const fullTimeOff = Math.min(8 + cycle.holiday_days, 13);
  const partTimeOff = Math.min(16 + cycle.holiday_days, 21);

  // 產生日期陣列
  function dateRange(from: string, to: string): string[] {
    const result: string[] = [];
    let d = dayjs(from);
    const end = dayjs(to);
    while (d.isBefore(end) || d.isSame(end, 'day')) {
      result.push(d.format("YYYY-MM-DD"));
      d = d.add(1, 'day');
    }
    return result;
  }

  // 後台班表顯示的日期：週期前7天（參考）+ 週期內
  const refDays: string[] = cycleIsSet
    ? dateRange(dayjs(cycle.start_date).subtract(7,'day').format("YYYY-MM-DD"),
                dayjs(cycle.start_date).subtract(1,'day').format("YYYY-MM-DD"))
    : [];
  const cycleDays: string[] = cycleIsSet
    ? dateRange(cycle.start_date, cycle.end_date)
    : Array.from({ length: dayjs(ym+"-01").daysInMonth() }, (_, i) =>
        ym + "-" + String(i+1).padStart(2,"0"));
  const allDays = [...refDays, ...cycleDays];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { allDaysRef.current = allDays; });

  // 只顯示護理師角色
  const nurseUsers = users.filter(u => ["nurse","dual"].includes(u.role));
  nurseUsersRef.current = nurseUsers;

  // 每日休假人數（只算週期內）
  const dailyOff: Record<string,number> = {};
  for (const d of allDays) {
    dailyOff[d] = nurseUsers.filter(u => {
      const s = schedule.find(r => r.nurse_uid===u.uid && r.date===d)?.shift;
      return s && isOff(s, offShifts);
    }).length;
  }

  useEffect(() => { fetchUsers(); fetchRules(); }, []);
  useEffect(() => { if (tab==="schedule") fetchSchedule(); }, [tab, ym, cycle.start_date, cycle.end_date]);
  useEffect(() => { if (tab==="logs") fetchLogs(); }, [tab]);

  // 手機長按拖曳：React onTouchStart 在 span 上啟動計時，
  // 長按觸發後才動態掛 non-passive 的 document.touchmove 阻止頁面捲動。
  function handleCellTouchStart(e: React.TouchEvent<HTMLSpanElement>) {
    e.preventDefault(); // 阻止文字選取選單
    const span = e.currentTarget;
    const nurseUid = span.dataset.nurseUid;
    const date     = span.dataset.date;
    const shift    = span.dataset.shift;
    if (!nurseUid || !date) return;

    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchSrcRef.current   = { nurseUid, date, shift: shift ?? "" };

    // 滑動偵測狀態
    let swipeStarted = false;
    let dirDecided = false;

    function nativeMove(ev: TouchEvent) {
      const t = ev.touches[0];
      const dx = t.clientX - touchStartPos.current.x;
      const dy = t.clientY - touchStartPos.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // 已進入拖曳模式（長按）：阻止捲動並追蹤格子
      if (dragFillRef.current) {
        ev.preventDefault();
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        if (!el) return;
        const target = (el.dataset.nurseUid ? el : el.closest("[data-nurse-uid]")) as HTMLElement | null;
        if (!target) return;
        const cellUid  = target.dataset.nurseUid;
        const cellDate = target.dataset.date;
        if (!cellUid || !cellDate || cellUid !== dragFillRef.current.nurseUid) return;
        if (!dragFillRef.current.dates.has(cellDate)) {
          dragFillRef.current.dates.add(cellDate);
          setDragFill({ ...dragFillRef.current, dates: new Set(dragFillRef.current.dates) });
        }
        return;
      }

      // 判斷滑動方向（只決定一次）
      if (!dirDecided && (absDx > 6 || absDy > 6)) {
        dirDecided = true;
        if (absDx > absDy) {
          // 橫向：進入滑動選取模式，取消長按計時器
          swipeStarted = true;
          if (touchTimerRef.current) { clearTimeout(touchTimerRef.current); touchTimerRef.current = null; }
          const src = touchSrcRef.current;
          if (!src) return;
          swipeRef.current = { nurseUid: src.nurseUid, startDate: src.date, dates: new Set([src.date]), active: true };
          setSwipeDates(new Set([src.date]));
          if (navigator.vibrate) navigator.vibrate(30);
        } else {
          // 縱向：取消長按計時器，讓頁面正常捲動
          if (touchTimerRef.current) { clearTimeout(touchTimerRef.current); touchTimerRef.current = null; }
          touchSrcRef.current = null;
          document.removeEventListener("touchmove", nativeMove);
          document.removeEventListener("touchend",  nativeEnd);
          document.removeEventListener("touchcancel", nativeEnd);
          return;
        }
      }

      if (swipeStarted && swipeRef.current) {
        ev.preventDefault();

        // 邊緣自動捲動
        const wrap = tableWrapRef.current;
        const spd = scrollSpeedRef.current;
        if (wrap) {
          if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current);
          const W = window.innerWidth;
          if (t.clientX > W * 0.8) {
            const scroll = () => { wrap.scrollLeft += spd; autoScrollFrameRef.current = requestAnimationFrame(scroll); };
            autoScrollFrameRef.current = requestAnimationFrame(scroll);
          } else if (t.clientX < W * 0.2) {
            const scroll = () => { wrap.scrollLeft -= spd; autoScrollFrameRef.current = requestAnimationFrame(scroll); };
            autoScrollFrameRef.current = requestAnimationFrame(scroll);
          } else {
            autoScrollFrameRef.current = null;
          }
        }

        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        if (!el) return;
        const target = (el.dataset.nurseUid ? el : el.closest("[data-nurse-uid]")) as HTMLElement | null;
        if (!target) return;
        const cellUid  = target.dataset.nurseUid;
        const cellDate = target.dataset.date;
        if (!cellUid || !cellDate || cellUid !== swipeRef.current.nurseUid) return;

        // 計算起點到終點之間所有日期
        const days = allDaysRef.current;
        const startIdx = days.indexOf(swipeRef.current.startDate);
        const endIdx   = days.indexOf(cellDate);
        if (startIdx < 0 || endIdx < 0) return;
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const rangeSet = new Set(days.slice(lo, hi + 1));
        swipeRef.current.dates = rangeSet;
        setSwipeDates(new Set(rangeSet));
      }
    }

    function nativeEnd(ev: TouchEvent) {
      document.removeEventListener("touchmove",   nativeMove);
      document.removeEventListener("touchend",    nativeEnd);
      document.removeEventListener("touchcancel", nativeEnd);
      if (autoScrollFrameRef.current) { cancelAnimationFrame(autoScrollFrameRef.current); autoScrollFrameRef.current = null; }

      // 長按拖曳結束
      if (dragFillRef.current) {
        const df = dragFillRef.current;
        const updates = Array.from(df.dates).map(dd => ({ nurse_uid: df.nurseUid, date: dd, shift: df.shift }));
        batchSaveRef.current(updates);
        dragFillRef.current = null;
        setDragFill(null);
        touchSrcRef.current = null;
        return;
      }

      // 滑動選取結束
      if (swipeStarted && swipeRef.current && swipeRef.current.dates.size >= 2) {
        ev.preventDefault();
        const sw = swipeRef.current;
        const sorted = allDaysRef.current.filter(d => sw.dates.has(d));
        const nurse = nurseUsers.find(u => u.uid === sw.nurseUid);
        setSwipePopup({ nurseUid: sw.nurseUid, nurseName: nurse?.name ?? sw.nurseUid, dates: sorted });
        swipeRef.current = null;
        // swipeDates 留著讓高亮顯示到 popup 關閉
        return;
      }

      // 清除滑動狀態（單格）
      swipeRef.current = null;
      setSwipeDates(new Set());

      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      touchSrcRef.current = null;
    }

    // 長按計時器（只在有班別的格子啟動）
    if (shift) {
      touchTimerRef.current = setTimeout(() => {
        if (!touchSrcRef.current) return;
        const src = touchSrcRef.current;
        if (navigator.vibrate) navigator.vibrate(50);
        dragFillRef.current = { nurseUid: src.nurseUid, dates: new Set([src.date]), shift: src.shift };
        setDragFill({ nurseUid: src.nurseUid, dates: new Set([src.date]), shift: src.shift });
      }, 500);
    }

    document.addEventListener("touchmove",   nativeMove, { passive: false });
    document.addEventListener("touchend",    nativeEnd);
    document.addEventListener("touchcancel", nativeEnd);
  }

  function handleCellTouchMove(_e: React.TouchEvent) {
    // native handler 接管，React 這邊不需處理
  }

  function handleCellTouchEnd() {
    // native handler 接管，React 這邊不需處理
  }

  // Ctrl / Shift 放開時顯示批次填入 Popup
  useEffect(() => {
    function parseSel(sel: Set<string>): Map<string, string[]> {
      const byNurse = new Map<string, string[]>();
      for (const key of sel) {
        const idx = key.indexOf("_");
        const uid = key.slice(0, idx);
        const date = key.slice(idx + 1);
        if (!byNurse.has(uid)) byNurse.set(uid, []);
        byNurse.get(uid)!.push(date);
      }
      return byNurse;
    }

    function showBatchPopupFor(sel: Set<string>) {
      if (!sel.size) return;
      const byNurse = parseSel(sel);
      if (byNurse.size !== 1) return; // only single-nurse batch supported
      const [uid, dates] = [...byNurse.entries()][0];
      const allD = allDaysRef.current;
      const sorted = allD.filter(d => dates.includes(d));
      const nurse = nurseUsersRef.current.find(u => u.uid === uid);
      setBatchPopup({ nurseUid: uid, nurseName: nurse?.name ?? uid, dates: sorted });
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") {
        const sel = ctrlSelectedRef.current;
        if (sel.size) {
          showBatchPopupFor(sel);
        }
        ctrlSrcShift.current = null;
        return;
      }
      if (e.key === "Shift") {
        const sel = shiftRangeRef.current;
        if (sel.size) {
          showBatchPopupFor(sel);
        }
        return;
      }
    }
    window.addEventListener("keyup", onKeyUp);
    return () => window.removeEventListener("keyup", onKeyUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsers() {
    try { const { data } = await api.get("/users"); setUsers(data.users ?? []); }
    catch (err: any) { showToast("✗ 載入帳號失敗：" + (err.response?.data?.detail ?? err.message), false); }
  }
  async function fetchSchedule() {
    try {
      if (cycleIsSet) {
        // 週期可能跨月（如 6/29-7/26），需抓所有涉及的月份
        const refStart = dayjs(cycle.start_date).subtract(7,'day');
        const rangeEnd = dayjs(cycle.end_date);
        const months = new Set<string>();
        let cur = refStart.startOf('month');
        while (cur.isBefore(rangeEnd) || cur.isSame(rangeEnd, 'month')) {
          months.add(cur.format("YYYY-MM"));
          cur = cur.add(1,'month');
        }
        const allRows: ShiftRow[] = [];
        for (const m of months) {
          const y = parseInt(m.slice(0,4)), mo = parseInt(m.slice(5,7));
          const { data } = await api.get("/schedule", { params: { year: y, month: mo } });
          allRows.push(...(data.schedule ?? []));
        }
        setSchedule(allRows);
      } else {
        const { data } = await api.get("/schedule", { params: { year, month } });
        setSchedule(data.schedule ?? []);
      }
    } catch {}
  }
  async function fetchLogs() {
    try { const { data } = await api.get("/logs"); setLogs(data.logs ?? []); }
    catch {}
  }
  async function clearLogs(hours: number) {
    try {
      await api.delete("/logs", { params: { before_hours: hours } });
      showToast("✓ 操作紀錄已清除");
      fetchLogs();
    } catch { showToast("✗ 清除失敗", false); }
    finally { setClearLogsConfirm(null); }
  }
  async function fetchRules() {
    try {
      const { data } = await api.get("/rules");
      const r = data.rules ?? {};
      setAllRules(r);
      if (r.cycle) {
        setCycle(prev => ({
          ...prev,
          ...r.cycle,
          period_days: r.cycle.period_days ?? (
            r.cycle.start_date && r.cycle.end_date
              ? Math.max(1, dayjs(r.cycle.end_date).diff(dayjs(r.cycle.start_date),'day') + 1)
              : prev.period_days
          ),
        }));
      }
      if (r.scheduling) setRulesForm(prev => ({ ...prev, ...r.scheduling }));
      if (r.ratio) setRatioForm(prev => ({ ...prev, ...r.ratio }));
      if (r.ratio_overrides) setRatioOverrides(r.ratio_overrides);
      if (r.shifts?.work) { setWorkShifts(r.shifts.work); setEditWorkShifts(r.shifts.work); }
      if (r.shifts?.off)  { setOffShifts(r.shifts.off);  setEditOffShifts(r.shifts.off);   }
    } catch {}
  }

  function showToast(msg: string, ok = true) {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, ok });
    toastRef.current = setTimeout(() => setToast({ msg:"", ok:true }), 2500);
  }

  // ── 班表操作
  async function updateShift(nurse_uid: string, date: string, shift: string | null) {
    console.log("[updateShift] called:", { nurse_uid, date, shift });
    if (!nurse_uid || !date) {
      console.error("[updateShift] missing nurse_uid or date");
      showToast("✗ 資料錯誤：缺少護理師或日期", false);
      return;
    }
    const key = `${nurse_uid}_${date}`;
    const prev = schedule.find(r => r.nurse_uid===nurse_uid && r.date===date)?.shift ?? null;
    setSchedule(cur => {
      const f = cur.filter(r => !(r.nurse_uid===nurse_uid && r.date===date));
      if (shift) f.push({ nurse_uid, date, shift, confirmed: false });
      return f;
    });
    setSaving(s => new Set(s).add(key));
    try {
      console.log("[updateShift] POST /schedule/shift →", { nurse_uid, date, shift });
      const res = await api.post("/schedule/shift", { nurse_uid, date, shift });
      console.log("[updateShift] success:", res.data);
      showToast("✓ 已儲存");
    } catch (err: any) {
      const detail = err.response?.data?.detail ?? err.message ?? "無法連線到伺服器";
      console.error("[updateShift] error:", err.response?.status, detail, err);
      setSchedule(cur => {
        const f = cur.filter(r => !(r.nurse_uid===nurse_uid && r.date===date));
        if (prev) f.push({ nurse_uid, date, shift: prev });
        return f;
      });
      showToast(`✗ 儲存失敗（${err.response?.status ?? "網路錯誤"}）：${detail}`, false);
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  // ── 批次儲存（Shift/Ctrl/拖曳共用）
  async function batchSave(updates: Array<{ nurse_uid: string; date: string; shift: string }>) {
    if (!updates.length) return;
    // 去重：同一格子只保留最後一筆
    const deduped = Array.from(
      new Map(updates.map(u => [`${u.nurse_uid}_${u.date}`, u])).values()
    );
    const cur = scheduleRef.current;
    const prevMap = new Map(deduped.map(u => [`${u.nurse_uid}_${u.date}`, cur.find(r => r.nurse_uid===u.nurse_uid && r.date===u.date)?.shift ?? null]));
    // 樂觀更新 UI
    setSchedule(prev => {
      let next = [...prev];
      for (const u of deduped) {
        next = next.filter(r => !(r.nurse_uid===u.nurse_uid && r.date===u.date));
        next.push({ nurse_uid: u.nurse_uid, date: u.date, shift: u.shift, confirmed: false });
      }
      return next;
    });
    const keys = deduped.map(u => `${u.nurse_uid}_${u.date}`);
    setSaving(s => { const n = new Set(s); keys.forEach(k => n.add(k)); return n; });
    let failed = false;
    try {
      // 循序執行避免並行 INSERT unique 衝突
      for (const u of deduped) {
        await api.post("/schedule/shift", u);
      }
      showToast(`✓ 已儲存 ${deduped.length} 格`);
    } catch (err: any) {
      failed = true;
      const detail = err.response?.data?.detail ?? err.message ?? "網路錯誤";
      showToast(`✗ 儲存失敗：${detail}`, false);
    } finally {
      setSaving(s => { const n = new Set(s); keys.forEach(k => n.delete(k)); return n; });
    }
    if (failed) {
      setSchedule(prev => {
        let next = [...prev];
        for (const u of deduped) {
          next = next.filter(r => !(r.nurse_uid===u.nurse_uid && r.date===u.date));
          const p = prevMap.get(`${u.nurse_uid}_${u.date}`);
          if (p) next.push({ nurse_uid: u.nurse_uid, date: u.date, shift: p });
        }
        return next;
      });
    }
  }

  async function confirmAll() {
    const pending = schedule.filter(r => !r.confirmed && r.shift);
    if (!pending.length) { showToast("沒有待確認的班別"); return; }
    setConfirmingAll(true);
    try {
      await api.post("/schedule/confirm", pending.map(r => ({ nurse_uid: r.nurse_uid, date: r.date, shift: r.shift })));
      setSchedule(cur => cur.map(r => r.confirmed ? r : { ...r, confirmed: true }));
      showToast(`✓ 已確認 ${pending.length} 筆班別`);
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "確認失敗"), false);
    } finally {
      setConfirmingAll(false);
    }
  }

  // ── 帳號管理
  async function createUser() {
    if (!newUser.uid || !newUser.password || !newUser.name) return;
    setCreating(true);
    try {
      await api.post("/users", newUser);
      showToast("✓ 帳號建立成功");
      setNewUser({ uid:"", password:"", name:"", role:"nurse", level:"member", attr:"輪班", halftime:false, note:"" });
      fetchUsers();
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "建立失敗"), false);
    } finally { setCreating(false); }
  }

  async function saveEditUser() {
    if (!editUser) return;
    try {
      const { new_password, ...patch } = editForm;
      await api.patch(`/users/${editUser.uid}`, patch);
      if (new_password && new_password.length >= 4) {
        await api.post(`/users/${editUser.uid}/reset-password`, { new_password });
      }
      showToast("✓ 已更新");
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "更新失敗"), false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.uid}`);
      showToast("✓ 已刪除");
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "刪除失敗"), false);
    }
  }

  async function saveSortOrder(ordered: User[]) {
    try {
      await api.post("/users/reorder", ordered.map(u => u.uid));
    } catch {}
  }

  function dropUser(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const visible = isSuperAdmin ? [...users] : users.filter(u => u.role !== "superadmin");
    const hidden  = isSuperAdmin ? [] : users.filter(u => u.role === "superadmin");
    const [moved] = visible.splice(fromIdx, 1);
    visible.splice(toIdx, 0, moved);
    const merged = [...hidden, ...visible];
    setUsers(merged);
    saveSortOrder(merged);
  }

  // 帳號管理 iOS 觸控拖曳
  function handleUserDragHandleTouchStart(e: React.TouchEvent, idx: number) {
    e.preventDefault();
    const touch = e.touches[0];
    const el = userItemRefs.current[idx];
    const itemH = el?.getBoundingClientRect().height ?? 60;
    userDragRef.current = { fromIdx: idx, overIdx: idx, offsetY: 0, startY: touch.clientY, curY: touch.clientY, itemH };
    setUserDragging(idx);
    setUserDragOver(idx);
    if (navigator.vibrate) navigator.vibrate(40);

    function onMove(ev: TouchEvent) {
      ev.preventDefault();
      const t = ev.touches[0];
      if (!userDragRef.current) return;
      userDragRef.current.curY = t.clientY;
      const dy = t.clientY - userDragRef.current.startY;
      const newOver = Math.max(0, Math.min(
        (isSuperAdmin ? users.length : users.filter(u => u.role !== "superadmin").length) - 1,
        userDragRef.current.fromIdx + Math.round(dy / userDragRef.current.itemH)
      ));
      if (newOver !== userDragRef.current.overIdx) {
        userDragRef.current.overIdx = newOver;
        setUserDragOver(newOver);
      }
      // 即時更新拖曳元素位置
      const handle = userItemRefs.current[idx];
      if (handle) handle.style.transform = `translateY(${dy}px) scale(1.02)`;
    }

    function onEnd() {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      const dr = userDragRef.current;
      if (dr) {
        const handle = userItemRefs.current[idx];
        if (handle) { handle.style.transform = ""; handle.style.transition = ""; }
        dropUser(dr.fromIdx, dr.overIdx);
      }
      userDragRef.current = null;
      setUserDragging(null);
      setUserDragOver(null);
    }

    const el2 = userItemRefs.current[idx];
    if (el2) { el2.style.transition = "box-shadow 0.15s ease"; }
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }

  // 班別設定 iOS 觸控拖曳
  function handleShiftDragHandleTouchStart(e: React.TouchEvent, type: "work"|"off", idx: number) {
    e.preventDefault();
    const touch = e.touches[0];
    const refs = type === "work" ? shiftWorkRefs : shiftOffRefs;
    const el = refs.current[idx];
    const itemH = el?.getBoundingClientRect().height ?? 56;
    shiftDragRef.current = { type, fromIdx: idx, overIdx: idx, startY: touch.clientY, curY: touch.clientY, itemH };
    setShiftDragging({ type, idx });
    setShiftDragOver({ type, idx });
    if (navigator.vibrate) navigator.vibrate(40);

    function onMove(ev: TouchEvent) {
      ev.preventDefault();
      const t = ev.touches[0];
      if (!shiftDragRef.current) return;
      shiftDragRef.current.curY = t.clientY;
      const dy = t.clientY - shiftDragRef.current.startY;
      const list = type === "work" ? editWorkShifts : editOffShifts;
      const newOver = Math.max(0, Math.min(list.length - 1,
        shiftDragRef.current.fromIdx + Math.round(dy / shiftDragRef.current.itemH)
      ));
      if (newOver !== shiftDragRef.current.overIdx) {
        shiftDragRef.current.overIdx = newOver;
        setShiftDragOver({ type, idx: newOver });
      }
      const elDrag = refs.current[idx];
      if (elDrag) elDrag.style.transform = `translateY(${dy}px) scale(1.02)`;
    }

    function onEnd() {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      const dr = shiftDragRef.current;
      if (dr && dr.fromIdx !== dr.overIdx) {
        const elDrag = refs.current[idx];
        if (elDrag) { elDrag.style.transform = ""; }
        const setter = type === "work" ? setEditWorkShifts : setEditOffShifts;
        setter(prev => {
          const arr = [...prev];
          const [moved] = arr.splice(dr.fromIdx, 1);
          arr.splice(dr.overIdx, 0, moved);
          return arr;
        });
      } else {
        const elDrag = refs.current[idx];
        if (elDrag) elDrag.style.transform = "";
      }
      shiftDragRef.current = null;
      setShiftDragging(null);
      setShiftDragOver(null);
    }

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }

  // 行內快速修改單一欄位
  async function patchUserField(uid: string, field: string, value: unknown) {
    if (field === "attr") {
      const oldUser = users.find(u => u.uid === uid);
      const oldAttr = oldUser?.attr ?? "";
      const newAttr = value as string;
      if (oldAttr !== newAttr && isRotationAttr(oldAttr) && isRotationAttr(newAttr)) {
        // 輪班→輪班：可能有個別覆蓋不相容
        const hasOverride = ratioOverrides.some(o => o.nurse_uid === uid);
        if (hasOverride) {
          setAttrChangeWarn({ uid, oldAttr, newAttr });
          return; // 先顯示警告，確認後才套用
        }
      }
    }
    try {
      await api.patch(`/users/${uid}`, { [field]: value });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, [field]: value } : u));
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "更新失敗"), false);
    }
  }

  async function confirmAttrChange() {
    if (!attrChangeWarn) return;
    const { uid, newAttr } = attrChangeWarn;
    setAttrChangeWarn(null);
    try {
      await api.patch(`/users/${uid}`, { attr: newAttr });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, attr: newAttr } : u));
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "更新失敗"), false);
    }
  }

  // ── 三方連動 handlers
  const DOW_FULL = ["週日","週一","週二","週三","週四","週五","週六"];
  function fmtDateDay(d: string) {
    if (!d || !dayjs(d).isValid()) return "";
    return `${dayjs(d).format("YYYY/MM/DD")} ${DOW_FULL[dayjs(d).day()]}`;
  }

  function handleStartDate(val: string) {
    setCycle(prev => {
      const p = { ...prev, start_date: val };
      if (val && dayjs(val).isValid()) {
        if (prev.end_date && dayjs(prev.end_date).isValid()) {
          // start + end → 計算天數
          p.period_days = Math.max(1, dayjs(prev.end_date).diff(dayjs(val),'day') + 1);
        } else if (prev.period_days > 0) {
          // start + 天數 → 計算結束日
          p.end_date = dayjs(val).add(prev.period_days - 1,'day').format("YYYY-MM-DD");
        }
      }
      return p;
    });
  }

  function handleEndDate(val: string) {
    setCycle(prev => {
      const p = { ...prev, end_date: val };
      if (val && dayjs(val).isValid()) {
        if (prev.start_date && dayjs(prev.start_date).isValid()) {
          // start + end → 計算天數
          p.period_days = Math.max(1, dayjs(val).diff(dayjs(prev.start_date),'day') + 1);
        } else if (prev.period_days > 0) {
          // 天數 + end → 計算開始日
          p.start_date = dayjs(val).subtract(prev.period_days - 1,'day').format("YYYY-MM-DD");
        }
      }
      return p;
    });
  }

  function handlePeriodDays(val: number) {
    const v = Math.max(1, val || 1);
    setCycle(prev => {
      const p = { ...prev, period_days: v };
      if (prev.start_date && dayjs(prev.start_date).isValid()) {
        // start + 天數 → 計算結束日
        p.end_date = dayjs(prev.start_date).add(v - 1,'day').format("YYYY-MM-DD");
      } else if (prev.end_date && dayjs(prev.end_date).isValid()) {
        // 天數 + end → 計算開始日
        p.start_date = dayjs(prev.end_date).subtract(v - 1,'day').format("YYYY-MM-DD");
      }
      return p;
    });
  }

  // ── 規則儲存
  async function saveCycle() {
    try {
      await api.post("/rules", { rules: { cycle } });
      showToast("✓ 週期設定已儲存");
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? err.response?.statusText ?? err.message ?? "儲存失敗";
      showToast(`✗ ${msg}`, false);
    }
  }
  async function saveSchedulingRules() {
    try {
      await api.post("/rules", { rules: { scheduling: rulesForm, ratio: ratioForm, ratio_overrides: ratioOverrides } });
      showToast("✓ 排班規則已儲存");
    } catch (err: any) {
      showToast(`✗ ${err.response?.data?.detail ?? err.message ?? "儲存失敗"}`, false);
    }
  }

  // 試算各輪班屬性的預估班別天數
  // 從屬性取出輪班代碼列表
  function attrShifts(attr: string): string[] {
    if (attr === "輪班DE") return ["D","E"];
    if (attr === "輪班EN") return ["E","N"];
    if (attr === "輪班DN") return ["D","N"];
    if (attr === "輪班DEN") return ["D","E","N"];
    return [];
  }

  function isRotationAttr(attr: string) { return attr.startsWith("輪班"); }

  function defaultRatioForAttr(attr: string): Record<string, number> {
    const keys = attrShifts(attr);
    return Object.fromEntries(keys.map(k => [k, 1]));
  }

  function calcRatioDays() {
    const offDays = { full: fullTimeOff, part: partTimeOff };
    const results: { label: string; days: string; isOverride?: boolean }[] = [];
    const workDays = (off: number) => cycle.period_days - off;
    const fmt = (n: number) => `${Math.floor(n)}～${Math.ceil(n)} 天`;

    // 全域
    const totalDE = ratioForm.de_d + ratioForm.de_e;
    if (totalDE > 0) {
      const wd = workDays(offDays.full);
      results.push({ label: "輪班DE（全職）", days: `D: ${fmt(wd*ratioForm.de_d/totalDE)}　E: ${fmt(wd*ratioForm.de_e/totalDE)}` });
    }
    const totalEN = ratioForm.en_e + ratioForm.en_n;
    if (totalEN > 0) {
      const wd = workDays(offDays.full);
      results.push({ label: "輪班EN（全職）", days: `E: ${fmt(wd*ratioForm.en_e/totalEN)}　N: ${fmt(wd*ratioForm.en_n/totalEN)}` });
    }
    const totalDN = ratioForm.dn_d + ratioForm.dn_n;
    if (totalDN > 0) {
      const wd = workDays(offDays.full);
      results.push({ label: "輪班DN（全職）", days: `D: ${fmt(wd*ratioForm.dn_d/totalDN)}　N: ${fmt(wd*ratioForm.dn_n/totalDN)}` });
    }
    const totalDEN = ratioForm.den_d + ratioForm.den_e + ratioForm.den_n;
    if (totalDEN > 0) {
      const wdF = workDays(offDays.full);
      const wdP = workDays(offDays.part);
      results.push({ label: "輪班DEN（全職）", days: `D: ${fmt(wdF*ratioForm.den_d/totalDEN)}　E: ${fmt(wdF*ratioForm.den_e/totalDEN)}　N: ${fmt(wdF*ratioForm.den_n/totalDEN)}` });
      results.push({ label: "輪班DEN（半職）", days: `D: ${fmt(wdP*ratioForm.den_d/totalDEN)}　E: ${fmt(wdP*ratioForm.den_e/totalDEN)}　N: ${fmt(wdP*ratioForm.den_n/totalDEN)}` });
    }

    // 個別覆蓋試算
    for (const ov of ratioOverrides) {
      const nurse = nurseUsers.find(u => u.uid === ov.nurse_uid);
      if (!nurse) continue;
      const keys = Object.keys(ov.ratio);
      const total = Object.values(ov.ratio).reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      const isHalf = nurse.halftime;
      const wd = workDays(isHalf ? offDays.part : offDays.full);
      const daysStr = keys.map(k => `${k}: ${fmt(wd * ov.ratio[k] / total)}`).join("　");
      results.push({ label: `${nurse.name}（個別覆蓋）`, days: daysStr, isOverride: true });
    }

    setRatioCalc(results);
  }
  async function saveShiftConfig() {
    try {
      await api.post("/rules", { rules: { shifts: { work: editWorkShifts, off: editOffShifts } } });
      setWorkShifts(editWorkShifts);
      setOffShifts(editOffShifts);
      showToast("✓ 班別設定已儲存");
    } catch (err: any) {
      showToast(`✗ ${err.response?.data?.detail ?? err.message ?? "儲存失敗"}`, false);
    }
  }

  // ── 班別設定：新增 / 移除 / 改名
  function addShift(type: "work"|"off") {
    const s: ShiftDef = { code: "", label: "", type };
    if (type === "work") setEditWorkShifts(p => [...p, s]);
    else setEditOffShifts(p => [...p, s]);
  }
  function removeShift(type: "work"|"off", idx: number) {
    const code = (type === "work" ? editWorkShifts : editOffShifts)[idx]?.code || "?";
    setDeleteShiftTarget({ type, idx, code });
  }
  function confirmRemoveShift() {
    if (!deleteShiftTarget) return;
    const { type, idx } = deleteShiftTarget;
    if (type === "work") setEditWorkShifts(p => p.filter((_,i) => i!==idx));
    else setEditOffShifts(p => p.filter((_,i) => i!==idx));
    setDeleteShiftTarget(null);
  }
  function updateShiftDef(type: "work"|"off", idx: number, field: keyof ShiftDef, val: unknown) {
    if (type === "work") setEditWorkShifts(p => p.map((s,i) => i===idx ? {...s,[field]:val} : s));
    else setEditOffShifts(p => p.map((s,i) => i===idx ? {...s,[field]:val} : s));
  }

  // ── 格子樣式
  function cellStyle(shift: string|undefined, confirmed: boolean|undefined, saving: boolean): { cls: string; style: React.CSSProperties } {
    let cls = "ap-cell";
    let style: React.CSSProperties = {};
    if (saving) { cls += " is-saving"; }
    else if (!shift) { cls += " is-empty"; }
    else if (confirmed) { style = { background:"#166534", borderColor:"#14532d", color:"#fff" }; }
    else { style = { background:"#dcfce7", borderColor:"#16a34a", color: shiftColor(shift, offShifts) }; }
    return { cls, style };
  }

  const TABS: { key: Tab; label: string }[] = [
    { key:"schedule",   label:"手動填寫" },
    { key:"cycle",      label:"排班週期" },
    { key:"rules",      label:"排班規則" },
    { key:"generate",   label:"一鍵生成" },
    { key:"users",      label:"帳號管理" },
    { key:"shifts_cfg", label:"班別設定" },
    { key:"logs",       label:"操作紀錄" },
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f1f5f9 !important; color-scheme: light !important; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", sans-serif; color: #111827; font-size: 14px; }

        /* Navbar */
        .ap-nav {
          position: sticky; top: 0; z-index: 200;
          height: 52px; background: #1e3a5f; color: #fff;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; gap: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,.2);
        }
        .ap-nav-l { display: flex; align-items: center; gap: 10px; }
        .ap-nav-r { display: flex; align-items: center; gap: 8px; }

        /* Tab bar */
        .ap-tabs {
          position: sticky; top: 52px; z-index: 100;
          background: #fff; border-bottom: 1px solid #e5e7eb;
          display: flex; flex-wrap: wrap; gap: 0;
          box-shadow: 0 1px 3px rgba(0,0,0,.06);
        }
        .ap-tab {
          padding: 12px 16px; border: none; background: transparent; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 500; white-space: nowrap;
          border-bottom: 2px solid transparent; color: #6b7280;
          transition: color .15s, border-color .15s;
        }
        .ap-tab.active { color: #1d4ed8; border-bottom-color: #1d4ed8; font-weight: 700; }
        .ap-tab:hover:not(.active) { color: #374151; background: #f8fafc; }

        /* Layout */
        .ap-body { max-width: 1400px; margin: 0 auto; padding: 20px 16px 80px; }
        .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; }
        .card-head { padding: 16px 20px 12px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .card-body { padding: 20px; }

        /* Buttons */
        .btn { border: none; border-radius: 8px; font-family: inherit; cursor: pointer; font-size: 13px; font-weight: 600; padding: 8px 16px; transition: opacity .15s, background .15s; white-space: nowrap; }
        .btn:disabled { opacity: .4; cursor: not-allowed; }
        .btn-primary { background: #2563eb; color: #fff; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-green  { background: #16a34a; color: #fff; }
        .btn-green:hover:not(:disabled) { background: #15803d; }
        .btn-gray   { background: #f3f4f6; color: #374151; }
        .btn-gray:hover:not(:disabled) { background: #e5e7eb; }
        .btn-red    { background: #dc2626; color: #fff; }
        .btn-red:hover:not(:disabled) { background: #b91c1c; }
        .btn-ghost  { background: rgba(255,255,255,.15); color: #fff; border: 1px solid rgba(255,255,255,.25); }
        .btn-ghost:hover { background: rgba(255,255,255,.25); }
        .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 6px; }
        .btn-outline { background: transparent; border: 1.5px solid #d1d5db; color: #374151; }
        .btn-outline:hover { background: #f3f4f6; }

        /* Forms */
        .fl { display: flex; flex-direction: column; gap: 14px; }
        .frow { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .frow3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .flabel { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 5px; }
        .finput {
          width: 100%; padding: 9px 12px;
          border: 1.5px solid #d1d5db; border-radius: 8px;
          font-size: 14px; font-family: inherit; color: #111827;
          background: #fff; outline: none; color-scheme: light; -webkit-appearance: none;
        }
        .finput:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
        .finput-sm { padding: 6px 9px; font-size: 13px; }
        select.finput { cursor: pointer; }
        .fcheck { display: flex; align-items: center; gap: 8px; }
        .fcheck input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb; }

        /* Table */
        .tbl { border-collapse: collapse; width: 100%; }
        .tbl th, .tbl td { border: 1px solid #f0f0f0; }
        .tbl th { background: #f8fafc; padding: 9px 10px; font-size: 12px; font-weight: 700; color: #6b7280; text-align: left; white-space: nowrap; }
        .tbl td { padding: 10px; vertical-align: middle; font-size: 13px; }
        .tbl tr:hover td { background: #f8fafc; }

        /* 班表格子 */
        .ap-cell {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 28px; border-radius: 5px;
          font-size: 12px; font-weight: 700; cursor: pointer;
          border: 1.5px solid transparent;
          transition: background .1s, opacity .15s;
          user-select: none;
        }
        .ap-cell:hover { filter: brightness(.9); }
        .ap-cell.is-saving { opacity: .3; pointer-events: none; }
        .ap-cell.is-empty { color: #d1d5db; font-size: 17px; font-weight: 300; }
        .ap-cell.is-empty:hover { background: #f0f7ff; color: #6b7280; border-color: #bfdbfe; filter: none; }
        .ap-cell.is-ctrl-sel  { outline: 2px solid #7c3aed; background: #ede9fe !important; filter: none; }
        .ap-cell.is-shift-sel { outline: 2px solid #2563eb; background: #dbeafe !important; color: #1e3a8a !important; filter: none; }
        .ap-cell.is-drag-fill  { outline: 2.5px solid #2563eb; outline-offset: 1px; background: #dbeafe !important; color: #1e40af !important; filter: none; }
        .ap-cell.is-swipe-sel  { outline: 2.5px solid #0891b2; outline-offset: 1px; background: #cffafe !important; color: #164e63 !important; filter: none; }
        .ap-cell.is-anchor    { outline: 2px solid #2563eb; outline-offset: 1px; filter: none; }

        /* 固定左欄 */
        .sticky-name {
          position: sticky; left: 0; z-index: 2;
          background: #fff; border-right: 2px solid #e2e8f0 !important;
          white-space: nowrap;
        }
        .sticky-name-head { background: #f8fafc !important; }
        .ap-th-day { padding: 6px 2px; text-align: center; font-size: 11px; font-weight: 700; color: #374151; background: #f8fafc; min-width: 42px; width: 42px; }
        .ap-th-day.we { color: #dc2626; }
        .ap-td-shift { text-align: center; padding: 2px; }

        /* Badge */
        .badge { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; }
        .badge-nurse { background: #eff6ff; color: #1d4ed8; }
        .badge-dual  { background: #fef3c7; color: #92400e; }
        .badge-admin { background: #dcfce7; color: #15803d; }
        .badge-super { background: #f3e8ff; color: #7c3aed; }
        .badge-leader  { background: #fef9c3; color: #854d0e; }
        .badge-second  { background: #e0f2fe; color: #0369a1; }
        .badge-member  { background: #f3f4f6; color: #6b7280; }

        /* Drag rows */
        .drag-row { cursor: grab; }
        .drag-row.drag-over { background: #eff6ff !important; outline: 2px dashed #2563eb; }

        /* 班別設定編輯列 */
        .shift-edit-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #f3f4f6; }

        /* iOS 風格拖曳把手 */
        .drag-handle {
          color: #d1d5db; font-size: 17px; line-height: 1;
          cursor: grab; flex-shrink: 0;
          padding: 6px 4px;
          user-select: none; -webkit-user-select: none;
          -webkit-touch-callout: none; touch-action: none;
        }
        .drag-handle:active { cursor: grabbing; color: #9ca3af; }

        /* 拖曳中的項目 */
        .drag-item {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          position: relative; z-index: 1;
        }
        .drag-item.is-dragging {
          transform: scale(1.02);
          box-shadow: 0 8px 24px rgba(0,0,0,.15);
          z-index: 10; background: #fff !important;
          border-radius: 10px;
        }
        .drag-item.is-drag-over {
          transform: translateY(-4px);
        }

        /* 橫向模式縮小格子 */
        @media (orientation: landscape) and (max-width: 1024px) {
          .ap-cell { width: 26px !important; height: 24px !important; font-size: 10px !important; }
          .ap-th-day { min-width: 30px !important; width: 30px !important; font-size: 9px !important; padding: 4px 1px !important; }
          .ap-td-shift { padding: 1px !important; }
          .sticky-name { font-size: 10px !important; min-width: 50px !important; max-width: 50px !important; }
        }

        /* Toast */
        .ap-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          padding: 9px 22px; border-radius: 99px; font-size: 13px; font-weight: 600;
          z-index: 10000; pointer-events: none; white-space: nowrap;
          box-shadow: 0 4px 16px rgba(0,0,0,.2);
          animation: toast-up .18s ease;
        }
        .ap-toast.ok  { background: #111827; color: #fff; }
        .ap-toast.err { background: #dc2626; color: #fff; }
        @keyframes toast-up { from { opacity:0; transform: translateX(-50%) translateY(8px); } }

        /* 設定頁區塊 */
        .setting-section { background: #f8fafc; border-radius: 10px; padding: 16px 18px; border: 1px solid #e5e7eb; }
        .setting-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }

        @media (max-width: 640px) {
          .frow { grid-template-columns: 1fr; }
          .frow3 { grid-template-columns: 1fr; }
          .ap-body { padding: 12px 10px 80px; }
          .card-body { padding: 14px; }
        }
      `}</style>

      {/* ── Navbar */}
      <nav className="ap-nav">
        <div className="ap-nav-l">
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:-.3 }}>🏥 護理排班後台</span>
          <span style={{ fontSize:12, opacity:.7 }}>｜{user.name}</span>
        </div>
        <div className="ap-nav-r">
          {isDual && (
            <button className="btn btn-ghost btn-sm" onClick={() => nav("/nurse")}>👤 切換護理師介面</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { clearAuth(); nav("/login"); }}>登出</button>
        </div>
      </nav>

      {/* ── Tab bar */}
      <div className="ap-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`ap-tab${tab===t.key?" active":""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ap-body">

        {/* ══════════════════════════════════
            Tab: 手動填寫班表
        ══════════════════════════════════ */}
        {tab === "schedule" && (
          <div className="card">
            <div className="card-head">
              <div>
                <div style={{ fontSize:16, fontWeight:700 }}>手動填寫班表</div>
                <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>
                  {cycleIsSet
                    ? `週期：${cycle.start_date} ～ ${cycle.end_date}（灰色欄為上週參考，護理師不可見）`
                    : "點格子選擇班別，填完後「確認送出」"}
                </div>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                {!cycleIsSet && (
                  <input type="month" value={ym} onChange={e => setYm(e.target.value)} className="finput" style={{ width:150 }} />
                )}
                <button className="btn btn-green" onClick={confirmAll} disabled={confirmingAll}>
                  {confirmingAll ? "確認中…" : `確認送出（${schedule.filter(r=>!r.confirmed&&r.shift).length} 格待確認）`}
                </button>
              </div>
            </div>

            {/* 統計 */}
            <div style={{ padding:"10px 20px", display:"flex", flexWrap:"wrap", gap:"8px 18px", alignItems:"center", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
              <span style={{ color:"#9ca3af", fontWeight:400 }}>共 {nurseUsers.length} 人</span>
              {[...workShifts, ...offShifts].filter(s => schedule.some(r=>r.shift===s.code && cycleDays.includes(r.date))).map(s => {
                const cnt = schedule.filter(r=>r.shift===s.code && cycleDays.includes(r.date)).length;
                return <span key={s.code} style={{ fontWeight:700, color: isOff(s.code, offShifts)?"#dc2626":"#111827" }}>{s.code} ×{cnt}</span>;
              })}
              {!schedule.length && <span style={{ color:"#d1d5db" }}>尚無班別資料</span>}
              <span style={{ marginLeft:"auto", fontSize:12, color:"#6b7280" }}>
                已確認 {schedule.filter(r=>cycleDays.includes(r.date)&&r.confirmed).length} 格 ／
                待確認 {schedule.filter(r=>cycleDays.includes(r.date)&&!r.confirmed&&r.shift).length} 格
              </span>
            </div>

            {/* 捲動速度選擇器 */}
            <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", padding:"4px 8px 2px" }}>
              <span style={{ fontSize:11, color:"#9ca3af" }}>捲動速度</span>
              {([{l:"🐢",v:3},{l:"慢",v:6},{l:"中",v:10},{l:"快",v:14},{l:"🐇",v:18}] as {l:string;v:number}[]).map(({l,v})=>(
                <button key={v} onClick={()=>{setScrollSpeed(v);localStorage.setItem("scrollSpeed",String(v));}}
                  style={{ padding:"2px 7px", borderRadius:5, border:"1px solid #e5e7eb", fontSize:12, cursor:"pointer",
                    background:scrollSpeed===v?"#16a34a":"#f9fafb", color:scrollSpeed===v?"#fff":"#374151",
                    fontWeight:scrollSpeed===v?700:400, lineHeight:1.4 }}>
                  {l}
                </button>
              ))}
            </div>

            {/* 表格 */}
            <div ref={tableWrapRef} style={{ overflowX:"auto", WebkitOverflowScrolling:"touch", userSelect:"none", WebkitUserSelect:"none" as any }}>
              <table className="tbl">
                <thead>
                  {/* 分段標題列（只在有週期時顯示） */}
                  {cycleIsSet && refDays.length > 0 && (
                    <tr>
                      <th className="sticky-name sticky-name-head" style={{ minWidth:80, width:80 }} />
                      <th colSpan={refDays.length} style={{
                        textAlign:"center", fontSize:11, fontWeight:700, padding:"4px 6px",
                        background:"#f3f4f6", color:"#9ca3af", borderBottom:"none",
                      }}>上週參考（管理員填寫，護理師不可見）</th>
                      <th colSpan={cycleDays.length} style={{
                        textAlign:"center", fontSize:11, fontWeight:700, padding:"4px 6px",
                        background:"#eff6ff", color:"#1d4ed8", borderBottom:"none",
                      }}>本次排班週期（{cycle.start_date} ～ {cycle.end_date}）</th>
                    </tr>
                  )}
                  <tr>
                    <th className="sticky-name sticky-name-head" style={{ minWidth:80, width:80, padding:"9px 12px" }}>護理師</th>
                    {allDays.map(d => {
                      const isRef = refDays.includes(d);
                      const dow = dayjs(d).day();
                      const isWe = dow===0||dow===6;
                      return (
                        <th key={d} className={`ap-th-day${isWe?" we":""}`}
                          style={{ background: isRef ? "#f8fafc" : undefined,
                                   color: isRef ? "#c4c4c4" : (isWe ? "#dc2626" : undefined) }}>
                          <div style={{ fontSize:10, color: isRef?"#d1d5db":undefined }}>
                            {dayjs(d).format("M/D")}
                          </div>
                          <div style={{ fontSize:9, opacity:.7 }}>{DOW_ZH[dow]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {nurseUsers.map(u => (
                    <tr key={u.uid}>
                      <td className="sticky-name" style={{ padding:"6px 10px", fontSize:13, fontWeight:600 }}>
                        <div>{u.name}</div>
                        <div style={{ fontSize:10, color:"#9ca3af", fontWeight:400 }}>{u.attr}</div>
                      </td>
                      {allDays.map(d => {
                        const isRef = refDays.includes(d);
                        const row = schedule.find(r => r.nurse_uid===u.uid && r.date===d);
                        const key = `${u.uid}_${d}`;
                        const isCtrlSel   = ctrlSelected.has(key);
                        const isShiftSel  = shiftRange.has(key);
                        const isDragFill  = dragFill?.nurseUid === u.uid && dragFill.dates.has(d);
                        const isSwipeSel  = swipeDates.has(d) && (swipeRef.current?.nurseUid === u.uid || swipePopup?.nurseUid === u.uid);
                        const isAnchor    = shiftAnchor?.nurseUid === u.uid && shiftAnchor.date === d && !shiftRange.size && !ctrlSelected.size;
                        const { cls: baseCls, style } = cellStyle(row?.shift, row?.confirmed, saving.has(key));
                        const cls = baseCls
                          + (isCtrlSel   ? " is-ctrl-sel"   : "")
                          + (isShiftSel  ? " is-shift-sel"  : "")
                          + (isDragFill  ? " is-drag-fill"  : "")
                          + (isSwipeSel  ? " is-swipe-sel"  : "")
                          + (isAnchor    ? " is-anchor"     : "");
                        const refStyle: React.CSSProperties = isRef
                          ? { opacity: row?.shift ? 0.55 : 0.35, background: row?.shift ? undefined : "#f3f4f6" }
                          : {};

                        function handleClick(e: React.MouseEvent) {
                          // Ctrl / Meta：切換選取（放開 Ctrl 才跳 popup）
                          if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            setCtrlSelected(prev => {
                              const next = new Set(prev);
                              // 同一護理師才能加入，不同護理師清空重選
                              const firstKey = [...next][0];
                              const firstUid = firstKey ? firstKey.slice(0, firstKey.indexOf("_")) : null;
                              if (firstUid && firstUid !== u.uid) next.clear();
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            });
                            setShiftRange(new Set()); // 清除 shift range
                            return;
                          }
                          // Shift：設定高亮範圍（放開 Shift 才跳 popup）
                          if (e.shiftKey) {
                            e.preventDefault();
                            const anchor = shiftAnchorRef.current;
                            if (anchor && anchor.nurseUid === u.uid) {
                              const ai = allDays.indexOf(anchor.date);
                              const ti = allDays.indexOf(d);
                              const [from, to] = ai <= ti ? [ai, ti] : [ti, ai];
                              const range = new Set(allDays.slice(from, to + 1).map(dd => `${u.uid}_${dd}`));
                              setShiftRange(range);
                            } else {
                              // 沒有錨點：把此格設為錨點並開始 range
                              setShiftAnchor({ nurseUid: u.uid, date: d, shift: row?.shift ?? "" });
                              setShiftRange(new Set([key]));
                            }
                            setCtrlSelected(new Set()); // 清除 ctrl 選取
                            return;
                          }
                          // 一般點擊：清除批次選取，設錨點，開 popup
                          setCtrlSelected(new Set());
                          setShiftRange(new Set());
                          setShiftAnchor({ nurseUid: u.uid, date: d, shift: row?.shift ?? "" });
                          setPopup({ date: d, nurseUid: u.uid, nurseName: u.name });
                        }

                        return (
                          <td key={d} className="ap-td-shift" style={{ background: isRef ? "#fafafa" : undefined }}>
                            <span
                              className={cls}
                              style={{ ...style, ...refStyle }}
                              data-nurse-uid={u.uid}
                              data-date={d}
                              data-shift={row?.shift ?? ""}
                              onClick={handleClick}
                              onTouchStart={handleCellTouchStart}
                              onTouchMove={handleCellTouchMove}
                              onTouchEnd={handleCellTouchEnd}
                            >
                              {row?.shift ?? "+"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* 每日休假統計 */}
                  <tr>
                    <td className="sticky-name" style={{ padding:"5px 10px", fontSize:11, color:"#9ca3af", fontWeight:600, background:"#f8fafc" }}>休假人數</td>
                    {allDays.map(d => {
                      const isRef = refDays.includes(d);
                      return (
                        <td key={d} style={{ textAlign:"center", padding:2, background: isRef?"#f8fafc":"#fafafa" }}>
                          {dailyOff[d] > 0
                            ? <span style={{ fontSize:11, fontWeight:700, color: isRef?"#c4c4c4":"#dc2626" }}>{dailyOff[d]}</span>
                            : <span style={{ color:"#e5e7eb", fontSize:10 }}>─</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            Tab: 帳號管理
        ══════════════════════════════════ */}
        {tab === "users" && (() => {
          // 非超管不顯示、不能操作 superadmin 帳號
          const visibleUsers = isSuperAdmin ? users : users.filter(u => u.role !== "superadmin");
          return (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* 帳號列表 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div style={{ fontSize:16, fontWeight:700 }}>帳號管理</div>
                  <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>拖曳 ☰ 可調整顯示順序（手機長按 0.5 秒）</div>
                </div>
                <div style={{ fontSize:12, color:"#6b7280" }}>共 {visibleUsers.length} 位</div>
              </div>
              <div>
                {visibleUsers.map((u, i) => {
                  const canEditRole = isSuperAdmin || (u.role !== "superadmin" && u.uid !== user.uid);
                  const roleBadgeStyle: React.CSSProperties = {
                    display:"inline-block", padding:"2px 8px", borderRadius:5, fontSize:12, fontWeight:700,
                    background: u.role==="nurse"?"#e0f2fe": u.role==="dual"?"#fef3c7": u.role==="admin"?"#f3f4f6":"#f3e8ff",
                    color:      u.role==="nurse"?"#0369a1": u.role==="dual"?"#92400e": u.role==="admin"?"#374151":"#7e22ce",
                  };
                  const selStyle: React.CSSProperties = { fontSize:12, border:"1px solid #e5e7eb", borderRadius:6, padding:"3px 6px", background:"#f9fafb", cursor:"pointer", fontFamily:"inherit" };
                  return (
                    <div
                      key={u.uid}
                      ref={el => { userItemRefs.current[i] = el; }}
                      className={`drag-item${userDragging===i?" is-dragging":""}${userDragOver===i&&userDragging!==null&&userDragging!==i?" is-drag-over":""}`}
                      style={{ borderBottom:"1px solid #f3f4f6", padding:"12px 16px" }}
                    >
                      {/* 行 1：把手 | 姓名 | 角色代稱 | 🔑 | 刪除 */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                        <span
                          className="drag-handle"
                          onTouchStart={e => handleUserDragHandleTouchStart(e, i)}
                        >☰</span>
                        <span style={{ fontWeight:700, fontSize:14 }}>{u.name}</span>
                        <code style={{ fontSize:11, background:"#f3f4f6", padding:"1px 6px", borderRadius:4, color:"#6b7280" }}>{u.uid}</code>
                        {canEditRole ? (
                          <select value={u.role} onChange={e => patchUserField(u.uid,"role",e.target.value)} style={{ ...selStyle, fontSize:12, padding:"2px 4px" }}>
                            <option value="nurse">護理師</option>
                            <option value="dual">管理員兼護理師</option>
                            <option value="admin">管理員</option>
                            {isSuperAdmin && <option value="superadmin">超級管理員</option>}
                          </select>
                        ) : (
                          <span style={roleBadgeStyle}>{ROLE_ABBR[u.role] ?? u.role}</span>
                        )}
                        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                          <button
                            className="btn btn-outline btn-sm"
                            title="重設密碼"
                            onClick={() => { setEditUser(u); setEditForm({ name:u.name, role:u.role, level:u.level, attr:u.attr, halftime:u.halftime, note:u.note, showEditPwd:true }); }}>
                            🔑
                          </button>
                          {u.uid !== user.uid && (
                            <button className="btn btn-sm" style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca" }} onClick={() => setDeleteTarget(u)}>
                              刪除
                            </button>
                          )}
                        </div>
                      </div>
                      {/* 行 2：層級 | 輪班屬性 | 半職 */}
                      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:8 }}>
                        <label style={{ fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", gap:4 }}>
                          <span>層級</span>
                          <select value={u.level} onChange={e => patchUserField(u.uid,"level",e.target.value)} style={selStyle}>
                            <option value="leader">leader</option>
                            <option value="second">second</option>
                            <option value="member">member</option>
                          </select>
                        </label>
                        <label style={{ fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                          <span>輪班</span>
                          <select value={u.attr} onChange={e => patchUserField(u.uid,"attr",e.target.value)} style={selStyle}>
                            <option value="固定D">固定D</option>
                            <option value="固定E">固定E</option>
                            <option value="固定N">固定N</option>
                            <option value="輪班DE">輪班DE</option>
                            <option value="輪班EN">輪班EN</option>
                            <option value="輪班DN">輪班DN</option>
                            <option value="輪班DEN">輪班DEN</option>
                          </select>
                          {(() => {
                            if (!isRotationAttr(u.attr)) return null;
                            const ov = ratioOverrides.find(o => o.nurse_uid === u.uid);
                            const ratio = ov ? ov.ratio : (() => {
                              if (u.attr==="輪班DE") return { D:ratioForm.de_d, E:ratioForm.de_e };
                              if (u.attr==="輪班EN") return { E:ratioForm.en_e, N:ratioForm.en_n };
                              if (u.attr==="輪班DN") return { D:ratioForm.dn_d, N:ratioForm.dn_n };
                              if (u.attr==="輪班DEN") return { D:ratioForm.den_d, E:ratioForm.den_e, N:ratioForm.den_n };
                              return null;
                            })();
                            if (!ratio) return null;
                            const lbl = Object.entries(ratio).map(([k,v])=>`${k}:${v}`).join(" / ");
                            return (
                              <span style={{
                                fontSize:11, color: ov ? "#1d4ed8" : "#6b7280",
                                background: ov ? "#eff6ff" : "#f3f4f6",
                                border: `1px solid ${ov ? "#bfdbfe" : "#e5e7eb"}`,
                                borderRadius:5, padding:"1px 6px", whiteSpace:"nowrap",
                              }} title={ov ? "個別覆蓋比例" : "全域預設比例"}>
                                比例 {lbl}{ov ? "" : "（全域）"}
                              </span>
                            );
                          })()}
                        </label>
                        <label style={{ fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
                          <input type="checkbox" checked={u.halftime} onChange={e => patchUserField(u.uid,"halftime",e.target.checked)} style={{ width:14, height:14 }} />
                          <span>半職</span>
                        </label>
                      </div>
                      {/* 行 3：備註（整行） */}
                      <input
                        defaultValue={u.note}
                        placeholder="備註（選填）"
                        onBlur={e => { if (e.target.value !== u.note) patchUserField(u.uid,"note",e.target.value); }}
                        onKeyDown={e => { if (e.key==="Enter") (e.target as HTMLInputElement).blur(); }}
                        style={{ width:"100%", boxSizing:"border-box", fontSize:12, border:"1px solid #e5e7eb", borderRadius:6, padding:"5px 10px", background:"#f9fafb", fontFamily:"inherit" }} />
                    </div>
                  );
                })}
                {!visibleUsers.length && (
                  <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>尚無帳號</div>
                )}
              </div>
            </div>

            {/* 新增帳號 */}
            <div className="card">
              <div className="card-head"><div style={{ fontSize:15, fontWeight:700 }}>新增帳號</div></div>
              <div className="card-body">
                <div className="fl">
                  <div className="frow">
                    <div>
                      <label className="flabel">姓名</label>
                      <input className="finput" placeholder="護理師姓名" value={newUser.name} onChange={e => setNewUser(p=>({...p,name:e.target.value}))} />
                    </div>
                    <div>
                      <label className="flabel">帳號代號 (UID)</label>
                      <input className="finput" placeholder="如 N001（大小寫有別）" value={newUser.uid} onChange={e => setNewUser(p=>({...p,uid:e.target.value}))} />
                    </div>
                  </div>
                  <div className="frow">
                    <div>
                      <label className="flabel">初始密碼</label>
                      <div style={{ position:"relative" }}>
                        <input className="finput" type={showNewPwd ? "text" : "password"} placeholder="至少 4 個字元（大小寫有別）"
                          value={newUser.password} onChange={e => setNewUser(p=>({...p,password:e.target.value}))}
                          style={{ paddingRight:38 }} />
                        <button type="button" onClick={() => setShowNewPwd(p => !p)}
                          style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, padding:0, lineHeight:1 }}>
                          {showNewPwd ? "🙈" : "👁"}
                        </button>
                      </div>
                      {newUser.password.length > 0 && newUser.password.length < 4 && (
                        <div style={{ fontSize:11, color:"#dc2626", marginTop:3 }}>密碼至少 4 個字元</div>
                      )}
                    </div>
                    <div>
                      <label className="flabel">輪班屬性</label>
                      <select className="finput" value={newUser.attr} onChange={e => setNewUser(p=>({...p,attr:e.target.value}))}>
                        <option value="固定D">固定D（幾乎只排白班）</option>
                        <option value="固定E">固定E（幾乎只排小夜）</option>
                        <option value="固定N">固定N（幾乎只排大夜）</option>
                        <option value="輪班DE">輪班DE（白班＋小夜）</option>
                        <option value="輪班EN">輪班EN（小夜＋大夜）</option>
                        <option value="輪班DN">輪班DN（白班＋大夜）</option>
                        <option value="輪班DEN">輪班DEN（三班皆可）</option>
                      </select>
                    </div>
                  </div>
                  <div className="frow3">
                    <div>
                      <label className="flabel">角色</label>
                      <select className="finput" value={newUser.role} onChange={e => setNewUser(p=>({...p,role:e.target.value}))}>
                        <option value="nurse">護理師</option>
                        <option value="dual">管理員兼護理師</option>
                        <option value="admin">管理員</option>
                        {isSuperAdmin && <option value="superadmin">超級管理員</option>}
                      </select>
                    </div>
                    <div>
                      <label className="flabel">層級</label>
                      <select className="finput" value={newUser.level} onChange={e => setNewUser(p=>({...p,level:e.target.value}))}>
                        <option value="leader">leader</option>
                        <option value="second">second</option>
                        <option value="member">member</option>
                      </select>
                    </div>
                    <div style={{ display:"flex", alignItems:"flex-end", paddingBottom:2 }}>
                      <label className="fcheck">
                        <input type="checkbox" checked={newUser.halftime} onChange={e => setNewUser(p=>({...p,halftime:e.target.checked}))} />
                        <span style={{ fontSize:13 }}>半職人員</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="flabel">備註（選填）</label>
                    <textarea className="finput" placeholder="其他說明" value={newUser.note} onChange={e => setNewUser(p=>({...p,note:e.target.value}))} rows={2} style={{ resize:"vertical", minHeight:52 }} />
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf:"flex-start" }} onClick={createUser}
                    disabled={creating || !newUser.uid || !newUser.password || !newUser.name || newUser.password.length < 4}>
                    {creating ? "建立中…" : "建立帳號"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ══════════════════════════════════
            Tab: 排班週期
        ══════════════════════════════════ */}
        {tab === "cycle" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:720 }}>
            <div className="card">
              <div className="card-head"><div style={{ fontSize:16, fontWeight:700 }}>排班週期設定</div></div>
              <div className="card-body">
                <div className="fl">

                  {/* ── 預班日期區間（三方連動） */}
                  <div className="setting-section">
                    <div className="setting-title">📅 預班日期區間</div>
                    <div className="frow3">
                      {/* 班表開始日 */}
                      <div>
                        <label className="flabel">班表開始日</label>
                        <input className="finput" type="date" value={cycle.start_date}
                          onChange={e => handleStartDate(e.target.value)} />
                        {cycle.start_date && (
                          <div style={{ fontSize:12, color:"#1d4ed8", marginTop:5, fontWeight:500 }}>
                            {fmtDateDay(cycle.start_date)}
                          </div>
                        )}
                      </div>

                      {/* 班表結束日 */}
                      <div>
                        <label className="flabel">班表結束日</label>
                        <input className="finput" type="date" value={cycle.end_date}
                          onChange={e => handleEndDate(e.target.value)} />
                        {cycle.end_date && (
                          <div style={{ fontSize:12, color:"#1d4ed8", marginTop:5, fontWeight:500 }}>
                            {fmtDateDay(cycle.end_date)}
                          </div>
                        )}
                      </div>

                      {/* 週期長度 */}
                      <div>
                        <label className="flabel">週期長度（天）</label>
                        <input className="finput" type="number" min={1} max={365}
                          value={cycle.period_days}
                          onChange={e => handlePeriodDays(parseInt(e.target.value) || 1)} />
                        {cycle.period_days > 0 && (
                          <div style={{ fontSize:12, color:"#6b7280", marginTop:5 }}>
                            約 {(cycle.period_days / 7).toFixed(1)} 週
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 三方連動說明 */}
                    <div style={{ marginTop:10, fontSize:12, color:"#9ca3af", background:"#f8fafc", padding:"8px 12px", borderRadius:7 }}>
                      ✦ 三方連動：任意填入兩個欄位，第三個自動計算
                    </div>

                    {/* 預覽結果 */}
                    {cycle.start_date && cycle.end_date && (
                      <div style={{ marginTop:12, padding:"12px 16px", background:"#eff6ff", borderRadius:10, border:"1px solid #bfdbfe" }}>
                        <div style={{ fontSize:13, color:"#1d4ed8", fontWeight:700, marginBottom:4 }}>本次排班週期</div>
                        <div style={{ fontSize:14, color:"#1e40af", fontWeight:600 }}>
                          {fmtDateDay(cycle.start_date)} ～ {fmtDateDay(cycle.end_date)}
                        </div>
                        <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>共 {cycle.period_days} 天</div>
                      </div>
                    )}
                  </div>

                  {/* ── 填表截止日 */}
                  <div className="setting-section">
                    <div className="setting-title">⏰ 填表截止日</div>
                    <div style={{ maxWidth:300 }}>
                      <label className="flabel">護理師填表截止日期</label>
                      <input className="finput" type="date" value={cycle.deadline_date}
                        onChange={e => setCycle(p=>({...p,deadline_date:e.target.value}))} />
                      {cycle.deadline_date && (
                        <div style={{ fontSize:12, color:"#1d4ed8", marginTop:5, fontWeight:500 }}>
                          {fmtDateDay(cycle.deadline_date)}
                        </div>
                      )}
                    </div>
                    {cycle.deadline_date && (
                      <div style={{ marginTop:8, fontSize:12, color:"#6b7280" }}>
                        護理師需在 <b style={{ color:"#dc2626" }}>{fmtDateDay(cycle.deadline_date)}</b> 前完成填寫並確認送出
                      </div>
                    )}
                  </div>

                  {/* ── 國定假日天數 */}
                  <div className="setting-section">
                    <div className="setting-title">🗓 國定假日天數</div>
                    <div style={{ maxWidth:280 }}>
                      <label className="flabel">本週期國定假日天數（0 ～ 5 天）</label>
                      <input className="finput" type="number" min={0} max={5} value={cycle.holiday_days}
                        onChange={e => setCycle(p=>({...p,holiday_days:Math.min(5,Math.max(0,+e.target.value))}))} />
                    </div>
                    <div style={{ marginTop:12, display:"flex", gap:14, flexWrap:"wrap" }}>
                      <div style={{ padding:"12px 16px", background:"#dcfce7", borderRadius:10, border:"1px solid #bbf7d0", minWidth:175 }}>
                        <div style={{ fontSize:12, color:"#15803d", fontWeight:600, marginBottom:4 }}>全職應休天數</div>
                        <div style={{ fontSize:28, fontWeight:800, color:"#15803d" }}>{fullTimeOff} 天</div>
                        <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>= 8 + {cycle.holiday_days} 國定假日</div>
                      </div>
                      <div style={{ padding:"12px 16px", background:"#fef3c7", borderRadius:10, border:"1px solid #fde68a", minWidth:175 }}>
                        <div style={{ fontSize:12, color:"#92400e", fontWeight:600, marginBottom:4 }}>半職應休天數</div>
                        <div style={{ fontSize:28, fontWeight:800, color:"#92400e" }}>{partTimeOff} 天</div>
                        <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>= 16 + {cycle.holiday_days} 國定假日（獨立計算）</div>
                      </div>
                    </div>
                    <div style={{ marginTop:10, fontSize:12, color:"#9ca3af", lineHeight:1.7 }}>
                      • 全職：基底 8 天，加國定假日，最多 13 天<br />
                      • 半職：基底 16 天，加國定假日，最多 21 天，不依全職公式連動
                    </div>
                  </div>

                  <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                    <button className="btn btn-primary" onClick={saveCycle}>儲存週期設定</button>
                    <span style={{ fontSize:12, color:"#9ca3af" }}>設定將儲存至資料庫，下次登入自動帶入</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 參考說明 */}
            <div style={{ padding:"14px 16px", background:"#fafafa", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, color:"#6b7280", lineHeight:1.8 }}>
              <b style={{ color:"#374151" }}>📌 後台班表說明：</b><br />
              • 後台「手動填寫」分頁將額外顯示班表開始日<b>前 7 天</b>（灰色欄），由管理員填寫，護理師不可見。<br />
              • 這 7 天資料僅作為排班規則的參考依據（如連大夜判斷），不納入本次排班輸出。<br />
              • 護理師的預班頁面只顯示本次週期日期範圍（班表開始日 ～ 班表結束日）。
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            Tab: 排班規則
        ══════════════════════════════════ */}
        {tab === "rules" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:740 }}>

            {/* 休假與人數 */}
            <div className="card">
              <div className="card-head"><div style={{ fontSize:16, fontWeight:700 }}>排班規則設定</div></div>
              <div className="card-body">
                <div className="fl">

                  <div className="setting-section">
                    <div className="setting-title">🌴 休假天數上限</div>
                    <div style={{ maxWidth:280 }}>
                      <label className="flabel">每人可申請休假天數上限（天）</label>
                      <input className="finput" type="number" min={0} max={31} value={rulesForm.max_off_days}
                        onChange={e => setRulesForm(p=>({...p,max_off_days:+e.target.value}))} />
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">👥 每班人數設定</div>
                    <div className="frow3">
                      {([["D","daily_d","白班"],["E","daily_e","小夜"],["N","daily_n","大夜"]] as const).map(([c,k,lbl]) => (
                        <div key={k}>
                          <label className="flabel">{c} {lbl}（人）</label>
                          <input className="finput" type="number" min={1} max={20}
                            value={(rulesForm as any)[k]}
                            onChange={e => setRulesForm(p=>({...p,[k]:+e.target.value}))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">📅 特殊日期人數覆蓋</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginBottom:10 }}>可針對特定日期設定不同於預設的各班人數</div>
                    {rulesForm.special_dates.map((sd, i) => (
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
                        <input type="date" value={sd.date}
                          onChange={e => setRulesForm(p=>({...p,special_dates:p.special_dates.map((x,j)=>j===i?{...x,date:e.target.value}:x)}))}
                          style={{ border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 9px", fontFamily:"inherit", fontSize:13 }} />
                        {(["d","e","n"] as const).map(f => (
                          <div key={f} style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ fontSize:12, fontWeight:600 }}>{f.toUpperCase()}:</span>
                            <input type="number" min={0} max={20} value={(sd as any)[f]}
                              onChange={e => setRulesForm(p=>({...p,special_dates:p.special_dates.map((x,j)=>j===i?{...x,[f]:+e.target.value}:x)}))}
                              style={{ width:50, border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 6px", fontFamily:"inherit", fontSize:13 }} />
                          </div>
                        ))}
                        <button onClick={() => setRulesForm(p=>({...p,special_dates:p.special_dates.filter((_,j)=>j!==i)}))}
                          style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:7, padding:"4px 10px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-outline btn-sm" style={{ marginTop:4 }}
                      onClick={() => setRulesForm(p=>({...p,special_dates:[...p.special_dates,{date:"",d:3,e:3,n:3}]}))}>
                      ＋ 新增特殊日期
                    </button>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">📊 連班限制</div>
                    <div style={{ maxWidth:280, marginBottom:14 }}>
                      <label className="flabel">連續上班天數上限（天，跨週累計不歸零）</label>
                      <input className="finput" type="number" min={1} max={14} value={rulesForm.max_consecutive_work}
                        onChange={e => setRulesForm(p=>({...p,max_consecutive_work:+e.target.value}))} />
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.weekly_max_two_shifts}
                          onChange={e => setRulesForm(p=>({...p,weekly_max_two_shifts:e.target.checked}))} />
                        <span style={{ fontSize:13 }}>每週 D/E/N 至多兩種班別（避免同週混排三種班型）</span>
                      </label>
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.lock_first_day}
                          onChange={e => setRulesForm(p=>({...p,lock_first_day:e.target.checked}))} />
                        <span style={{ fontSize:13 }}>第一天鎖定（參考前期最後7天的班別延伸）</span>
                      </label>
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">⚖ 班型規則說明</div>
                    <div style={{ fontSize:13, lineHeight:2, color:"#374151" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                        <label className="fcheck" style={{ marginTop:2 }}>
                          <input type="checkbox" checked={rulesForm.no_reverse_shift}
                            onChange={e => setRulesForm(p=>({...p,no_reverse_shift:e.target.checked}))} />
                        </label>
                        <div>
                          <b>反向班禁止（硬規則）</b><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>禁止 N→D、N→E、E→D 反向排列。大夜後不能排白班或小夜，小夜後不能排白班。</span>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginTop:10 }}>
                        <label className="fcheck" style={{ marginTop:2 }}>
                          <input type="checkbox" checked={rulesForm.prefer_smooth}
                            onChange={e => setRulesForm(p=>({...p,prefer_smooth:e.target.checked}))} />
                        </label>
                        <div>
                          <b>盡量順班（軟規則）</b><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>以最少換班次數排班：同種班別排成連續區塊（含穿插休假），排完再換下一種班。輪班 DE 例：先把 D 全排完，再排 E，而非 DDEEDDEE 交替。</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">📝 備註說明</div>
                    <textarea className="finput" rows={2} style={{ resize:"vertical" }}
                      value={rulesForm.notes} onChange={e => setRulesForm(p=>({...p,notes:e.target.value}))}
                      placeholder="其他排班注意事項或補充說明" />
                  </div>

                  <button className="btn btn-primary" style={{ alignSelf:"flex-start" }} onClick={saveSchedulingRules}>
                    儲存排班規則
                  </button>
                </div>
              </div>
            </div>

            {/* 輪班比例設定 */}
            <div className="card">
              <div className="card-head"><div style={{ fontSize:15, fontWeight:700 }}>輪班比例設定</div></div>
              <div className="card-body">
                <div className="fl">
                  <div style={{ fontSize:12, color:"#9ca3af", marginBottom:4 }}>設定各輪班屬性中每種班別的比例，預設為均等分配</div>
                  <div className="frow">
                    {([
                      {key:"DE", d:"de_d", e:"de_e", label:"輪班DE", desc:"D：E"},
                      {key:"EN", d:"en_e", e:"en_n", label:"輪班EN", desc:"E：N"},
                      {key:"DN", d:"dn_d", e:"dn_n", label:"輪班DN", desc:"D：N"},
                    ] as const).map(cfg => (
                      <div key={cfg.key}>
                        <label className="flabel">{cfg.label}（{cfg.desc}）</label>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <input type="number" min={1} max={99} value={(ratioForm as any)[cfg.d]}
                            onChange={e => setRatioForm(p=>({...p,[cfg.d]:+e.target.value}))}
                            style={{ width:54, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px", fontFamily:"inherit", fontSize:13 }} />
                          <span style={{ color:"#9ca3af" }}>：</span>
                          <input type="number" min={1} max={99} value={(ratioForm as any)[cfg.e]}
                            onChange={e => setRatioForm(p=>({...p,[cfg.e]:+e.target.value}))}
                            style={{ width:54, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px", fontFamily:"inherit", fontSize:13 }} />
                        </div>
                      </div>
                    ))}
                    <div>
                      <label className="flabel">輪班DEN（D：E：N）</label>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {(["den_d","den_e","den_n"] as const).map((k,i) => (<>
                          {i > 0 && <span key={`sep${i}`} style={{ color:"#9ca3af" }}>：</span>}
                          <input key={k} type="number" min={1} max={99} value={ratioForm[k]}
                            onChange={e => setRatioForm(p=>({...p,[k]:+e.target.value}))}
                            style={{ width:54, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px", fontFamily:"inherit", fontSize:13 }} />
                        </>))}
                      </div>
                    </div>
                  </div>

                  {/* 個別護理師比例覆蓋 */}
                  <div style={{ borderTop:"1px solid #f3f4f6", paddingTop:16, marginTop:4 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#374151" }}>個別護理師比例覆蓋</div>
                        <div style={{ fontSize:11, color:"#9ca3af" }}>列表中的護理師優先使用個人比例，其他人套用全域預設</div>
                      </div>
                      <button className="btn btn-outline" style={{ fontSize:12, padding:"4px 12px" }}
                        onClick={() => {
                          // 找第一個還沒在清單中的輪班護理師
                          const taken = new Set(ratioOverrides.map(o => o.nurse_uid));
                          const first = nurseUsers.find(u => isRotationAttr(u.attr) && !taken.has(u.uid));
                          if (!first) return;
                          setRatioOverrides(prev => [...prev, { nurse_uid: first.uid, ratio: defaultRatioForAttr(first.attr) }]);
                        }}
                        disabled={nurseUsers.filter(u => isRotationAttr(u.attr) && !ratioOverrides.some(o => o.nurse_uid === u.uid)).length === 0}
                      >+ 新增覆蓋</button>
                    </div>

                    {ratioOverrides.length === 0 && (
                      <div style={{ fontSize:12, color:"#d1d5db", textAlign:"center", padding:"12px 0" }}>尚無個別設定</div>
                    )}

                    {ratioOverrides.map((ov, idx) => {
                      const nurse = users.find(u => u.uid === ov.nurse_uid);
                      const nurseAttr = nurse?.attr ?? "";
                      const availableKeys = attrShifts(nurseAttr);
                      // 已在清單中的（不含自己）
                      const takenUids = new Set(ratioOverrides.filter((_, i) => i !== idx).map(o => o.nurse_uid));
                      const candidateNurses = nurseUsers.filter(u => isRotationAttr(u.attr) && !takenUids.has(u.uid));
                      const inputStyle = { width:50, border:"1px solid #e5e7eb", borderRadius:7, padding:"4px 8px", fontFamily:"inherit", fontSize:13 };
                      return (
                        <div key={idx} style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
                          <select value={ov.nurse_uid}
                            onChange={e => {
                              const newUid = e.target.value;
                              const newNurse = users.find(u => u.uid === newUid);
                              const newAttr = newNurse?.attr ?? "";
                              setRatioOverrides(prev => prev.map((o, i) => i === idx
                                ? { nurse_uid: newUid, ratio: defaultRatioForAttr(newAttr) }
                                : o));
                            }}
                            style={{ border:"1px solid #e5e7eb", borderRadius:7, padding:"4px 8px", fontSize:13, fontFamily:"inherit" }}>
                            {candidateNurses.map(u => (
                              <option key={u.uid} value={u.uid}>{u.name}（{u.attr}）</option>
                            ))}
                          </select>
                          <span style={{ fontSize:12, color:"#9ca3af" }}>{nurseAttr || "—"}</span>
                          {availableKeys.length > 0 ? (
                            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                              {availableKeys.map((k, ki) => (
                                <span key={k} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                  {ki > 0 && <span style={{ color:"#9ca3af" }}>：</span>}
                                  <span style={{ fontSize:12, fontWeight:600 }}>{k}</span>
                                  <input type="number" min={1} max={99}
                                    value={ov.ratio[k] ?? 1}
                                    onChange={e => setRatioOverrides(prev => prev.map((o, i) => i === idx
                                      ? { ...o, ratio: { ...o.ratio, [k]: Math.max(1, +e.target.value || 1) } }
                                      : o))}
                                    style={inputStyle} />
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize:12, color:"#ef4444" }}>屬性已非輪班，比例無效</span>
                          )}
                          <button onClick={() => setRatioOverrides(prev => prev.filter((_, i) => i !== idx))}
                            style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:16, lineHeight:1, padding:"2px 4px" }}
                            title="移除此覆蓋">✕</button>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display:"flex", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
                    <button className="btn btn-outline" onClick={calcRatioDays}
                      disabled={!cycleIsSet}>
                      試算比例天數
                    </button>
                    {!cycleIsSet && <span style={{ fontSize:12, color:"#9ca3af", alignSelf:"center" }}>需先設定排班週期才可試算</span>}
                  </div>

                  {ratioCalc && (
                    <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1d4ed8", marginBottom:8 }}>
                        試算結果（週期 {cycle.period_days} 天，全職休 {fullTimeOff} 天，半職休 {partTimeOff} 天）
                      </div>
                      {ratioCalc.map((r, i) => (
                        <div key={i} style={{ fontSize:13, color: r.isOverride ? "#1d4ed8" : "#374151", marginBottom:4 }}>
                          <b>{r.label}：</b>{r.days}
                          {r.isOverride && <span style={{ fontSize:11, color:"#2563eb", marginLeft:6 }}>▲ 個別覆蓋</span>}
                        </div>
                      ))}
                      <div style={{ fontSize:11, color:"#6b7280", marginTop:6 }}>※ 彈性 ±1～3 天視實際排班調整</div>
                    </div>
                  )}

                  <button className="btn btn-primary" style={{ alignSelf:"flex-start" }} onClick={saveSchedulingRules}>
                    儲存輪班比例
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            Tab: 班別設定
        ══════════════════════════════════ */}
        {tab === "shifts_cfg" && (() => {
          const shiftRow = (s: ShiftDef, i: number, type: "work"|"off") => (
            <div
              key={i}
              ref={el => { (type==="work" ? shiftWorkRefs : shiftOffRefs).current[i] = el; }}
              className={`shift-edit-row drag-item${shiftDragging?.type===type&&shiftDragging.idx===i?" is-dragging":""}${shiftDragOver?.type===type&&shiftDragOver.idx===i&&shiftDragging?.idx!==i?" is-drag-over":""}`}
              style={{ borderBottom:"1px solid #f3f4f6", paddingBottom:8, marginBottom:8 }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", width:"100%" }}>
                <span className="drag-handle" onTouchStart={e => handleShiftDragHandleTouchStart(e, type, i)}>☰</span>
                {/* 代碼 */}
                <div style={{ flex:"0 0 80px" }}>
                  <div style={{ fontSize:11, color:"#6b7280", marginBottom:2 }}>代碼</div>
                  <input className="finput finput-sm" value={s.code}
                    onChange={e => updateShiftDef(type, i, "code", e.target.value)}
                    placeholder="D" style={{ width:"100%" }} />
                </div>
                {/* 說明 */}
                <div style={{ flex:"0 0 100px" }}>
                  <div style={{ fontSize:11, color:"#6b7280", marginBottom:2 }}>說明</div>
                  <input className="finput finput-sm" value={s.label}
                    onChange={e => updateShiftDef(type, i, "label", e.target.value)}
                    placeholder="白班" style={{ width:"100%" }} />
                </div>
                {/* 預覽 */}
                <div style={{ minWidth:36, textAlign:"center" }}>
                  <div style={{ fontSize:11, color:"#6b7280", marginBottom:2 }}>預覽</div>
                  <span style={{ fontSize:14, fontWeight:700, color: type==="off" ? "#dc2626" : "#111827" }}>{s.code || "?"}</span>
                </div>
                {/* 僅管理員 */}
                <div>
                  <div style={{ fontSize:11, color:"#6b7280", marginBottom:5 }}>僅管理員</div>
                  <label className="fcheck" style={{ margin:0 }}>
                    <input type="checkbox" checked={!!s.admin_only}
                      onChange={e => updateShiftDef(type, i, "admin_only", e.target.checked)} />
                    <span style={{ fontSize:12 }}>管理員才能填入</span>
                  </label>
                </div>
                {/* 操作 */}
                <div style={{ marginLeft:"auto" }}>
                  <button className="btn btn-sm" style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca" }}
                    onClick={() => removeShift(type, i)}>刪除</button>
                </div>
              </div>
              {s.admin_only && (
                <div style={{ fontSize:11, color:"#9ca3af", marginTop:4, paddingLeft:4 }}>🔒 此班別護理師不可自行填入</div>
              )}
            </div>
          );
          return (
          <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:680 }}>
            {/* 說明 */}
            <div style={{ padding:"12px 16px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, fontSize:13, color:"#92400e", lineHeight:1.8 }}>
              <b>班別設定說明：</b><br />
              • 黑色字 = 上班班別（計入上班天數）　紅色字 = 放假/調整班別<br />
              • 勾選「僅管理員」後，護理師填寫頁面不會顯示該班別<br />
              • 儲存後立即套用，建議先設定好再開放護理師填表
            </div>

            {/* 上班類 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div style={{ fontSize:15, fontWeight:700 }}>上班類班別</div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>顯示為黑色字</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => addShift("work")}>＋ 新增班別</button>
              </div>
              <div className="card-body">
                {editWorkShifts.map((s, i) => shiftRow(s, i, "work"))}
                {!editWorkShifts.length && <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:16 }}>尚未設定上班類班別</div>}
              </div>
            </div>

            {/* 放假類 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div style={{ fontSize:15, fontWeight:700 }}>放假 / 調整類班別</div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>顯示為紅色字</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => addShift("off")}>＋ 新增班別</button>
              </div>
              <div className="card-body">
                {editOffShifts.map((s, i) => shiftRow(s, i, "off"))}
                {!editOffShifts.length && <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:16 }}>尚未設定放假類班別</div>}
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <button className="btn btn-primary" onClick={saveShiftConfig}>儲存班別設定</button>
              <span style={{ fontSize:12, color:"#9ca3af" }}>儲存後立即套用至班表填寫</span>
            </div>
          </div>
          );
        })()}

        {/* ══════════════════════════════════
            Tab: 一鍵生成
        ══════════════════════════════════ */}
        {tab === "generate" && (() => {
          const [generating, setGenerating] = useState(false);
          const [genResult, setGenResult] = useState<string>("");
          const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
          const [confirmGenerate, setConfirmGenerate] = useState(false);

          async function runGenerate() {
            setGenerating(true); setGenResult(""); setConfirmGenerate(false);
            try {
              const { data } = await api.post(
                `/schedule/generate?overwrite_confirmed=${overwriteConfirmed}`
              );
              setGenResult(data.message ?? "完成");
              fetchSchedule();
            } catch (err: any) {
              setGenResult("✗ " + (err.response?.data?.detail ?? err.message ?? "生成失敗"));
            } finally { setGenerating(false); }
          }

          return (
          <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:620 }}>
            {/* 說明卡 */}
            <div className="card">
              <div className="card-head"><div style={{ fontSize:16, fontWeight:700 }}>一鍵生成排班</div></div>
              <div className="card-body">
                <div className="fl">

                  {/* 順班規則說明 */}
                  <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"14px 16px", fontSize:13, color:"#1e40af", lineHeight:1.8 }}>
                    <b>順班規則（軟性）</b><br />
                    以最少換班次數為邏輯，同種班別連續排完再換下一種：<br />
                    <span style={{ color:"#374151" }}>
                      • <b>輪班類（DE／EN／DN／DEN）：</b>先把第一種班全部排完（含穿插休假），再接排下一種。<br />
                      &emsp;例如 DE 比例 1:2：
                      <code style={{ background:"#dbeafe", padding:"1px 5px", borderRadius:4, fontSize:12 }}>
                        DDD-OFF-DD│DD-E-OFF-EE│EEE-OFF-EEO
                      </code><br />
                      • <b>固定D／E／N：</b>整週期幾乎全排同一種班，僅在人力缺口時才少數換班，且仍遵守反向班規則。
                    </span>
                  </div>

                  {/* 將套用的規則 */}
                  <div className="setting-section">
                    <div className="setting-title">📋 將套用的規則</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:13, color:"#374151" }}>
                      {!cycleIsSet && (
                        <div style={{ color:"#dc2626", fontWeight:600 }}>⚠ 尚未設定排班週期，請先至「排班週期」tab 設定</div>
                      )}
                      {cycleIsSet && (
                        <div>排班週期：<b>{cycle.start_date}</b> ～ <b>{cycle.end_date}</b>（共 {cycle.period_days} 天）</div>
                      )}
                      <div>連續上班上限：<b>{rulesForm.max_consecutive_work}</b> 天</div>
                      <div>每日最低人數：D <b>{rulesForm.daily_d}</b>、E <b>{rulesForm.daily_e}</b>、N <b>{rulesForm.daily_n}</b> 人</div>
                      <div>反向班禁止：<b>{rulesForm.no_reverse_shift ? "✓ 啟用（硬規則）" : "停用"}</b></div>
                      <div>全職應休：<b>{fullTimeOff}</b> 天｜半職應休：<b>{partTimeOff}</b> 天</div>
                    </div>
                  </div>

                  {/* 選項 */}
                  <div className="setting-section">
                    <div className="setting-title">⚙ 選項</div>
                    <label className="fcheck">
                      <input type="checkbox" checked={overwriteConfirmed}
                        onChange={e => setOverwriteConfirmed(e.target.checked)} />
                      <span style={{ fontSize:13 }}>覆蓋已確認送出的班別（預設不覆蓋）</span>
                    </label>
                    <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>
                      勾選後，已確認班也會被新生成的排班覆蓋；未勾選則只填入空白格子。
                    </div>
                  </div>

                  {/* 生成按鈕 */}
                  {confirmGenerate ? (
                    <div style={{ background:"#fef9c3", border:"1px solid #fde68a", borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:8 }}>
                        確定要生成班表嗎？{overwriteConfirmed ? "（將覆蓋已確認班別）" : "（只填入空白格子）"}
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button className="btn btn-gray btn-sm" onClick={() => setConfirmGenerate(false)}>取消</button>
                        <button className="btn btn-primary btn-sm" onClick={runGenerate} disabled={generating}>
                          {generating ? "生成中…" : "確認生成"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ alignSelf:"flex-start" }}
                      disabled={!cycleIsSet || generating}
                      onClick={() => setConfirmGenerate(true)}>
                      🤖 一鍵生成排班
                    </button>
                  )}

                  {genResult && (
                    <div style={{
                      padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600,
                      background: genResult.startsWith("✗") ? "#fef2f2" : "#dcfce7",
                      color:      genResult.startsWith("✗") ? "#dc2626" : "#15803d",
                      border:     `1px solid ${genResult.startsWith("✗") ? "#fecaca" : "#bbf7d0"}`,
                    }}>{genResult}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ══════════════════════════════════
            Tab: 操作紀錄
        ══════════════════════════════════ */}
        {tab === "logs" && (
          <div className="card">
            <div className="card-head">
              <div style={{ fontSize:16, fontWeight:700 }}>操作紀錄</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button className="btn btn-gray btn-sm" onClick={fetchLogs}>重新整理</button>
                <select
                  defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return;
                    const hours = parseInt(e.target.value);
                    const labels: Record<string,string> = { "24":"一天之外","72":"三天之外","168":"一週之外","720":"一個月之外" };
                    setClearLogsConfirm({ hours, label: labels[e.target.value] ?? e.target.value });
                    e.target.value = "";
                  }}
                  style={{ fontSize:12, border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 8px", background:"#f9fafb", fontFamily:"inherit", cursor:"pointer" }}>
                  <option value="">清除紀錄…</option>
                  <option value="24">一天之外</option>
                  <option value="72">三天之外</option>
                  <option value="168">一週之外</option>
                  <option value="720">一個月之外</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX:"hidden", overflowY:"auto", maxHeight:"65vh" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
                <colgroup>
                  <col style={{ width:"13%" }} />
                  <col style={{ width:"14%" }} />
                  <col style={{ width:"8%" }} />
                  <col style={{ width:"14%" }} />
                  <col style={{ width:"14%" }} />
                  <col style={{ width:"13%" }} />
                  <col style={{ width:"10%" }} />
                </colgroup>
                <thead>
                  <tr style={{ position:"sticky", top:0, zIndex:10, background:"#f8fafc" }}>
                    {["時間","操作者","角色","動作","護理師","日期","班別"].map(h => (
                      <th key={h} style={{ padding:"8px 6px", fontSize:12, fontWeight:700, color:"#6b7280", textAlign:"left", borderBottom:"2px solid #e5e7eb", background:"#f8fafc" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const operatorName = users.find(u => u.uid === log.operator_uid)?.name ?? log.operator_uid;
                    const nurseName    = users.find(u => u.uid === log.nurse_uid)?.name ?? log.nurse_uid;
                    const roleShort: Record<string,string> = { nurse:"護", dual:"兼", admin:"管", superadmin:"超" };
                    const logDate = log.date ? dayjs(log.date).format("MM/DD") : "";
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                        <td style={{ padding:"7px 6px", fontSize:12, color:"#9ca3af", wordBreak:"break-word" }}>
                          {dayjs(log.created_at).format("MM/DD")}<br />{dayjs(log.created_at).format("HH:mm")}
                        </td>
                        <td style={{ padding:"7px 6px", fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{operatorName}</td>
                        <td style={{ padding:"7px 6px" }}>
                          <span className={`badge badge-${log.operator_role==="nurse"?"nurse":log.operator_role==="dual"?"dual":log.operator_role==="admin"?"admin":"super"}`}>
                            {roleShort[log.operator_role] ?? log.operator_role}
                          </span>
                        </td>
                        <td style={{ padding:"7px 6px", fontSize:12 }}>
                          {log.action==="confirm" ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ 確認</span>
                            : log.action==="unconfirm" ? <span style={{ color:"#f59e0b", fontWeight:700 }}>↩ 取消確認</span>
                            : <span style={{ color:"#6b7280" }}>編輯</span>}
                        </td>
                        <td style={{ padding:"7px 6px", fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nurseName}</td>
                        <td style={{ padding:"7px 6px", fontSize:12, color:"#374151" }}>{logDate}</td>
                        <td style={{ padding:"7px 6px" }}>
                          {log.shift
                            ? <span style={{ fontWeight:700, color: isOff(log.shift, offShifts)?"#dc2626":"#111827" }}>{log.shift}</span>
                            : <span style={{ color:"#d1d5db" }}>─</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!logs.length && (
                    <tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>尚無操作紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ── 班別選擇 Modal */}
      {popup && (
        <ShiftModal
          date={popup.date}
          nurseName={popup.nurseName}
          current={schedule.find(r=>r.nurse_uid===popup.nurseUid&&r.date===popup.date)?.shift ?? ""}
          workShifts={workShifts}
          offShifts={offShifts}
          onSelect={async (shift) => {
            // 先讀取再關閉，避免 popup 被清空後取不到值
            const nurseUid = popup!.nurseUid;
            const date     = popup!.date;
            console.log("[onSelect] shift=", shift, "nurseUid=", nurseUid, "date=", date);
            setPopup(null);
            await updateShift(nurseUid, date, shift);
          }}
          onClose={() => setPopup(null)}
        />
      )}

      {/* ── 編輯帳號 Modal */}
      {editUser && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:"22px 20px", width:"100%", maxWidth:480, boxShadow:"0 20px 60px rgba(0,0,0,.25)", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
              <div style={{ fontSize:15, fontWeight:700 }}>編輯帳號 — {editUser.name}</div>
              <button onClick={() => setEditUser(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:22, lineHeight:1, padding:2 }}>×</button>
            </div>
            <div className="fl">
              <div className="frow">
                <div>
                  <label className="flabel">姓名</label>
                  <input className="finput" value={editForm.name ?? ""} onChange={e => setEditForm(p=>({...p,name:e.target.value}))} />
                </div>
                <div>
                  <label className="flabel">輪班屬性</label>
                  <select className="finput" value={editForm.attr ?? "輪班DEN"} onChange={e => setEditForm(p=>({...p,attr:e.target.value}))}>
                    <option value="固定D">固定D（幾乎只排白班）</option>
                    <option value="固定E">固定E（幾乎只排小夜）</option>
                    <option value="固定N">固定N（幾乎只排大夜）</option>
                    <option value="輪班DE">輪班DE（白班＋小夜）</option>
                    <option value="輪班EN">輪班EN（小夜＋大夜）</option>
                    <option value="輪班DN">輪班DN（白班＋大夜）</option>
                    <option value="輪班DEN">輪班DEN（三班皆可）</option>
                  </select>
                </div>
              </div>
              <div className="frow">
                <div>
                  <label className="flabel">層級</label>
                  <select className="finput" value={editForm.level ?? ""} onChange={e => setEditForm(p=>({...p,level:e.target.value}))}>
                    <option value="leader">leader</option>
                    <option value="second">second</option>
                    <option value="member">member</option>
                  </select>
                </div>
                {editUser && editUser.role !== "superadmin" && (
                  <div>
                    <label className="flabel">角色</label>
                    <select className="finput" value={editForm.role ?? ""} onChange={e => setEditForm(p=>({...p,role:e.target.value}))}>
                      <option value="nurse">護理師</option>
                      <option value="dual">管理員兼護理師</option>
                      <option value="admin">管理員</option>
                      {isSuperAdmin && <option value="superadmin">超級管理員</option>}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="flabel">備註（雙向可見）</label>
                <textarea className="finput" value={editForm.note ?? ""} onChange={e => setEditForm(p=>({...p,note:e.target.value}))} placeholder="選填，護理師也可在個人設定查看及填寫" rows={3} style={{ resize:"vertical", minHeight:64 }} />
              </div>
              <label className="fcheck">
                <input type="checkbox" checked={editForm.halftime ?? false} onChange={e => setEditForm(p=>({...p,halftime:e.target.checked}))} />
                <span style={{ fontSize:13 }}>半職人員（以半職公式計算應休天數）</span>
              </label>
              <div style={{ borderTop:"1px solid #f3f4f6", paddingTop:14 }}>
                <label className="flabel">重設密碼（留空則不變更）</label>
                <div style={{ position:"relative" }}>
                  <input className="finput" type={editForm.showEditPwd ? "text" : "password"}
                    placeholder="輸入新密碼（至少 4 個字元，大小寫有別）"
                    value={editForm.new_password ?? ""}
                    onChange={e => setEditForm(p=>({...p,new_password:e.target.value}))}
                    style={{ paddingRight:38 }} />
                  <button type="button" onClick={() => setEditForm(p=>({...p,showEditPwd:!p.showEditPwd}))}
                    style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, padding:0, lineHeight:1 }}>
                    {editForm.showEditPwd ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button className="btn btn-gray" onClick={() => setEditUser(null)}>取消</button>
                <button className="btn btn-primary" onClick={saveEditUser}>儲存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 刪除帳號確認 Dialog */}
      {deleteTarget && (
        <Dialog
          title={`確定要刪除 ${deleteTarget.name} 的帳號嗎？`}
          body={<>此操作無法復原。帳號 <code>{deleteTarget.uid}</code> 將被移除，班表歷史資料仍會保留。</>}
          actions={[
            { label:"取消", onClick:() => setDeleteTarget(null) },
            { label:"確認刪除", danger:true, onClick:deleteUser },
          ]}
        />
      )}

      {/* ── 刪除班別確認 Dialog */}
      {deleteShiftTarget && (
        <Dialog
          title={`確定要刪除班別「${deleteShiftTarget.code}」嗎？`}
          body="刪除後不可復原，如有護理師已填入此班別，班表資料仍保留但不再顯示於選項中。"
          actions={[
            { label:"取消", onClick:() => setDeleteShiftTarget(null) },
            { label:"確認刪除", danger:true, onClick:confirmRemoveShift },
          ]}
        />
      )}

      {/* ── 清除操作紀錄確認 Dialog */}
      {clearLogsConfirm && (
        <Dialog
          title={`確定要清除「${clearLogsConfirm.label}」的操作紀錄？`}
          body="此操作無法復原，將刪除指定時間點之前的所有操作紀錄。"
          actions={[
            { label:"取消", onClick:() => setClearLogsConfirm(null) },
            { label:"確認清除", danger:true, onClick:() => clearLogs(clearLogsConfirm.hours) },
          ]}
        />
      )}

      {/* ── 輪班屬性變更警告 */}
      {attrChangeWarn && (
        <Dialog
          title="輪班屬性已變更"
          body={<>
            您將此護理師的輪班屬性從「<b>{attrChangeWarn.oldAttr}</b>」改為「<b>{attrChangeWarn.newAttr}</b>」。<br /><br />
            原本針對「{attrChangeWarn.oldAttr}」設定的個別比例覆蓋可能不符合新屬性，<b>請至輪班比例設定頁面重新調整</b>。
          </>}
          actions={[
            { label: "取消", onClick: () => setAttrChangeWarn(null) },
            { label: "仍要變更", primary: true, onClick: confirmAttrChange },
          ]}
        />
      )}

      {/* ── Ctrl / Shift 批次填入 popup */}
      {batchPopup && (
        <SwipeRangePopup
          nurseName={batchPopup.nurseName}
          dates={batchPopup.dates}
          workShifts={workShifts}
          offShifts={offShifts}
          onSelect={async (shift) => {
            const updates = batchPopup.dates.map(d => ({ nurse_uid: batchPopup.nurseUid, date: d, shift }));
            setBatchPopup(null);
            setCtrlSelected(new Set());
            setShiftRange(new Set());
            await batchSave(updates);
          }}
          onClose={() => { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); }}
        />
      )}

      {/* ── 滑動選取 popup */}
      {swipePopup && (
        <SwipeRangePopup
          nurseName={swipePopup.nurseName}
          dates={swipePopup.dates}
          workShifts={workShifts}
          offShifts={offShifts}
          onSelect={async (shift) => {
            const updates = swipePopup.dates.map(d => ({ nurse_uid: swipePopup.nurseUid, date: d, shift }));
            setSwipePopup(null);
            setSwipeDates(new Set());
            await batchSave(updates);
          }}
          onClose={() => { setSwipePopup(null); setSwipeDates(new Set()); }}
        />
      )}

      {/* ── Toast */}
      {toast.msg && (
        <div className={`ap-toast ${toast.ok?"ok":"err"}`}>{toast.msg}</div>
      )}
    </>
  );
}
