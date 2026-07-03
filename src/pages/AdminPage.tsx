import { useState, useEffect, useRef, Fragment } from "react";
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
const DEFAULT_REST: ShiftDef[] = [
  { code: "OFF", label: "休假", type: "rest" },
  { code: "半",  label: "半職", type: "rest" },
];
const DEFAULT_OFF: ShiftDef[] = [
  { code: "V",   label: "特休", type: "off" },
  { code: "喪",  label: "喪假", type: "off" },
  { code: "員",  label: "員旅", type: "off" },
  { code: "延休", label: "延休", type: "off", admin_only: true },
  { code: "補休", label: "補休", type: "off", admin_only: true },
  { code: "調移", label: "調移", type: "off", admin_only: true },
];
const ROLE_ABBR:   Record<string,string> = { nurse:"護", dual:"兼", admin:"管", superadmin:"超" };

// ─── Types
type Tab = "schedule"|"users"|"cycle"|"rules"|"shifts_cfg"|"generate"|"logs";

interface ShiftDef { code: string; label: string; type: "work"|"rest"|"off"; admin_only?: boolean; }
interface User {
  uid: string; name: string; role: string; level: string;
  attr: string; halftime: boolean; note: string; sort_order: number;
}
interface ShiftRow { nurse_uid: string; date: string; shift: string; confirmed?: boolean; updated_by?: string; }

function isOff(code: string, offShifts: ShiftDef[]) { return offShifts.some(s => s.code === code); }
function attrShort(attr: string): string {
  if (!attr) return "";
  if (attr.startsWith("固定")) return attr.slice(2);
  if (attr.startsWith("輪班")) return attr.slice(2);
  const m = attr.match(/([DENden]+)$/);
  if (m) return m[1].toUpperCase();
  return attr;
}

// Number input that allows backspace without jumping to 0
function NumInput({ value, min, max, onChange, className, style }: {
  value: number; min?: number; max?: number;
  onChange: (n: number) => void;
  className?: string; style?: React.CSSProperties;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);
  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*"
      className={className} style={style}
      value={raw}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9]/g, "");
        setRaw(v);
        if (v === "") return;
        const n = parseInt(v, 10);
        if (!isNaN(n)) onChange(Math.min(max ?? 9999, Math.max(min ?? 0, n)));
      }}
      onBlur={() => {
        const n = parseInt(raw, 10);
        const clamped = isNaN(n) ? (min ?? 0) : Math.min(max ?? 9999, Math.max(min ?? 0, n));
        onChange(clamped);
        setRaw(String(clamped));
      }}
    />
  );
}
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
  onSelect: (shift: string | null) => void;
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {offShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btnBase, color: "#dc2626", borderColor: "#fecaca", background: "#fff5f5" }}>{s.code}</button>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
          <button onClick={() => onSelect(null)} style={{
            width: "100%", padding: "6px", background: "none", border: "none",
            color: "#dc2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>✕ 清除選取日期的班別</button>
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
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [ym, setYm] = useState(dayjs().format("YYYY-MM"));

  // 全域資料
  const [users, setUsers] = useState<User[]>([]);
  const [schedule, setSchedule] = useState<ShiftRow[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [, setAllRules] = useState<any>({});

  // 班別設定（從 rules 讀出，預設為 DEFAULT）
  const [workShifts, setWorkShifts] = useState<ShiftDef[]>(DEFAULT_WORK);
  const [restShifts, setRestShifts] = useState<ShiftDef[]>(DEFAULT_REST);
  const [offShifts,  setOffShifts]  = useState<ShiftDef[]>(DEFAULT_OFF);
  const allOffShifts = [...restShifts, ...offShifts];

  // 班表 tab
  const [popup, setPopup] = useState<{ date: string; nurseUid: string; nurseName: string } | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState<{ nurseUid: string; date: string; nurseName: string } | null>(null);

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
  // 拖曳排序
  const userItemRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const shiftWorkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shiftRestRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shiftOffRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const [userDragEnabled,  setUserDragEnabled]  = useState(false);
  const [shiftDragEnabled, setShiftDragEnabled] = useState(false);
  // 帳號卡片本地編輯緩衝（uid → partial User）
  const [userEdits, setUserEdits] = useState<Record<string, Partial<User>>>({});
  const [userDirty, setUserDirty] = useState<Set<string>>(new Set());
  const [userSaving, setUserSaving] = useState<Set<string>>(new Set());

  // 週期設定
  const [cycle, setCycle] = useState({
    start_date: "",      // YYYY-MM-DD
    end_date: "",        // YYYY-MM-DD
    period_days: 28,     // 週期長度（天）
    deadline_date: "",   // 填表截止日 YYYY-MM-DD
    deadline_time: "23:59", // 填表截止時間 HH:MM
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
    // ── 休假規則（新增）
    restrict_first_weekend: true,  // 規則5：首個週末不同時休
    weekly_max_off_auto: 2,        // 規則6：自動休每週上限
    weekly_max_off_total: 3,       // 規則7：含指定休每週上限
    one_in_seven: true,            // 規則8：一例一休（每週≥2天休）
    lock_designated_off: true,     // 規則10：指定休不可覆蓋
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
  const [deleteShiftTarget, setDeleteShiftTarget] = useState<{type:"work"|"rest"|"off"; idx:number; code:string} | null>(null);

  // 班別設定編輯暫存（含 admin_only 旗標）
  const [editWorkShifts, setEditWorkShifts] = useState<ShiftDef[]>(DEFAULT_WORK);
  const [editRestShifts, setEditRestShifts] = useState<ShiftDef[]>(DEFAULT_REST);
  const [editOffShifts,  setEditOffShifts]  = useState<ShiftDef[]>(DEFAULT_OFF);

  // Toast
  const [toast, setToast] = useState({ msg:"", ok:true });
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const year = parseInt(ym.slice(0,4));
  const month = parseInt(ym.slice(5,7));

  // 週期相關計算
  const cycleIsSet = !!(cycle.start_date && cycle.end_date);
  const fullTimeOff = Math.min(8 + cycle.holiday_days, 13);
  const partTimeOff = Math.min(16 + cycle.holiday_days, 21);
  const DOW_ZH = ["週日","週一","週二","週三","週四","週五","週六"];
  const cycleTitleLabel = cycleIsSet
    ? (() => {
        const s = dayjs(cycle.start_date), e = dayjs(cycle.end_date);
        return `${s.year()}年　${s.format("M/DD")}（${DOW_ZH[s.day()]}）－ ${e.format("M/DD")}（${DOW_ZH[e.day()]}）`;
      })()
    : "";

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
      return s && isOff(s, allOffShifts);
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
      if (r.shifts?.rest) { setRestShifts(r.shifts.rest); setEditRestShifts(r.shifts.rest); }
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
      if (shift) f.push({ nurse_uid, date, shift, confirmed: false, updated_by: user.uid });
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

  // ── 批次儲存（Shift/Ctrl/滑動共用，shift=null 表示清除）
  async function batchSave(updates: Array<{ nurse_uid: string; date: string; shift: string | null }>) {
    if (!updates.length) return;
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
        if (u.shift) next.push({ nurse_uid: u.nurse_uid, date: u.date, shift: u.shift, confirmed: false, updated_by: user.uid });
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

  // 通用拖曳（觸控 + 滑鼠）
  function startDragSession(
    startY: number,
    itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>,
    fromIdx: number,
    itemCount: number,
    onDrop: (from: number, to: number) => void,
  ) {
    const elOrNull = itemRefs.current[fromIdx];
    if (!elOrNull) return;
    const el: HTMLDivElement = elOrNull;
    const rect = el.getBoundingClientRect();
    const itemH = rect.height || 60;
    let overIdx = fromIdx;

    // Ghost 跟著手指/滑鼠移動
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.cssText = [
      `position:fixed`, `top:${rect.top}px`, `left:${rect.left}px`,
      `width:${rect.width}px`, `height:${rect.height}px`,
      `z-index:9999`, `pointer-events:none`, `opacity:0.95`,
      `box-shadow:0 8px 28px rgba(0,0,0,.22)`, `border-radius:10px`,
      `background:#fff`, `transform:scale(1.03)`, `transition:none`,
    ].join(';');
    document.body.appendChild(ghost);
    el.style.opacity = '0.25';
    el.style.transition = 'none';
    if (navigator.vibrate) navigator.vibrate(40);

    function shiftOthers(newOver: number) {
      overIdx = newOver;
      itemRefs.current.forEach((e, i) => {
        if (!e || i === fromIdx) return;
        e.style.transition = 'transform 0.12s ease';
        if (fromIdx < newOver) {
          e.style.transform = (i > fromIdx && i <= newOver) ? `translateY(-${itemH}px)` : '';
        } else {
          e.style.transform = (i >= newOver && i < fromIdx) ? `translateY(${itemH}px)` : '';
        }
      });
    }

    function onMove(clientY: number) {
      const dy = clientY - startY;
      ghost.style.top = `${rect.top + dy}px`;
      const newOver = Math.max(0, Math.min(itemCount - 1, fromIdx + Math.round(dy / itemH)));
      if (newOver !== overIdx) shiftOthers(newOver);
    }

    function end() {
      ghost.remove();
      el.style.opacity = '';
      el.style.transition = '';
      itemRefs.current.forEach(e => { if (e) { e.style.transform = ''; e.style.transition = ''; } });
      onDrop(fromIdx, overIdx);
    }

    // Touch
    function onTouchMove(ev: TouchEvent) { ev.preventDefault(); onMove(ev.touches[0].clientY); }
    function onTouchEnd() {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      end();
    }
    // Mouse
    function onMouseMove(ev: MouseEvent) { ev.preventDefault(); onMove(ev.clientY); }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      end();
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleUserDragStart(startY: number, idx: number) {
    const count = (isSuperAdmin ? users : users.filter(u => u.role !== "superadmin")).length;
    startDragSession(startY, userItemRefs, idx, count, (from, to) => dropUser(from, to));
  }

  function handleShiftDragStart(startY: number, type: "work"|"rest"|"off", idx: number) {
    const refs = type === "work" ? shiftWorkRefs : type === "rest" ? shiftRestRefs : shiftOffRefs;
    const list = type === "work" ? editWorkShifts : type === "rest" ? editRestShifts : editOffShifts;
    startDragSession(startY, refs, idx, list.length, (from, to) => {
      if (from !== to) {
        const setter = type === "work" ? setEditWorkShifts : type === "rest" ? setEditRestShifts : setEditOffShifts;
        setter(prev => {
          const arr = [...prev];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return arr;
        });
      }
    });
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

  // 帳號卡片本地編輯 helpers
  function getUserVal<K extends keyof User>(u: User, k: K): User[K] {
    return (userEdits[u.uid]?.[k] ?? u[k]) as User[K];
  }
  function setUserEdit(uid: string, patch: Partial<User>) {
    setUserEdits(prev => ({ ...prev, [uid]: { ...prev[uid], ...patch } }));
    setUserDirty(prev => { const s = new Set(prev); s.add(uid); return s; });
  }
  async function saveUserCard(u: User) {
    const edits = userEdits[u.uid];
    if (!edits) return;
    const uid = u.uid;
    setUserSaving(prev => { const s = new Set(prev); s.add(uid); return s; });
    try {
      // handle attr change warning (same logic as patchUserField)
      if (edits.attr && edits.attr !== u.attr && isRotationAttr(u.attr) && isRotationAttr(edits.attr)) {
        const hasOverride = ratioOverrides.some(o => o.nurse_uid === uid);
        if (hasOverride) {
          setAttrChangeWarn({ uid, oldAttr: u.attr, newAttr: edits.attr });
          setUserSaving(prev => { const s = new Set(prev); s.delete(uid); return s; });
          return;
        }
      }
      await api.patch(`/users/${uid}`, edits);
      setUsers(prev => prev.map(x => x.uid === uid ? { ...x, ...edits } : x));
      setUserEdits(prev => { const n = { ...prev }; delete n[uid]; return n; });
      setUserDirty(prev => { const s = new Set(prev); s.delete(uid); return s; });
      showToast("✓ 已儲存", true);
    } catch (err: any) {
      showToast("✗ " + (err.response?.data?.detail ?? "更新失敗"), false);
    } finally {
      setUserSaving(prev => { const s = new Set(prev); s.delete(uid); return s; });
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
      await api.post("/rules", { rules: { shifts: { work: editWorkShifts, rest: editRestShifts, off: editOffShifts } } });
      setWorkShifts(editWorkShifts);
      setRestShifts(editRestShifts);
      setOffShifts(editOffShifts);
      showToast("✓ 班別設定已儲存");
    } catch (err: any) {
      showToast(`✗ ${err.response?.data?.detail ?? err.message ?? "儲存失敗"}`, false);
    }
  }

  // ── 班別設定：新增 / 移除 / 改名
  function addShift(type: "work"|"rest"|"off") {
    const s: ShiftDef = { code: "", label: "", type };
    if (type === "work") setEditWorkShifts(p => [...p, s]);
    else if (type === "rest") setEditRestShifts(p => [...p, s]);
    else setEditOffShifts(p => [...p, s]);
  }
  function removeShift(type: "work"|"rest"|"off", idx: number) {
    const list = type === "work" ? editWorkShifts : type === "rest" ? editRestShifts : editOffShifts;
    const code = list[idx]?.code || "?";
    setDeleteShiftTarget({ type, idx, code });
  }
  function confirmRemoveShift() {
    if (!deleteShiftTarget) return;
    const { type, idx } = deleteShiftTarget;
    if (type === "work") setEditWorkShifts(p => p.filter((_,i) => i!==idx));
    else if (type === "rest") setEditRestShifts(p => p.filter((_,i) => i!==idx));
    else setEditOffShifts(p => p.filter((_,i) => i!==idx));
    setDeleteShiftTarget(null);
  }
  function updateShiftDef(type: "work"|"rest"|"off", idx: number, field: keyof ShiftDef, val: unknown) {
    if (type === "work") setEditWorkShifts(p => p.map((s,i) => i===idx ? {...s,[field]:val} : s));
    else if (type === "rest") setEditRestShifts(p => p.map((s,i) => i===idx ? {...s,[field]:val} : s));
    else setEditOffShifts(p => p.map((s,i) => i===idx ? {...s,[field]:val} : s));
  }

  // ── 格子樣式（nurseUid: 判斷 updated_by 是否為本人 → 綠色；否則 → 藍色）
  function cellStyle(shift: string|undefined, confirmed: boolean|undefined, saving: boolean, nurseUid?: string, updatedBy?: string): { cls: string; style: React.CSSProperties } {
    let cls = "ap-cell";
    let style: React.CSSProperties = {};
    if (saving) { cls += " is-saving"; }
    else if (!shift) { cls += " is-empty"; }
    else {
      const isNurseFilled = !!updatedBy && !!nurseUid && updatedBy === nurseUid;
      if (isNurseFilled) {
        style = confirmed
          ? { background:"#166534", borderColor:"#14532d", color:"#fff" }
          : { background:"#dcfce7", borderColor:"#16a34a", color: shiftColor(shift, allOffShifts) };
      } else {
        style = confirmed
          ? { background:"#1e40af", borderColor:"#1e3a8a", color:"#fff" }
          : { background:"#dbeafe", borderColor:"#3b82f6", color: shiftColor(shift, allOffShifts) };
      }
    }
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
    <div className="ap-root">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f1f5f9 !important; color-scheme: light !important; overflow-x: hidden; }
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
        .ap-root { overflow-x: hidden; max-width: 100vw; box-sizing: border-box; }
        .ap-body { max-width: 1400px; margin: 0 auto; padding: 20px 16px 80px; box-sizing: border-box; width: 100%; }
        .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-sizing: border-box; width: 100%; }
        .card-head { padding: 16px 20px 12px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .card-body { padding: 20px; box-sizing: border-box; }

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
          width: 100%; max-width: 100%; padding: 9px 12px;
          border: 1.5px solid #d1d5db; border-radius: 8px;
          font-size: 14px; font-family: inherit; color: #111827;
          background: #fff; outline: none; color-scheme: light; -webkit-appearance: none;
          box-sizing: border-box;
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
          <button key={t.key} className={`ap-tab${tab===t.key?" active":""}`} onClick={() => {
              if (t.key !== "users" && tab === "users" && userDirty.size > 0) {
                setPendingTab(t.key);
              } else {
                setTab(t.key);
              }
            }}>
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
                <div style={{ marginTop:2 }}>
                  {cycleIsSet
                    ? <><span className="ap-cycle-title" style={{ fontSize:18, color:"#000", fontWeight:600 }}>{cycleTitleLabel}</span>　<span style={{ fontSize:12, color:"#d1d5db" }}>灰色欄為上週參考，護理師不可見</span></>
                    : <span style={{ fontSize:12, color:"#9ca3af" }}>點格子選擇班別，填完後「確認送出」</span>}
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
                    <th className="sticky-name sticky-name-head" style={{ minWidth:80, width:80, padding:"9px 12px" }}>姓名</th>
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
                        {u.name}
                        {u.attr && <span style={{ fontSize:10, color:"#9ca3af", fontWeight:400, marginLeft:3 }}>{attrShort(u.attr)}</span>}
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
                        const { cls: baseCls, style } = cellStyle(row?.shift, row?.confirmed, saving.has(key), u.uid, row?.updated_by);
                        const cls = baseCls
                          + (isCtrlSel   ? " is-ctrl-sel"   : "")
                          + (isShiftSel  ? " is-shift-sel"  : "")
                          + (isDragFill  ? " is-drag-fill"  : "")
                          + (isSwipeSel  ? " is-swipe-sel"  : "")
                          + (isAnchor    ? " is-anchor"     : "");
                        // isRef 時完整覆蓋 style，避免綠色底色/外框
                        const cellFinalStyle: React.CSSProperties = isRef
                          ? row?.shift
                            ? { background: "transparent", border: "1.5px solid transparent", color: "#000000", fontWeight: 700 }
                            : { background: "transparent", border: "1.5px solid transparent", color: "#555555" }
                          : style;

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
                          // 已確認格子先跳警告
                          if (row?.confirmed) {
                            setConfirmEdit({ nurseUid: u.uid, date: d, nurseName: u.name });
                          } else {
                            setPopup({ date: d, nurseUid: u.uid, nurseName: u.name });
                          }
                        }

                        return (
                          <td key={d} className="ap-td-shift" style={{ background: isRef ? "#fafafa" : undefined }}>
                            <span
                              className={cls}
                              style={cellFinalStyle}
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
                  <label style={{ display:"flex", alignItems:"center", gap:6, marginTop:4, cursor:"pointer" }}>
                    <input type="checkbox" checked={userDragEnabled} onChange={e => setUserDragEnabled(e.target.checked)}
                      style={{ width:14, height:14, accentColor:"#2563eb", cursor:"pointer" }} />
                    <span style={{ fontSize:12, color: userDragEnabled?"#2563eb":"#9ca3af" }}>
                      啟用拖曳排序　☰ 拖曳把手
                    </span>
                  </label>
                </div>
                <div style={{ fontSize:12, color:"#6b7280" }}>共 {visibleUsers.length} 位</div>
              </div>
              <div>
                {visibleUsers.map((u, i) => {
                  const canEditRole = isSuperAdmin || (u.role !== "superadmin" && u.uid !== user.uid);
                  const isDirty     = userDirty.has(u.uid);
                  const isSavingThis = userSaving.has(u.uid);
                  const curAttr     = getUserVal(u, "attr");
                  const curLevel    = getUserVal(u, "level");
                  const curRole     = getUserVal(u, "role");
                  const curHalftime = getUserVal(u, "halftime");
                  const curNote     = getUserVal(u, "note");

                  const sel: React.CSSProperties = {
                    fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6,
                    padding: "4px 4px", background: "#f9fafb",
                    cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                  };

                  // 輪班比例小字（個別覆蓋 or 全域預設）
                  const attrRatioBadge = (() => {
                    if (!isRotationAttr(curAttr)) return null;
                    const ov = ratioOverrides.find(o => o.nurse_uid === u.uid);
                    const ratio = ov ? ov.ratio : (() => {
                      if (curAttr === "輪班DE")  return { D: ratioForm.de_d, E: ratioForm.de_e };
                      if (curAttr === "輪班EN")  return { E: ratioForm.en_e, N: ratioForm.en_n };
                      if (curAttr === "輪班DN")  return { D: ratioForm.dn_d, N: ratioForm.dn_n };
                      if (curAttr === "輪班DEN") return { D: ratioForm.den_d, E: ratioForm.den_e, N: ratioForm.den_n };
                      return null;
                    })();
                    if (!ratio) return null;
                    const lbl = Object.entries(ratio).map(([k, v]) => `${k}:${v}`).join(" ");
                    return (
                      <span style={{
                        fontSize: 11, whiteSpace: "nowrap", flexShrink: 0,
                        color: ov ? "#1d4ed8" : "#6b7280",
                        background: ov ? "#eff6ff" : "#f3f4f6",
                        border: `1px solid ${ov ? "#bfdbfe" : "#e5e7eb"}`,
                        borderRadius: 5, padding: "1px 5px",
                      }}>
                        {lbl}{ov ? "（個別）" : "（全域）"}
                      </span>
                    );
                  })();

                  const btnSm: React.CSSProperties = {
                    flexShrink: 0, background: "none", border: "1px solid #d1d5db",
                    borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 14,
                  };

                  return (
                    <div
                      key={u.uid}
                      ref={el => { userItemRefs.current[i] = el; }}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        padding: "10px 14px 10px 28px",
                        background: isDirty ? "#fffbeb" : undefined,
                        position: "relative",
                      }}
                    >
                      {/* ☰ 絕對定位，往左突出，不佔內容空間 */}
                      <span
                        className="drag-handle"
                        style={{
                          position: "absolute", left: -25, top: "50%", transform: "translateY(-50%)",
                          color: userDragEnabled ? "#9ca3af" : "#e5e7eb",
                          cursor: userDragEnabled ? "grab" : "default",
                          fontSize: 15, userSelect: "none", lineHeight: 1,
                        }}
                        onTouchStart={userDragEnabled ? e => { e.preventDefault(); handleUserDragStart(e.touches[0].clientY, i); } : undefined}
                        onMouseDown={userDragEnabled ? e => { e.preventDefault(); handleUserDragStart(e.clientY, i); } : undefined}
                      >☰</span>

                      {/* ── 行 1：姓名 ｜ 帳號 ｜ 角色 */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <span style={{ fontWeight:600, fontSize:14, flexShrink:0 }}>{u.name}</span>
                        <code style={{ fontSize:11, background:"#f3f4f6", padding:"1px 5px", borderRadius:4, color:"#9ca3af", flexShrink:0 }}>{u.uid}</code>
                        {canEditRole ? (
                          <select value={curRole} onChange={e => setUserEdit(u.uid, { role: e.target.value })}
                            style={{ ...sel, width: 120 }}>
                            <option value="nurse">護理師</option>
                            <option value="dual">管理員兼護理師</option>
                            <option value="admin">管理員</option>
                            {isSuperAdmin && <option value="superadmin">超級管理員</option>}
                          </select>
                        ) : (
                          <span style={{
                            display:"inline-block", padding:"2px 8px", borderRadius:5, fontSize:12, fontWeight:700, flexShrink:0,
                            background: u.role==="nurse"?"#e0f2fe": u.role==="dual"?"#fef3c7": u.role==="admin"?"#f3f4f6":"#f3e8ff",
                            color:      u.role==="nurse"?"#0369a1": u.role==="dual"?"#92400e": u.role==="admin"?"#374151":"#7e22ce",
                          }}>{ROLE_ABBR[u.role] ?? u.role}</span>
                        )}
                      </div>

                      {/* ── 行 2：層級 ｜ 輪班 ｜ 比例 */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <select value={curLevel} onChange={e => setUserEdit(u.uid, { level: e.target.value })}
                          style={{ ...sel, width: 80 }}>
                          <option value="leader">leader</option>
                          <option value="second">second</option>
                          <option value="member">member</option>
                        </select>
                        <select value={curAttr} onChange={e => setUserEdit(u.uid, { attr: e.target.value })}
                          style={{ ...sel, width: 80 }}>
                          <option value="固定D">固定D</option>
                          <option value="固定E">固定E</option>
                          <option value="固定N">固定N</option>
                          <option value="輪班DE">輪班DE</option>
                          <option value="輪班EN">輪班EN</option>
                          <option value="輪班DN">輪班DN</option>
                          <option value="輪班DEN">輪班DEN</option>
                        </select>
                        {attrRatioBadge}
                      </div>

                      {/* ── 行 3：☐ 半職 ｜ 備註（flex-grow） */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:13, color:"#374151", cursor:"pointer", flexShrink:0 }}>
                          <input type="checkbox" checked={curHalftime}
                            onChange={e => setUserEdit(u.uid, { halftime: e.target.checked })}
                            style={{ width:15, height:15, cursor:"pointer" }} />
                          半職
                        </label>
                        <input
                          value={curNote}
                          placeholder="備註"
                          onChange={e => setUserEdit(u.uid, { note: e.target.value })}
                          style={{
                            flex: 1, minWidth: 0,
                            fontSize:13, border:"1px solid #d1d5db", borderRadius:6,
                            padding:"5px 10px", background:"#f9fafb", fontFamily:"inherit",
                          }}
                        />
                      </div>

                      {/* ── 行 4：儲存（靠左）｜ 🔑 ｜ 🗑（靠右） */}
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <button
                          disabled={!isDirty || isSavingThis}
                          onClick={() => saveUserCard(u)}
                          style={{
                            width: 100, padding:"6px 0", borderRadius:7, border:"none",
                            fontSize:13, fontWeight:600, cursor: isDirty ? "pointer" : "default",
                            background: isDirty ? "#16a34a" : "#d1fae5",
                            color: isDirty ? "#fff" : "#9ca3af",
                          }}
                        >{isSavingThis ? "儲存中…" : "儲存"}</button>
                        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                          <button style={btnSm} title="重設密碼"
                            onClick={() => { setEditUser(u); setEditForm({ name:u.name, role:u.role, level:u.level, attr:u.attr, halftime:u.halftime, note:u.note, showEditPwd:true }); }}>🔑</button>
                          {u.uid !== user.uid && (
                            <button style={{ ...btnSm, background:"#fef2f2", border:"1px solid #fecaca", color:"#dc2626" }}
                              onClick={() => setDeleteTarget(u)}>🗑</button>
                          )}
                        </div>
                      </div>
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
                        <NumInput className="finput" min={1} max={365}
                          value={cycle.period_days}
                          onChange={n => handlePeriodDays(n)} />
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
                    <div style={{ maxWidth:380 }}>
                      <label className="flabel">護理師填表截止日期</label>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <input className="finput" type="date" value={cycle.deadline_date}
                          onChange={e => setCycle(p=>({...p,deadline_date:e.target.value}))} style={{ flex:1 }} />
                        <input className="finput" type="time" value={cycle.deadline_time}
                          onChange={e => setCycle(p=>({...p,deadline_time:e.target.value}))} style={{ width:110 }} />
                      </div>
                      {cycle.deadline_date && (
                        <div style={{ fontSize:12, color:"#1d4ed8", marginTop:5, fontWeight:500 }}>
                          {fmtDateDay(cycle.deadline_date)} {cycle.deadline_time}
                        </div>
                      )}
                    </div>
                    {cycle.deadline_date && (
                      <div style={{ marginTop:8, fontSize:12, color:"#6b7280" }}>
                        護理師需在 <b style={{ color:"#dc2626" }}>{fmtDateDay(cycle.deadline_date)} {cycle.deadline_time}</b> 前完成填寫並確認送出
                      </div>
                    )}
                  </div>

                  {/* ── 國定假日天數 */}
                  <div className="setting-section">
                    <div className="setting-title">🗓 國定假日天數</div>
                    <div style={{ maxWidth:280 }}>
                      <label className="flabel">本週期國定假日天數（0 ～ 5 天）</label>
                      <NumInput className="finput" min={0} max={5} value={cycle.holiday_days}
                        onChange={n => setCycle(p=>({...p,holiday_days:n}))} />
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
                      <NumInput className="finput" min={0} max={31} value={rulesForm.max_off_days}
                        onChange={n => setRulesForm(p=>({...p,max_off_days:n}))} />
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">👥 每班人數設定</div>
                    <div className="frow3">
                      {([["D","daily_d","白班"],["E","daily_e","小夜"],["N","daily_n","大夜"]] as const).map(([c,k,lbl]) => (
                        <div key={k}>
                          <label className="flabel">{c} {lbl}（人）</label>
                          <NumInput className="finput" min={1} max={20}
                            value={(rulesForm as any)[k]}
                            onChange={n => setRulesForm(p=>({...p,[k]:n}))} />
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
                            <NumInput min={0} max={20} value={(sd as any)[f]}
                              onChange={n => setRulesForm(p=>({...p,special_dates:p.special_dates.map((x,j)=>j===i?{...x,[f]:n}:x)}))}
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
                      <NumInput className="finput" min={1} max={14} value={rulesForm.max_consecutive_work}
                        onChange={n => setRulesForm(p=>({...p,max_consecutive_work:n}))} />
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
                    </div>
                  </div>

                  <div className="setting-section">
                    <div className="setting-title">🌴 休假規則</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                      {/* 規則5：首個週末 */}
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.restrict_first_weekend}
                          onChange={e => setRulesForm(p=>({...p,restrict_first_weekend:e.target.checked}))} />
                        <div>
                          <span style={{ fontSize:13 }}>限制週期首個週末連休</span><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>排班週期第一個週六和週日不可同時為休假</span>
                        </div>
                      </label>

                      {/* 規則8：一例一休 */}
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.one_in_seven}
                          onChange={e => setRulesForm(p=>({...p,one_in_seven:e.target.checked}))} />
                        <div>
                          <span style={{ fontSize:13 }}>一例一休（每週至少 2 天休假）</span><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>每週一到週日至少安排 2 天休假</span>
                        </div>
                      </label>

                      {/* 規則10：指定休不可覆蓋 */}
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.lock_designated_off}
                          onChange={e => setRulesForm(p=>({...p,lock_designated_off:e.target.checked}))} />
                        <div>
                          <span style={{ fontSize:13 }}>指定休不可被覆蓋</span><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>啟用時：指定休（OFF）不被生成覆蓋。停用時：指定休可被覆蓋，系統自動補休</span>
                        </div>
                      </label>

                      {/* 規則6/7：連續休假 + 每週上限 */}
                      <div style={{ display:"flex", gap:20, marginTop:4 }}>
                        <div>
                          <label className="flabel">自動休連續上限（天）</label>
                          <NumInput className="finput" min={1} max={7} value={rulesForm.weekly_max_off_auto}
                            onChange={n => setRulesForm(p=>({...p,weekly_max_off_auto:n}))} />
                          <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>自動休最多連續 N 天，超過視為違規</div>
                        </div>
                        <div>
                          <label className="flabel">連續 OFF 總上限（天）</label>
                          <NumInput className="finput" min={1} max={7} value={rulesForm.weekly_max_off_total}
                            onChange={n => setRulesForm(p=>({...p,weekly_max_off_total:n}))} />
                          <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>指定休 + 自動休合計不可連續超過 N 天（特休等放假/調整類自動中斷計算）</div>
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
                          <NumInput min={1} max={99} value={(ratioForm as any)[cfg.d]}
                            onChange={n => setRatioForm(p=>({...p,[cfg.d]:n}))}
                            style={{ width:54, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px", fontFamily:"inherit", fontSize:13 }} />
                          <span style={{ color:"#9ca3af" }}>：</span>
                          <NumInput min={1} max={99} value={(ratioForm as any)[cfg.e]}
                            onChange={n => setRatioForm(p=>({...p,[cfg.e]:n}))}
                            style={{ width:54, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px", fontFamily:"inherit", fontSize:13 }} />
                        </div>
                      </div>
                    ))}
                    <div>
                      <label className="flabel">輪班DEN（D：E：N）</label>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {(["den_d","den_e","den_n"] as const).map((k,i) => (
                          <Fragment key={k}>
                            {i > 0 && <span style={{ color:"#9ca3af" }}>：</span>}
                            <NumInput min={1} max={99} value={ratioForm[k]}
                              onChange={n => setRatioForm(p=>({...p,[k]:n}))}
                              style={{ width:54, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px", fontFamily:"inherit", fontSize:13 }} />
                          </Fragment>
                        ))}
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
                                  <NumInput min={1} max={99}
                                    value={ov.ratio[k] ?? 1}
                                    onChange={n => setRatioOverrides(prev => prev.map((o, i) => i === idx
                                      ? { ...o, ratio: { ...o.ratio, [k]: n } }
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

            {/* 排班規則總覽說明卡 */}
            <div className="card">
              <div className="card-head"><div style={{ fontSize:15, fontWeight:700 }}>📋 排班規則總覽</div></div>
              <div className="card-body">
                <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:13, color:"#374151", lineHeight:1.8 }}>
                  <div style={{ fontWeight:700, color:"#6b7280", fontSize:12, marginBottom:2 }}>── 硬規則（一定遵守）──</div>
                  <div>• 每班每日剛好符合設定人數（D / E / N 各班不多不少）</div>
                  <div>• 反向班禁止：E→D 需隔 1 天休；N→E 需隔 1 天休；N→D 需隔 2 天休</div>
                  <div>• 每週至少 1 天休假（勾選一例一休改為至少 2 天）</div>
                  <div>• 每週 D/E/N 至多兩種班別，避免同週混排三種班型</div>
                  <div>• 連續上班天數不超過設定值，跨週累計</div>
                  <div>• 每班需有至少 1 位 leader，且至少 2 位 leader / second 層級</div>
                  <div>• 全職應休 8 + 國定假日 天；半職應休 16 + 國定假日 天</div>
                  <div>• 放假 / 調整類（特休 V、員旅、喪假、延休、補休、調移）：最高優先鎖定，不佔應休名額</div>
                  <div>• 半職（半）視同應休，計入應休天數</div>
                  <div style={{ fontWeight:700, color:"#6b7280", fontSize:12, marginTop:6, marginBottom:2 }}>── 休假規則 ──</div>
                  <div>• 指定休不可覆蓋：管理員標記的 OFF 不被生成取代</div>
                  <div>• 第一天鎖定：週期第一天已有記錄時鎖定，不被生成覆蓋</div>
                  <div>• 首個週末：週期第一個週六、週日不可同時休假</div>
                  <div>• 自動休連續上限 N 天：系統排的休假不超過 N 天連休（指定休可中斷計算）</div>
                  <div>• 連續 OFF 總上限：指定休 + 自動休合計連休不得超過設定值（特休等放假/調整類自動中斷計算）</div>
                  <div style={{ fontWeight:700, color:"#6b7280", fontSize:12, marginTop:6, marginBottom:2 }}>── 軟規則（人力允許時盡量遵守）──</div>
                  <div>• 固定班（固定 D / E / N）：整週期以同一班種為主，人力缺口才少數換班</div>
                  <div>• 盡量順班 + 切換前盡量安排休息（固定啟用）</div>
                  <div style={{ paddingLeft:12, color:"#6b7280", fontSize:12 }}>不休息直接切換班別 懲罰 +3；隔至少一天 OFF 再切換 懲罰 +2；不切換（同班種） 懲罰 0</div>
                  <div>• 各護理師班次數接近設定比例（允許 ±2 天偏差）</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            Tab: 班別設定
        ══════════════════════════════════ */}
        {tab === "shifts_cfg" && (() => {
          const shiftRow = (s: ShiftDef, i: number, type: "work"|"rest"|"off") => (
            <div
              key={i}
              ref={el => { (type==="work" ? shiftWorkRefs : type==="rest" ? shiftRestRefs : shiftOffRefs).current[i] = el; }}
              className="shift-edit-row"
              style={{ borderBottom:"1px solid #f3f4f6", paddingBottom:8, marginBottom:8 }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", width:"100%" }}>
                <span
                  className="drag-handle"
                  style={{ color: shiftDragEnabled ? "#9ca3af" : "#e5e7eb", cursor: shiftDragEnabled ? "grab" : "default" }}
                  onTouchStart={shiftDragEnabled ? e => { e.preventDefault(); handleShiftDragStart(e.touches[0].clientY, type as "work"|"rest"|"off", i); } : undefined}
                  onMouseDown={shiftDragEnabled ? e => { e.preventDefault(); handleShiftDragStart(e.clientY, type as "work"|"rest"|"off", i); } : undefined}
                >☰</span>
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
              • <b>上班類</b>（黑色）：計入上班天數，影響臨床人力計算<br />
              • <b>應休班別</b>（紅色）：OFF 一般休假、半 半職，計入應休天數名額<br />
              • <b>放假 / 調整類</b>（紅色）：特休、員旅、喪假等，不佔應休名額，最高優先鎖定<br />
              • 勾選「僅管理員」後，護理師填寫頁面不會顯示該班別<br />
              • 儲存後立即套用，建議先設定好再開放護理師填表
            </div>

            {/* 拖曳啟用 */}
            <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"4px 0" }}>
              <input type="checkbox" checked={shiftDragEnabled} onChange={e => setShiftDragEnabled(e.target.checked)}
                style={{ width:14, height:14, accentColor:"#2563eb", cursor:"pointer" }} />
              <span style={{ fontSize:12, color: shiftDragEnabled?"#2563eb":"#9ca3af" }}>
                啟用拖曳排序　☰ 拖曳把手
              </span>
            </label>

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

            {/* 應休班別 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div style={{ fontSize:15, fontWeight:700 }}>應休班別</div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>顯示為紅色字・計入應休天數名額</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => addShift("rest")}>＋ 新增班別</button>
              </div>
              <div className="card-body">
                {editRestShifts.map((s, i) => shiftRow(s, i, "rest"))}
                {!editRestShifts.length && <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:16 }}>尚未設定應休班別</div>}
              </div>
            </div>

            {/* 放假/調整類 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div style={{ fontSize:15, fontWeight:700 }}>放假 / 調整類班別</div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>顯示為紅色字・不佔應休名額・最高優先鎖定</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => addShift("off")}>＋ 新增班別</button>
              </div>
              <div className="card-body">
                {editOffShifts.map((s, i) => shiftRow(s, i, "off"))}
                {!editOffShifts.length && <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:16 }}>尚未設定放假 / 調整類班別</div>}
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
          const [genWarnings, setGenWarnings] = useState<string[]>([]);
          const [genAnomalies, setGenAnomalies] = useState<string[]>([]);
          const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
          const [confirmGenerate, setConfirmGenerate] = useState(false);
          const [hasGenerated, setHasGenerated] = useState(false);

          const unconfirmedCount = schedule.filter(r => cycleDays.includes(r.date) && !r.confirmed && r.shift).length;
          const confirmedCount   = schedule.filter(r => cycleDays.includes(r.date) && r.confirmed).length;
          const filledCount      = schedule.filter(r => cycleDays.includes(r.date) && r.shift).length;

          async function runGenerate() {
            setGenerating(true); setGenResult(""); setGenWarnings([]); setGenAnomalies([]); setConfirmGenerate(false);
            try {
              const { data } = await api.post(
                `/schedule/generate?overwrite_confirmed=${overwriteConfirmed}`
              );
              setGenResult(data.message ?? "完成");
              setGenWarnings(data.warnings ?? []);
              setGenAnomalies(data.anomalies ?? []);
              setHasGenerated(true);
              fetchSchedule();
            } catch (err: any) {
              setGenResult("✗ " + (err.response?.data?.detail ?? err.message ?? "生成失敗"));
            } finally { setGenerating(false); }
          }

          function downloadExport(type: "preview" | "schedule") {
            const token = getAuth()?.token;
            const a = document.createElement("a");
            a.href = `${(api.defaults.baseURL ?? "").replace(/\/$/, "")}/export/${type}`;
            // 用 fetch + blob 下載（帶 Authorization header）
            fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = type === "preview"
                  ? `預假狀態_${cycle.start_date}_${cycle.end_date}.xlsx`
                  : `完整班表_${cycle.start_date}_${cycle.end_date}.xlsx`;
                link.click();
                URL.revokeObjectURL(url);
              });
          }

          // 確認清單 item
          const CheckItem = ({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) => (
            <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
              <span style={{ fontSize:15, color: ok ? "#16a34a" : warn ? "#d97706" : "#dc2626", flexShrink:0 }}>
                {ok ? "✓" : warn ? "！" : "✗"}
              </span>
              <span style={{ color: ok ? "#374151" : warn ? "#92400e" : "#dc2626" }}>{label}</span>
            </div>
          );

          return (
          <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:620 }}>
            <div className="card">
              <div className="card-head"><div style={{ fontSize:16, fontWeight:700 }}>一鍵生成排班</div></div>
              <div className="card-body">
                <div className="fl">

                  {/* ── 生成前確認清單 */}
                  <div className="setting-section">
                    <div className="setting-title">生成前確認清單</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      <CheckItem
                        ok={cycleIsSet}
                        label={cycleIsSet
                          ? `排班週期：${cycle.start_date} ～ ${cycle.end_date}（${cycle.period_days} 天）`
                          : "尚未設定排班週期，請先至「排班週期」tab 設定"}
                      />
                      <CheckItem
                        ok={nurseUsers.length > 0}
                        label={`護理師人數：${nurseUsers.length} 人`}
                      />
                      <CheckItem
                        ok={true}
                        label={`全職應休 ${fullTimeOff} 天｜半職應休 ${partTimeOff} 天`}
                      />
                      <CheckItem
                        ok={filledCount === 0}
                        warn={filledCount > 0 && unconfirmedCount === 0}
                        label={filledCount === 0
                          ? "目前無已填班別，將全部由系統生成"
                          : `已填 ${filledCount} 格（已確認 ${confirmedCount} 格、待確認 ${unconfirmedCount} 格）——空白格子將由系統填入`}
                      />
                    </div>
                  </div>

                  {/* ── 順班規則說明 */}
                  <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"14px 16px", fontSize:13, color:"#1e40af", lineHeight:1.8 }}>
                    <b>盡量順班 + 切換前盡量安排休息（固定啟用）</b><br />
                    <span style={{ color:"#374151" }}>
                      • <b>輪班類（DE／EN／DN／DEN）：</b>同種班別連排後再換，切換時盡量先安排一天 OFF。<br />
                      &emsp;懲罰值：<b>直接切換 +3</b>｜<b>隔 OFF 再切換 +2</b>｜同班種 ±0（跨週亦同）<br />
                      • <b>固定D／E／N：</b>整週期幾乎全排同一種班，僅在人力缺口時才少數換班。
                    </span>
                  </div>

                  {/* ── 將套用的規則 */}
                  <div className="setting-section">
                    <div className="setting-title">將套用的規則</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, color:"#374151", lineHeight:1.7 }}>
                      <div style={{ fontWeight:700, color:"#6b7280", fontSize:11 }}>── 硬規則 ──</div>
                      <div>每班每日人數：D = <b>{rulesForm.daily_d}</b>、E = <b>{rulesForm.daily_e}</b>、N = <b>{rulesForm.daily_n}</b> 人</div>
                      <div>反向班禁止：<b>{rulesForm.no_reverse_shift ? "✓" : "停用"}</b>　每週至少 <b>{rulesForm.one_in_seven ? "2" : "1"}</b> 天休假{rulesForm.one_in_seven ? "（一例一休）" : ""}　每週至多兩種班別：<b>{rulesForm.weekly_max_two_shifts ? "✓" : "停用"}</b></div>
                      <div>連續上班上限 <b>{rulesForm.max_consecutive_work}</b> 天（含跨週計算）　連續 OFF 總上限 <b>{rulesForm.weekly_max_off_total}</b> 天</div>
                      <div>自動休連續上限 <b>{rulesForm.weekly_max_off_auto}</b> 天　指定休不可覆蓋：<b>{rulesForm.lock_designated_off ? "✓" : "停用"}</b>　第一天鎖定：<b>{rulesForm.lock_first_day ? "✓" : "停用"}</b></div>
                      <div style={{ fontWeight:700, color:"#6b7280", fontSize:11, marginTop:2 }}>── 軟規則 ──</div>
                      <div>固定班整週期排同班種（偏離懲罰 +20）　盡量順班 + 切換前安排休息（直接切換 +3｜隔 OFF +2）</div>
                    </div>
                  </div>

                  {/* ── 選項 */}
                  <div className="setting-section">
                    <div className="setting-title">選項</div>
                    <label className="fcheck">
                      <input type="checkbox" checked={overwriteConfirmed}
                        onChange={e => setOverwriteConfirmed(e.target.checked)} />
                      <span style={{ fontSize:13 }}>覆蓋已確認送出的班別</span>
                    </label>
                    <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>
                      未勾選：只填空白格子，已填班別（含未確認）一律保留。
                    </div>
                  </div>

                  {/* ── 生成按鈕 */}
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
                      一鍵生成排班
                    </button>
                  )}

                  {/* ── 生成結果 */}
                  {genResult && (
                    <div style={{
                      padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600,
                      background: genResult.startsWith("✗") ? "#fef2f2" : "#dcfce7",
                      color:      genResult.startsWith("✗") ? "#dc2626" : "#15803d",
                      border:     `1px solid ${genResult.startsWith("✗") ? "#fecaca" : "#bbf7d0"}`,
                    }}>{genResult}</div>
                  )}

                  {/* ── 警告（人力不足縮減應休） */}
                  {genWarnings.length > 0 && (
                    <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"12px 16px", fontSize:13 }}>
                      <div style={{ fontWeight:700, color:"#92400e", marginBottom:6 }}>人力不足警告</div>
                      {genWarnings.map((w, i) => <div key={i} style={{ color:"#92400e" }}>{w}</div>)}
                      <div style={{ fontSize:12, color:"#b45309", marginTop:6 }}>應休天數已平均縮減，請確認後再送出確認。</div>
                    </div>
                  )}

                  {/* ── 異常標示 */}
                  {genAnomalies.length > 0 && (
                    <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 16px", fontSize:13 }}>
                      <div style={{ fontWeight:700, color:"#dc2626", marginBottom:6 }}>異常標示</div>
                      {genAnomalies.map((a, i) => <div key={i} style={{ color:"#dc2626" }}>{a}</div>)}
                    </div>
                  )}

                  {/* ── 匯出區塊 */}
                  <div className="setting-section">
                    <div className="setting-title">匯出 Excel（.xlsx）</div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <div>
                        <button
                          className="btn btn-gray"
                          disabled={!cycleIsSet}
                          onClick={() => downloadExport("preview")}>
                          匯出預假狀態
                        </button>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>目前所有護理師已填寫的班別</div>
                      </div>
                      <div>
                        <button
                          className="btn btn-gray"
                          disabled={!cycleIsSet || !hasGenerated}
                          onClick={() => downloadExport("schedule")}>
                          匯出完整班表
                        </button>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>生成後完整結果，人工填寫外框加粗</div>
                      </div>
                    </div>
                  </div>

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
            <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"65vh" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed", minWidth:320 }}>
                <colgroup>
                  <col style={{ width:"15%" }} />
                  <col style={{ width:"16%" }} />
                  <col style={{ width:"9%" }} />
                  <col style={{ width:"16%" }} />
                  <col style={{ width:"16%" }} />
                  <col style={{ width:"14%" }} />
                  <col style={{ width:"14%" }} />
                </colgroup>
                <thead>
                  <tr style={{ position:"sticky", top:0, zIndex:10, background:"#f8fafc" }}>
                    {["時間","操作者","角色","動作","護理師","日期","班別"].map(h => (
                      <th key={h} style={{ padding:"8px 4px", fontSize:12, fontWeight:700, color:"#6b7280", textAlign:"center", borderBottom:"2px solid #e5e7eb", background:"#f8fafc", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const operatorName = users.find(u => u.uid === log.operator_uid)?.name ?? log.operator_uid;
                    const nurseName    = users.find(u => u.uid === log.nurse_uid)?.name ?? log.nurse_uid;
                    const roleShort: Record<string,string> = { nurse:"護", dual:"兼", admin:"管", superadmin:"超" };
                    const logDate = log.date ? dayjs(log.date).format("MM/DD") : "";
                    const tdC: React.CSSProperties = { padding:"7px 4px", textAlign:"center", borderBottom:"1px solid #f3f4f6" };
                    return (
                      <tr key={i}>
                        <td style={{ ...tdC, fontSize:12, color:"#9ca3af", lineHeight:1.5 }}>
                          {dayjs(log.created_at).format("MM/DD")}<br />{dayjs(log.created_at).format("HH:mm")}
                        </td>
                        <td style={{ ...tdC, fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{operatorName}</td>
                        <td style={{ ...tdC }}>
                          <div style={{ display:"flex", justifyContent:"center" }}>
                            <span className={`badge badge-${log.operator_role==="nurse"?"nurse":log.operator_role==="dual"?"dual":log.operator_role==="admin"?"admin":"super"}`}>
                              {roleShort[log.operator_role] ?? log.operator_role}
                            </span>
                          </div>
                        </td>
                        <td style={{ ...tdC, fontSize:12 }}>
                          {log.action==="confirm" ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓確認</span>
                            : log.action==="unconfirm" ? <span style={{ color:"#f59e0b", fontWeight:700 }}>↩取消</span>
                            : <span style={{ color:"#6b7280" }}>編輯</span>}
                        </td>
                        <td style={{ ...tdC, fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nurseName}</td>
                        <td style={{ ...tdC, fontSize:12, color:"#374151" }}>{logDate}</td>
                        <td style={{ ...tdC }}>
                          {log.shift
                            ? <span style={{ fontWeight:700, fontSize:12, color: isOff(log.shift, allOffShifts)?"#dc2626":"#111827" }}>{log.shift}</span>
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
          offShifts={allOffShifts}
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

      {/* ── 修改已確認格子警告 */}
      {confirmEdit && (
        <Dialog
          title="確認修改已送出的班別？"
          body={<>已確認的班別（{confirmEdit.nurseName}　{confirmEdit.date}）修改後將回到<b>待確認</b>狀態，需重新送出確認。</>}
          actions={[
            { label: "取消", onClick: () => setConfirmEdit(null) },
            {
              label: "繼續修改",
              danger: true,
              onClick: () => {
                const { nurseUid, date, nurseName } = confirmEdit!;
                setConfirmEdit(null);
                setPopup({ date, nurseUid, nurseName });
              },
            },
          ]}
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

      {/* ── 未儲存離開提示 Dialog */}
      {pendingTab && (
        <Dialog
          title="帳號管理有未儲存的變更"
          body={`有 ${userDirty.size} 筆帳號有未儲存的變更，確定要離開嗎？`}
          actions={[
            { label: "取消", onClick: () => setPendingTab(null) },
            { label: "直接離開", danger: true, onClick: () => {
              setUserEdits({});
              setUserDirty(new Set());
              setTab(pendingTab!);
              setPendingTab(null);
            }},
            { label: "儲存後離開", primary: true, onClick: async () => {
              const dirtyUsers = users.filter(u => userDirty.has(u.uid));
              for (const u of dirtyUsers) await saveUserCard(u);
              setTab(pendingTab!);
              setPendingTab(null);
            }},
          ]}
        />
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
          offShifts={allOffShifts}
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
          offShifts={allOffShifts}
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
    </div>
  );
}
