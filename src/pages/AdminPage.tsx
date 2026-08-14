import { useState, useEffect, useRef, Fragment } from "react";
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
type Tab = "schedule"|"users"|"cycle"|"rules"|"rules_overview"|"shifts_cfg"|"generate"|"logs";

interface ShiftDef { code: string; label: string; type: "work"|"rest"|"off"; admin_only?: boolean; }
interface User {
  uid: string; name: string; role: string; level: string;
  attr: string; halftime: boolean; admin_staff: boolean;
  is_trainee: boolean; mentor_uid: string; note: string; sort_order: number;
}
interface ShiftRow { nurse_uid: string; date: string; shift: string; confirmed?: boolean; updated_by?: string; }

// 行政人員勾選時，輪班屬性/角色/層級等下拉呈現灰色不可選
const disabledSelStyle: React.CSSProperties = { background:"#f3f4f6", color:"#9ca3af", cursor:"not-allowed" };

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
  date, nurseName, current, workShifts, restShifts, offShifts, onSelect, onClose,
}: {
  date: string; nurseName: string; current: string;
  workShifts: ShiftDef[]; restShifts: ShiftDef[]; offShifts: ShiftDef[];
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
        <div style={{ fontSize:11, fontWeight:700, color:"#dc2626", marginBottom:6 }}>應休</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {restShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btn, color:"#dc2626",
              border: current===s.code ? "2px solid #dc2626" : "1.5px solid #fecaca",
              background: current===s.code ? "#fef2f2" : "#fff5f5" }}
              title={s.label}>{s.code}</button>
          ))}
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:"#d97706", marginBottom:6 }}>放假 / 調整</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {offShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btn, color:"#d97706",
              border: current===s.code ? "2px solid #d97706" : "1.5px solid #fde68a",
              background: current===s.code ? "#fffbeb" : "#fffdf5" }}
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
  nurseName, dates, workShifts, restShifts, offShifts, onSelect, onClose,
}: {
  nurseName: string;
  dates: string[];
  workShifts: ShiftDef[];
  restShifts: ShiftDef[];
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
        <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>應休</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {restShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btnBase, color: "#dc2626", borderColor: "#fecaca", background: "#fff5f5" }}>{s.code}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, marginBottom: 6 }}>放假 / 調整</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {offShifts.map(s => (
            <button key={s.code} onClick={() => onSelect(s.code)} style={{ ...btnBase, color: "#d97706", borderColor: "#fde68a", background: "#fffdf5" }}>{s.code}</button>
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
  const [revertMenuOpen, setRevertMenuOpen] = useState(false);
  const [revertConfirm, setRevertConfirm] = useState<"clear" | "clearCycle" | "restore" | "restoreManual" | "purge" | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertResult, setRevertResult] = useState<string>("");

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
  const apTabsRef = useRef<HTMLDivElement | null>(null);         // 頁籤列（量測浮動表頭起始 Y）
  const apTheadRowRef = useRef<HTMLTableRowElement | null>(null); // 表頭日期列（量測欄寬）
  const apStickyScrollRef = useRef<HTMLDivElement | null>(null);  // 浮動表頭橫向捲動容器
  const [apShowStickyHdr, setApShowStickyHdr] = useState(false);
  const [apColWidths, setApColWidths] = useState<number[]>([]);
  const [apStickyBox, setApStickyBox] = useState<{ left: number; width: number; top: number }>({ left: 0, width: 0, top: 96 });
  const nurseUsersRef = useRef<User[]>([]);
  const scrollSpeedRef = useRef<number>(10);
  useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);

  // 桌機滑鼠拖曳捲動班表（按住拖曳：左右捲表格容器、上下捲整個頁面；拖曳時不觸發格子點選）
  // 橫向用 pageX 捲 wrap.scrollLeft；縱向用 clientY（視窗相對，避免頁面捲動造成座標回饋）捲 window。
  const dragScrollRef = useRef({ down: false, startX: 0, startScroll: 0, startY: 0, startScrollTop: 0, moved: false });
  const suppressClickRef = useRef(false);
  useEffect(() => {
    if (tab !== "schedule") return;
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;                 // 只處理左鍵
      suppressClickRef.current = false;
      dragScrollRef.current = {
        down: true, moved: false,
        startX: e.pageX, startScroll: wrap.scrollLeft,
        startY: e.clientY, startScrollTop: window.scrollY,
      };
    };
    const onMove = (e: MouseEvent) => {
      const s = dragScrollRef.current;
      if (!s.down) return;
      const dx = e.pageX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { s.moved = true; wrap.style.cursor = "grabbing"; }
      if (s.moved) {
        wrap.scrollLeft = s.startScroll - dx;                       // 左右捲表格
        window.scrollTo(window.scrollX, s.startScrollTop - dy);     // 上下捲頁面
        e.preventDefault();
      }
    };
    const onUp = () => {
      const s = dragScrollRef.current;
      if (s.down && s.moved) suppressClickRef.current = true;   // 剛拖曳過 → 吞掉接下來的 click
      s.down = false;
      wrap.style.cursor = "grab";
    };
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClickRef.current) { e.stopPropagation(); e.preventDefault(); suppressClickRef.current = false; }
    };
    wrap.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    wrap.addEventListener("click", onClickCapture, true);       // capture 階段先攔
    wrap.style.cursor = "grab";
    return () => {
      wrap.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      wrap.removeEventListener("click", onClickCapture, true);
      wrap.style.cursor = "";
    };
  }, [tab]);
  useEffect(() => { ctrlSelectedRef.current = ctrlSelected; }, [ctrlSelected]);
  useEffect(() => { shiftRangeRef.current = shiftRange; }, [shiftRange]);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { shiftAnchorRef.current = shiftAnchor; }, [shiftAnchor]);
  useEffect(() => { batchSaveRef.current = batchSave; });

  // 帳號管理
  const [newUser, setNewUser] = useState({ uid:"", password:"", name:"", role:"nurse", level:"member", attr:"輪班DEN", halftime:false, admin_staff:false, is_trainee:false, mentor_uid:"", note:"" });
  const [creating, setCreating] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User & { new_password: string; showEditPwd?: boolean }>>({});
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [clearLogsConfirm, setClearLogsConfirm] = useState<{hours:number; label:string; all?:boolean} | null>(null);
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
  type CycleState = {
    start_date: string;
    end_date: string;
    period_days: number;
    deadline_date: string;
    deadline_time: string;
    holiday_days: number;
  };
  const CYCLE_DEFAULT: CycleState = {
    start_date: "", end_date: "", period_days: 28,
    deadline_date: "", deadline_time: "23:59", holiday_days: 0,
  };
  // 若 localStorage 有 cache 則首個 render 直接是最後一次的 cycle（不 flash）
  const _hasCachedCycle = (() => {
    try { return !!localStorage.getItem("adminCycle"); } catch { return false; }
  })();
  const [cycle, setCycle] = useState<CycleState>(() => {
    try {
      const cached = localStorage.getItem("adminCycle");
      if (cached) return { ...CYCLE_DEFAULT, ...JSON.parse(cached) };
    } catch {}
    return CYCLE_DEFAULT;
  });
  // 首次 fetchRules 是否已完成（用來區分「還沒抓」vs「抓完了但沒設 cycle」）
  const [rulesFetched, setRulesFetched] = useState(_hasCachedCycle);

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
    allow_fixed_deviation: false,  // 固定班可偏離最多2格；未勾（預設）＝完全不可偏離
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
  // 已儲存快照（一鍵生成頁籤只顯示已寫入資料庫的值，避免誤以為已儲存）
  const [savedCycle, setSavedCycle] = useState<typeof cycle | null>(null);
  const [savedRules, setSavedRules] = useState<typeof rulesForm | null>(null);
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

  // Generate tab state（必須在頂層，不可放 IIFE 內）
  const [generating, setGenerating] = useState(false);
  // 進階調參:懲罰值 & 求解器參數（後台 UI 可調,存 rules.penalties;優先序 DB > env > 硬編 default）
  const [penaltyForm, setPenaltyForm] = useState<Record<string, number>>({});
  // 一鍵生成的取消機制：abortRef 中止當下正在跑的 axios,cancelRef flag 讓迴圈到下個 profile 前就 break
  const genAbortRef = useRef<AbortController | null>(null);
  const genCanceledRef = useRef(false);
  const [genResult, setGenResult] = useState<string>("");
  const [genDemand, setGenDemand] = useState<{ daily_d:number; daily_e:number; daily_n:number; special_dates_count:number; total_work_demand:number } | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const GEN_PROFILES = [
    { key: "balanced", label: "分數最高版", desc: "整體懲罰總分最低（預設平衡權重）" },
    { key: "smooth",   label: "順班優先版", desc: "切換懲罰加倍，連班更整齊" },
    { key: "fair",     label: "公平優先版", desc: "比例／休假公平懲罰加倍，各班種分配更平均；固定班嚴格（固定D只排D，完全不可偏離，湊不出則此版失敗）" },
  ] as const;
  type GenProfileKey = typeof GEN_PROFILES[number]["key"];
  type GenVersion = {
    schedules: Record<string, Record<string, string>>;
    cycle_dates: string[];
    message: string;
    warnings: string[];
    anomalies: string[];
    prefill_warnings: string[];
    metrics: { switches: number; excess_switches?: number; isolated_days: number; max_ratio_dev: number } | null;
    error?: string;
  };
  const [genVersions, setGenVersions] = useState<Partial<Record<GenProfileKey, GenVersion>>>({});
  // 暖啟動：記憶上次成功生成的三版結果，下次生成時作為 solver hint（各 profile 各自傳自己上次的解）
  const [lastGenSchedules, setLastGenSchedules] = useState<Partial<Record<GenProfileKey, Record<string, Record<string, string>>>>>({});
  const [selectedProfile, setSelectedProfile] = useState<GenProfileKey | null>(null);
  const [warnOpen, setWarnOpen] = useState<Record<string, boolean>>({});   // 版本卡「警告」展開狀態
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string>("");

  const year = parseInt(ym.slice(0,4));
  const month = parseInt(ym.slice(5,7));

  // 週期相關計算
  const cycleIsSet = !!(cycle.start_date && cycle.end_date);
  const fullTimeOff = Math.min(8 + cycle.holiday_days, 13);
  const partTimeWork = Math.floor((160 - cycle.holiday_days * 8) / 2 / 8);      // 可上天數（無條件捨去）
  const partTimeOffExact = 28 - (160 - cycle.holiday_days * 8) / 2 / 8;         // 顯示用（可能有小數）
  const partTimeOff = 28 - partTimeWork;                                          // 計算用（整數）
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
  // 實際參與排班的護理師（排除行政人員 admin_staff，他們只預班、不被一鍵生成）
  const schedulableNurses = nurseUsers.filter(u => !u.admin_staff);

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

  // ── 浮動日期表頭：量測欄寬 + 表格容器左緣/寬度（避免錯位）
  useEffect(() => {
    const measure = () => {
      const row = apTheadRowRef.current;
      if (!row) return;
      const ths = Array.from(row.querySelectorAll("th"));
      if (!ths.length || ths[0].getBoundingClientRect().width === 0) return;
      setApColWidths(ths.map(th => th.getBoundingClientRect().width));
      const wrap = tableWrapRef.current;
      const tabs = apTabsRef.current;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        const top = tabs ? tabs.getBoundingClientRect().bottom : 96;
        setApStickyBox({ left: r.left, width: r.width, top });
      }
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [tab, schedule, nurseUsers, cycle.start_date, cycle.end_date]);

  // ── 監聽垂直捲動：表頭捲過頁籤列後顯示浮動表頭
  useEffect(() => {
    const onScroll = () => {
      const row = apTheadRowRef.current;
      const tabs = apTabsRef.current;
      if (!row || !tabs) { setApShowStickyHdr(false); return; }
      const threshold = tabs.getBoundingClientRect().bottom;
      setApShowStickyHdr(row.getBoundingClientRect().bottom <= threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab]);

  // ── 同步水平捲動：表格 → 浮動表頭
  useEffect(() => {
    const wrap = tableWrapRef.current;
    const sticky = apStickyScrollRef.current;
    if (!wrap || !sticky) return;
    const onScroll = () => { sticky.scrollLeft = wrap.scrollLeft; };
    wrap.addEventListener("scroll", onScroll, { passive: true });
    return () => wrap.removeEventListener("scroll", onScroll);
  }, [apShowStickyHdr]);

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
        // 平行抓取所有月份，加快載入
        const results = await Promise.all(
          Array.from(months).map(m => {
            const y = parseInt(m.slice(0,4)), mo = parseInt(m.slice(5,7));
            return api.get("/schedule", { params: { year: y, month: mo } });
          })
        );
        const allRows: ShiftRow[] = results.flatMap(r => r.data.schedule ?? []);
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
  async function clearLogs(hours: number, all?: boolean) {
    try {
      await api.delete("/logs", { params: all ? {} : { before_hours: hours } });
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
        setCycle(prev => {
          const merged = {
            ...prev,
            ...r.cycle,
            period_days: r.cycle.period_days ?? (
              r.cycle.start_date && r.cycle.end_date
                ? Math.max(1, dayjs(r.cycle.end_date).diff(dayjs(r.cycle.start_date),'day') + 1)
                : prev.period_days
            ),
          };
          setSavedCycle(merged);
          // 快取到 localStorage 供下次登入即刻 hydrate（避免載入 flash）
          try { localStorage.setItem("adminCycle", JSON.stringify(merged)); } catch {}
          return merged;
        });
      }
      if (r.scheduling) {
        setRulesForm(prev => {
          const merged = { ...prev, ...r.scheduling };
          setSavedRules(merged);
          return merged;
        });
      }
      if (r.ratio) setRatioForm(prev => ({ ...prev, ...r.ratio }));
      if (r.penalties) setPenaltyForm(r.penalties);
      if (r.ratio_overrides) setRatioOverrides(r.ratio_overrides);
      if (r.shifts?.work) { setWorkShifts(r.shifts.work); setEditWorkShifts(r.shifts.work); }
      if (r.shifts?.rest) { setRestShifts(r.shifts.rest); setEditRestShifts(r.shifts.rest); }
      if (r.shifts?.off)  { setOffShifts(r.shifts.off);  setEditOffShifts(r.shifts.off);   }
    } catch {}
    finally { setRulesFetched(true); }
  }

  function showToast(msg: string, ok = true) {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, ok });
    toastRef.current = setTimeout(() => setToast({ msg:"", ok:true }), 2500);
  }

  // ── 單格 debounce 佇列
  const pendingSingle = useRef<Map<string, { nurse_uid: string; date: string; shift: string | null }>>(new Map());
  const singleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flushSingle() {
    if (!pendingSingle.current.size) return;
    const updates = Array.from(pendingSingle.current.values());
    pendingSingle.current.clear();
    singleTimer.current = null;
    _batchCommit(updates);
  }

  // ── 班表操作（樂觀更新 + debounce 500ms）
  function updateShift(nurse_uid: string, date: string, shift: string | null) {
    if (!nurse_uid || !date) {
      showToast("✗ 資料錯誤：缺少護理師或日期", false);
      return;
    }
    const key = `${nurse_uid}_${date}`;
    // 立即更新畫面（樂觀更新）
    setSchedule(cur => {
      const f = cur.filter(r => !(r.nurse_uid===nurse_uid && r.date===date));
      if (shift) f.push({ nurse_uid, date, shift, confirmed: false, updated_by: user.uid });
      return f;
    });
    setSaving(s => new Set(s).add(key));
    // 加入 debounce 佇列
    pendingSingle.current.set(key, { nurse_uid, date, shift });
    if (singleTimer.current) clearTimeout(singleTimer.current);
    singleTimer.current = setTimeout(flushSingle, 500);
  }

  // ── 批次儲存（Shift/Ctrl/滑動共用）— 一次 API
  async function batchSave(updates: Array<{ nurse_uid: string; date: string; shift: string | null }>) {
    if (!updates.length) return;
    const deduped = Array.from(
      new Map(updates.map(u => [`${u.nurse_uid}_${u.date}`, u])).values()
    );
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
    await _batchCommit(deduped, keys);
  }

  // ── 實際發送 batch API（供 updateShift debounce 和 batchSave 共用）
  async function _batchCommit(
    updates: Array<{ nurse_uid: string; date: string; shift: string | null }>,
    knownKeys?: string[],
  ) {
    const keys = knownKeys ?? updates.map(u => `${u.nurse_uid}_${u.date}`);
    try {
      await api.post("/schedule/shifts/batch", updates);
      if (updates.length === 1) showToast("✓ 已儲存");
      else showToast(`✓ 已儲存 ${updates.length} 格`);
    } catch (err: any) {
      const detail = err.response?.data?.detail ?? err.message ?? "網路錯誤";
      showToast(`✗ 儲存失敗：${detail}`, false);
      await fetchSchedule();   // 回滾：重新載入真實狀態
    } finally {
      setSaving(s => { const n = new Set(s); keys.forEach(k => n.delete(k)); return n; });
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
      setNewUser({ uid:"", password:"", name:"", role:"nurse", level:"member", attr:"輪班DEN", halftime:false, admin_staff:false, is_trainee:false, mentor_uid:"", note:"" });
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
      setSavedCycle(cycle);   // 儲存成功後才更新一鍵生成頁籤顯示的快照
      showToast("✓ 週期設定已儲存");
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? err.response?.statusText ?? err.message ?? "儲存失敗";
      showToast(`✗ ${msg}`, false);
    }
  }
  async function saveSchedulingRules() {
    try {
      await api.post("/rules", { rules: { scheduling: rulesForm, ratio: ratioForm, ratio_overrides: ratioOverrides, penalties: penaltyForm } });
      setSavedRules(rulesForm);   // 儲存成功後才更新一鍵生成頁籤顯示的快照
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

  // 判斷班別是否與護理師輪班屬性不符（固定班用屬性名稱比對）
  function isAttrConflict(shift: string, attr: string): boolean {
    if (!shift) return false;
    // 應休類（OFF、半）和放假/調整類（V、員、喪⋯）不觸發衝突
    if (allOffShifts.some(s => s.code === shift)) return false;
    if (restShifts.some(s => s.code === shift)) return false;
    // 會/公/書記 性質等同 D
    const effectiveShift = ["會", "公", "書記"].includes(shift) ? "D" : shift;
    if (attr.startsWith("固定")) {
      const fixedShift = attr.replace("固定", "");
      return effectiveShift !== fixedShift;
    }
    const allowed = attrShifts(attr);
    if (allowed.length === 0) return false; // 未知屬性，不標示
    return !allowed.includes(effectiveShift);
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
  function cellStyle(shift: string|undefined, confirmed: boolean|undefined, saving: boolean, nurseUid?: string, updatedBy?: string, attrConflict?: boolean): { cls: string; style: React.CSSProperties } {
    let cls = "ap-cell";
    let style: React.CSSProperties = {};
    if (saving) { cls += " is-saving"; }
    else if (!shift) { cls += " is-empty"; }
    else if (attrConflict) {
      // 屬性衝突：黃色底色警告
      style = confirmed
        ? { background:"#854d0e", borderColor:"#713f12", color:"#fff" }
        : { background:"#fef9c3", borderColor:"#eab308", color:"#713f12" };
    } else {
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
    { key:"rules_overview", label:"規則總覽" },
    { key:"generate",   label:"一鍵生成" },
    { key:"users",      label:"帳號管理" },
    { key:"shifts_cfg", label:"班別設定" },
    { key:"logs",       label:"操作紀錄" },
  ];

  return (
    <div className="ap-root">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f1f5f9 !important; color-scheme: light !important; }
        html { overflow-x: hidden; }
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
        .ap-root { max-width: 100vw; box-sizing: border-box; }
        .ap-body { max-width: 1400px; margin: 0 auto; padding: 20px 16px 80px; box-sizing: border-box; width: 100%; }
        .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-sizing: border-box; width: 100%; overflow: hidden; }
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
        /* 日期/時間欄位：選項 5「完全無 icon」— appearance:none 徹底移除 iOS shadow DOM，
           同時解決 iOS 超框 + date/time 高度不一致問題；tap 仍會開 iOS 原生日曆/時鐘選單（type 決定的） */
        input[type="date"].finput, input[type="time"].finput {
          -webkit-appearance: none; appearance: none;
          min-width: 0; width: 100%;
          height: 40px;
          padding: 0 12px;
          box-sizing: border-box;
        }
        input[type="date"].finput::-webkit-calendar-picker-indicator,
        input[type="time"].finput::-webkit-calendar-picker-indicator { display: none; -webkit-appearance: none; }
        input[type="date"].finput::-webkit-inner-spin-button,
        input[type="time"].finput::-webkit-inner-spin-button { display: none; -webkit-appearance: none; }
        /* 佔位提示（空值時）文字對齊左邊 */
        input[type="date"].finput, input[type="time"].finput { text-align: left; }
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
          width: 36px; height: 30px; border-radius: 6px;
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

        /* 固定左欄 + 固定表頭列 */
        .sticky-name {
          position: sticky; left: 0; z-index: 2;
          background: #fff;
          white-space: nowrap;
          width: 70px; min-width: 70px;
        }
        .sticky-name-head {
          background: #f8fafc !important;
          position: sticky; left: 0; z-index: 5;
        }
        /* 班屬欄 */
        .sticky-attr {
          position: sticky; left: 70px; z-index: 2;
          background: #fff; border-right: 2px solid #e2e8f0 !important;
          white-space: nowrap; text-align: center;
          width: 34px; min-width: 34px;
          font-size: 10px; font-weight: 600; color: #9ca3af;
          padding: 4px 2px;
        }
        .sticky-attr-head {
          background: #f8fafc !important;
          position: sticky; left: 70px; z-index: 5;
          border-right: 2px solid #e2e8f0 !important;
          text-align: center !important; font-size: 11px; font-weight: 700; color: #6b7280;
          padding: 8px 4px; width: 34px; min-width: 34px;
        }
        .ap-th-day {
          padding: 6px 2px; text-align: center !important; font-size: 11px; font-weight: 700;
          color: #374151; background: #f8fafc; min-width: 42px; width: 42px;
        }
        .ap-th-day.we { color: #dc2626; background: #fef2f2; }
        .ap-td-shift { text-align: center; padding: 3px 2px; }
        .ap-td-shift.we { background: #fef9f9; }

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
        @media (max-width: 480px) {
          .sticky-name, .sticky-name-head { width: 56px !important; min-width: 56px !important; font-size: 11px !important; padding: 6px 7px !important; }
          .sticky-attr, .sticky-attr-head { width: 28px !important; min-width: 28px !important; font-size: 9px !important; }
          .ap-th-day { width: 34px !important; min-width: 34px !important; }
          .ap-cell { width: 28px !important; height: 26px !important; font-size: 11px !important; }
        }
        @media (orientation: landscape) and (max-width: 1024px) {
          .ap-cell { width: 26px !important; height: 24px !important; font-size: 10px !important; }
          .ap-th-day { min-width: 30px !important; width: 30px !important; font-size: 9px !important; padding: 4px 1px !important; }
          .ap-td-shift { padding: 1px !important; }
          .sticky-name, .sticky-name-head { font-size: 12px !important; min-width: 50px !important; max-width: 50px !important; width: 50px !important; }
          .sticky-attr, .sticky-attr-head { width: 26px !important; min-width: 26px !important; font-size: 9px !important; }
        }

        /* Toast */
        .ap-toast {
          position: fixed; bottom: 34px; left: 50%; transform: translateX(-50%);
          padding: 11px 26px; border-radius: 12px; font-size: 16px; font-weight: 500;
          z-index: 10000; pointer-events: none; white-space: nowrap; letter-spacing: .3px;
          box-shadow: 0 5px 18px rgba(0,0,0,.2);
          animation: toast-up .18s ease;
        }
        .ap-toast.ok  { background: #15803d; color: #fff; }
        .ap-toast.err { background: #dc2626; color: #fff; }
        @keyframes toast-up { from { opacity:0; transform: translateX(-50%) translateY(10px); } }
        @media (min-width: 768px) {
          .ap-toast { font-size: 18px; font-weight: 600; }
        }

        /* 設定頁區塊 */
        .setting-section { background: #f8fafc; border-radius: 10px; padding: 16px 18px; border: 1px solid #e5e7eb; }
        .setting-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }

        /* 手機專屬：桌面才顯示的贅字 */
        .ap-desktop-only { display: inline; }
        /* 手動填寫班表週期標題基本尺寸（桌面顯示大） */
        .ap-cycle-title { font-size: 18px; }

        @media (max-width: 640px) {
          .frow  { grid-template-columns: minmax(0, 1fr); }
          .frow3 { grid-template-columns: minmax(0, 1fr); }
          .ap-body { padding: 12px 10px 80px; }
          .card-body { padding: 14px; }
          /* 手動填寫班表：週期標題縮字避免換行；桌面才顯示的字隱藏；按鈕縮 padding 塞同一行 */
          .ap-cycle-title { font-size: 16px; }
          .ap-desktop-only { display: none; }
          .card-head .btn { padding: 8px 10px; font-size: 12px; }
          /* 手機 card-head 縮左右 padding 讓字往邊界靠 */
          .card-head { padding: 12px 12px 10px; }
        }
      `}</style>

      {/* ── Navbar */}
      <nav className="ap-nav">
        <div className="ap-nav-l">
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:-.3 }}>護理排班後台</span>
          <span style={{ fontSize:12, opacity:.7 }}>｜{user.name}</span>
        </div>
        <div className="ap-nav-r">
          {isDual && (
            <button className="btn btn-ghost btn-sm" onClick={() => { window.location.href = "/nurse"; }}>護理師介面</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { window.location.href = "/home"; }}>回首頁</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { clearAuth(); window.location.href = "/login"; }}>登出</button>
        </div>
      </nav>

      {/* ── Tab bar */}
      <div className="ap-tabs" ref={apTabsRef}>
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
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>手動填寫班表</div>
                {cycleIsSet ? (
                  <>
                    <div style={{ marginTop:2 }}>
                      <span className="ap-cycle-title" style={{ color:"#000", fontWeight:600, whiteSpace:"nowrap" }}>{cycleTitleLabel}</span>
                    </div>
                    <div style={{ marginTop:2, fontSize:12, color:"#d1d5db" }}>灰色欄為上週參考，護理師不可見</div>
                  </>
                ) : !rulesFetched ? (
                  <div style={{ marginTop:2 }}>
                    <span style={{ fontSize:12, color:"#9ca3af" }}>載入中…</span>
                  </div>
                ) : (
                  <div style={{ marginTop:2 }}>
                    <span style={{ fontSize:12, color:"#9ca3af" }}>點格子選擇班別，填完後「確認送出」</span>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"nowrap" }}>
                {!cycleIsSet && (
                  <input type="month" value={ym} onChange={e => setYm(e.target.value)} className="finput" style={{ width:150 }} />
                )}
                <div style={{ position:"relative" }}>
                  <button
                    className="btn btn-gray"
                    disabled={reverting}
                    onClick={() => setRevertMenuOpen(v => !v)}>
                    班表還原選項 ▾
                  </button>
                  {revertMenuOpen && (
                    <>
                    <div onClick={() => setRevertMenuOpen(false)}
                      style={{ position:"fixed", inset:0, zIndex:19 }} />
                    <div style={{
                      position:"absolute", top:"100%", left:0, marginTop:4, zIndex:20,
                      background:"#fff", border:"1px solid #e5e7eb", borderRadius:8,
                      boxShadow:"0 4px 16px rgba(0,0,0,.12)", minWidth:260, overflow:"hidden",
                    }}>
                      <button className="btn-menu-item" onClick={() => { setRevertMenuOpen(false); setRevertConfirm("clear"); }}
                        style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none", background:"none", cursor:"pointer", fontSize:13 }}>
                        1. 清除所有 CP-SAT 生成內容<br/>
                        <span style={{ fontSize:11, color:"#9ca3af" }}>只留下人員填寫的內容</span>
                      </button>
                      <button className="btn-menu-item" onClick={() => { setRevertMenuOpen(false); setRevertConfirm("clearCycle"); }}
                        style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none", borderTop:"1px solid #f3f4f6", background:"none", cursor:"pointer", fontSize:13 }}>
                        2. 清除預班週期內所有填寫內容<br/>
                        <span style={{ fontSize:11, color:"#9ca3af" }}>執行前自動備份，可用選項 4 還原</span>
                      </button>
                      <button className="btn-menu-item" onClick={() => { setRevertMenuOpen(false); setRevertConfirm("restore"); }}
                        style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none", borderTop:"1px solid #f3f4f6", background:"none", cursor:"pointer", fontSize:13 }}>
                        3. 恢復到上次 CP-SAT 生成的內容<br/>
                        <span style={{ fontSize:11, color:"#9ca3af" }}>還原成上次一鍵生成的完整結果</span>
                      </button>
                      <button className="btn-menu-item" onClick={() => { setRevertMenuOpen(false); setRevertConfirm("restoreManual"); }}
                        style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none", borderTop:"1px solid #f3f4f6", background:"none", cursor:"pointer", fontSize:13 }}>
                        4. 恢復確認送出及待確認的內容<br/>
                        <span style={{ fontSize:11, color:"#9ca3af" }}>還原到最近一次清除/還原操作之前</span>
                      </button>
                      <button className="btn-menu-item" onClick={() => { setRevertMenuOpen(false); setRevertConfirm("purge"); }}
                        style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none", borderTop:"1px solid #f3f4f6", background:"none", cursor:"pointer", fontSize:13, color:"#dc2626" }}>
                        5. 清除半年之外所有班表<br/>
                        <span style={{ fontSize:11, color:"#f87171" }}>不可復原，釋放資料庫空間</span>
                      </button>
                    </div>
                    </>
                  )}
                </div>
                <button className="btn btn-green" onClick={confirmAll} disabled={confirmingAll}>
                  {confirmingAll ? "確認中…" : (
                    <>確認送出（{schedule.filter(r=>!r.confirmed&&r.shift).length}<span className="ap-desktop-only"> 格待確認</span>）</>
                  )}
                </button>
              </div>
            </div>

            {/* 統計 */}
            <div style={{ padding:"10px 20px", display:"flex", flexWrap:"wrap", gap:"8px 18px", alignItems:"center", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
              {(() => {
                const trainees = nurseUsers.filter(u => u.is_trainee).length;
                const clinical = nurseUsers.length - trainees;
                return (
                  <span style={{ color:"#9ca3af", fontWeight:400 }}>
                    共 {nurseUsers.length} 人{trainees > 0 && (
                      <span style={{ marginLeft:6, fontSize:12 }}>（臨床 {clinical}、新人 {trainees}）</span>
                    )}
                  </span>
                );
              })()}
              <span style={{ marginLeft:"auto", fontSize:12, color:"#6b7280" }}>
                已確認 {schedule.filter(r=>cycleDays.includes(r.date)&&r.confirmed&&r.shift).length} 格 ／
                待確認 {schedule.filter(r=>cycleDays.includes(r.date)&&!r.confirmed&&r.shift).length} 格
              </span>
            </div>

            {/* 回復結果提示 */}
            {revertResult && (
              <div style={{
                margin:"8px 20px 0", padding:"8px 14px", borderRadius:8, fontSize:13, fontWeight:600,
                background: revertResult.startsWith("✗") ? "#fef2f2" : "#dcfce7",
                color:      revertResult.startsWith("✗") ? "#dc2626" : "#15803d",
                border:     `1px solid ${revertResult.startsWith("✗") ? "#fecaca" : "#bbf7d0"}`,
              }}>{revertResult}</div>
            )}

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

            {/* 浮動日期表頭（表頭捲過頁籤列後固定，對齊表格容器左緣） */}
            {apShowStickyHdr && apColWidths.length >= 2 && apStickyBox.width > 0 && (
              <div style={{
                position:"fixed", top:apStickyBox.top, left:apStickyBox.left, width:apStickyBox.width,
                zIndex:90, background:"#fff", boxShadow:"0 2px 6px rgba(0,0,0,.10)", overflow:"hidden",
              }}>
                <div ref={apStickyScrollRef} style={{ overflowX:"auto", scrollbarWidth:"none" }}>
                  <table className="tbl" style={{ tableLayout:"fixed", width:apColWidths.reduce((a,b)=>a+b,0) }}>
                    <tbody>
                      <tr>
                        {apColWidths.map((w, i) => {
                          if (i === 0) return <th key={i} className="sticky-name sticky-name-head" style={{ width:w, minWidth:w, padding:"9px 12px" }}>姓名</th>;
                          if (i === 1) return <th key={i} className="sticky-attr-head" style={{ width:w, minWidth:w, left: apColWidths[0] || 70 }}>班屬</th>;
                          const d = allDays[i-2];
                          if (!d) return <th key={i} style={{ width:w }} />;
                          const isRef = refDays.includes(d);
                          const dow = dayjs(d).day();
                          const isWe = dow===0||dow===6;
                          return (
                            <th key={i} className={`ap-th-day${isWe?" we":""}`}
                              style={{ width:w, minWidth:w, background: isRef ? "#f8fafc" : undefined,
                                       color: isRef ? "#c4c4c4" : (isWe ? "#dc2626" : undefined) }}>
                              <div style={{ fontSize:9, opacity:.6, color: isRef?"#d1d5db":undefined }}>{String(dayjs(d).month()+1).padStart(2,"0")}</div>
                              <div style={{ color: isRef?"#d1d5db":undefined }}>{dayjs(d).date()}</div>
                              <div style={{ fontSize:9, opacity:.7 }}>{DOW_ZH[dow].replace("週","")}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 表格 */}
            <div ref={tableWrapRef} style={{ overflowX:"auto", WebkitOverflowScrolling:"touch", userSelect:"none", WebkitUserSelect:"none" as any }}>
              <table className="tbl">
                <thead>
                  {/* 分段標題列（只在有週期時顯示） */}
                  {cycleIsSet && refDays.length > 0 && (
                    <tr>
                      <th className="sticky-name sticky-name-head" style={{ minWidth:70, width:70 }} />
                      <th className="sticky-attr-head" style={{ left: apColWidths[0] || 70 }} />
                      <th colSpan={refDays.length} style={{
                        textAlign:"center", fontSize:11, fontWeight:700, padding:"4px 6px",
                        background:"#f3f4f6", color:"#9ca3af", borderBottom:"none",
                        position:"sticky", top:0, zIndex:2,
                      }}>上週參考（管理員填寫，護理師不可見）</th>
                      <th colSpan={cycleDays.length} style={{
                        textAlign:"center", fontSize:11, fontWeight:700, padding:"4px 6px",
                        background:"#eff6ff", color:"#1d4ed8", borderBottom:"none",
                        position:"sticky", top:0, zIndex:2,
                      }}>本次排班週期（{cycle.start_date} ～ {cycle.end_date}）</th>
                    </tr>
                  )}
                  <tr ref={apTheadRowRef}>
                    <th className="sticky-name sticky-name-head" style={{ minWidth:70, width:70, padding:"8px 10px" }}>姓名</th>
                    <th className="sticky-attr-head" style={{ left: apColWidths[0] || 70 }}>班屬</th>
                    {allDays.map(d => {
                      const isRef = refDays.includes(d);
                      const dow = dayjs(d).day();
                      const isWe = dow===0||dow===6;
                      return (
                        <th key={d} className={`ap-th-day${isWe?" we":""}`}
                          style={{ background: isRef ? "#f8fafc" : undefined,
                                   color: isRef ? "#c4c4c4" : (isWe ? "#dc2626" : undefined) }}>
                          <div style={{ fontSize:9, opacity:.6, color: isRef?"#d1d5db":undefined }}>{String(dayjs(d).month()+1).padStart(2,"0")}</div>
                          <div style={{ color: isRef?"#d1d5db":undefined }}>{dayjs(d).date()}</div>
                          <div style={{ fontSize:9, opacity:.7 }}>{DOW_ZH[dow].replace("週","")}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {nurseUsers.map(u => (
                    <tr key={u.uid}>
                      <td className="sticky-name" style={{ padding:"7px 10px", fontSize:15, fontWeight:700 }}>
                        {u.name}
                        {u.halftime && <span style={{ fontSize:9, color:"#16a34a", fontWeight:700, marginLeft:3 }}>半</span>}
                        {u.admin_staff && <span style={{ fontSize:9, color:"#7c3aed", fontWeight:700, marginLeft:3 }}>行政</span>}
                      </td>
                      <td className="sticky-attr" style={{ left: apColWidths[0] || 70 }}>
                        {attrShort(u.attr) || "—"}
                      </td>
                      {allDays.map(d => {
                        const isRef = refDays.includes(d);
                        const isWe  = [0, 6].includes(dayjs(d).day());
                        const row = schedule.find(r => r.nurse_uid===u.uid && r.date===d);
                        const key = `${u.uid}_${d}`;
                        const isCtrlSel   = ctrlSelected.has(key);
                        const isShiftSel  = shiftRange.has(key);
                        const isDragFill  = dragFill?.nurseUid === u.uid && dragFill.dates.has(d);
                        const isSwipeSel  = swipeDates.has(d) && (swipeRef.current?.nurseUid === u.uid || swipePopup?.nurseUid === u.uid);
                        const isAnchor    = shiftAnchor?.nurseUid === u.uid && shiftAnchor.date === d && !shiftRange.size && !ctrlSelected.size;
                        const conflict = !!(row?.shift) && isAttrConflict(row.shift, u.attr);
                        const { cls: baseCls, style } = cellStyle(row?.shift, row?.confirmed, saving.has(key), u.uid, row?.updated_by, conflict);
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
                          // 已確認格子先跳警告（須同時有班別，避免殘留空值誤判）
                          if (row?.confirmed && row?.shift) {
                            setConfirmEdit({ nurseUid: u.uid, date: d, nurseName: u.name });
                          } else {
                            setPopup({ date: d, nurseUid: u.uid, nurseName: u.name });
                          }
                        }

                        return (
                          <td key={d} className={`ap-td-shift${isWe && !isRef ? " we" : ""}`} style={{ background: isRef ? "#fafafa" : undefined }}>
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
                    <td className="sticky-attr" style={{ background:"#f8fafc", left: apColWidths[0] || 70 }} />
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
                  const curAdminStaff = getUserVal(u, "admin_staff");
                  const curTrainee  = getUserVal(u, "is_trainee");
                  const curMentor   = getUserVal(u, "mentor_uid") || "";
                  const curNote     = getUserVal(u, "note");
                  // 導師候選：僅 leader 職位、正式排班護理師（排除行政、其他新人、半職、本人）
                  const mentorOptions = nurseUsers.filter(x => x.level === "leader" && !x.admin_staff && !x.is_trainee && !x.halftime && x.uid !== u.uid);

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
                        padding: "10px 11px",
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
                          <select value={curRole} disabled={curAdminStaff}
                            onChange={e => setUserEdit(u.uid, { role: e.target.value })}
                            style={{ ...sel, width: 120, ...(curAdminStaff ? disabledSelStyle : {}) }}>
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
                        <select value={curLevel} disabled={curAdminStaff}
                          onChange={e => setUserEdit(u.uid, { level: e.target.value })}
                          style={{ ...sel, width: 80, ...(curAdminStaff ? disabledSelStyle : {}) }}>
                          <option value="leader">leader</option>
                          <option value="second">second</option>
                          <option value="member">member</option>
                        </select>
                        <select value={curAttr} disabled={curAdminStaff}
                          onChange={e => setUserEdit(u.uid, { attr: e.target.value })}
                          style={{ ...sel, width: 80, ...(curAdminStaff ? disabledSelStyle : {}) }}>
                          <option value="固定D">固定D</option>
                          <option value="固定E">固定E</option>
                          <option value="固定N">固定N</option>
                          <option value="輪班DE">輪班DE</option>
                          <option value="輪班EN">輪班EN</option>
                          <option value="輪班DN">輪班DN</option>
                          <option value="輪班DEN">輪班DEN</option>
                        </select>
                        {!curAdminStaff && attrRatioBadge}
                      </div>

                      {/* ── 行 3：☐ 半職 ｜ ☐ 行政 ｜ ☐ 新人 [選導師] — 手機 gap 7px、label 內 2px、選導師 100~140px */}
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6, flexWrap:"wrap" }}>
                        <label style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, color: curAdminStaff ? "#9ca3af" : "#374151", cursor: curAdminStaff ? "not-allowed" : "pointer", flexShrink:0 }}>
                          <input type="checkbox" checked={curHalftime} disabled={curAdminStaff}
                            onChange={e => setUserEdit(u.uid, { halftime: e.target.checked })}
                            style={{ width:15, height:15, margin:0, cursor: curAdminStaff ? "not-allowed" : "pointer" }} />
                          半職
                        </label>
                        <label style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, color:"#374151", cursor:"pointer", flexShrink:0 }}>
                          <input type="checkbox" checked={curAdminStaff}
                            onChange={e => setUserEdit(u.uid, e.target.checked
                              ? { admin_staff: true, role: "nurse", level: "member", halftime: false, is_trainee: false, mentor_uid: "" }
                              : { admin_staff: false })}
                            style={{ width:15, height:15, margin:0, cursor:"pointer" }} />
                          行政
                        </label>
                        <label style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, color: curAdminStaff ? "#9ca3af" : "#374151", cursor: curAdminStaff ? "not-allowed" : "pointer", flexShrink:0 }}>
                          <input type="checkbox" checked={curTrainee} disabled={curAdminStaff}
                            onChange={e => setUserEdit(u.uid, e.target.checked
                              ? { is_trainee: true, role: "nurse" }
                              : { is_trainee: false, mentor_uid: "" })}
                            style={{ width:15, height:15, margin:0, cursor: curAdminStaff ? "not-allowed" : "pointer" }} />
                          新人
                        </label>
                        {curTrainee && (
                          <select value={curMentor} onChange={e => {
                            const mUid = e.target.value;
                            const mentor = mentorOptions.find(mo => mo.uid === mUid);
                            // 選導師時,新人的輪班屬性自動跟隨導師（確保 CP-SAT 能真的排出跟老師相同的班）
                            setUserEdit(u.uid, mentor
                              ? { mentor_uid: mUid, attr: mentor.attr }
                              : { mentor_uid: mUid });
                          }}
                            style={{ ...sel, maxWidth: 146, flex:"1 1 100px", minWidth:0, WebkitAppearance:"none", appearance:"none", backgroundImage:"none" }} title="導師（新人跟隨此人排班；選定後新人 attr 自動跟隨導師）">
                            <option value="">— 選導師 —</option>
                            {mentorOptions.map(mo => <option key={mo.uid} value={mo.uid}>{mo.name}（{mo.attr}）</option>)}
                          </select>
                        )}
                      </div>

                      {/* ── 行 4：備註 */}
                      <div style={{ marginBottom:6 }}>
                        <input
                          value={curNote}
                          placeholder="備註"
                          onChange={e => setUserEdit(u.uid, { note: e.target.value })}
                          style={{
                            width: "100%", minWidth: 0,
                            fontSize:13, border:"1px solid #d1d5db", borderRadius:6,
                            padding:"5px 10px", background:"#f9fafb", fontFamily:"inherit",
                          }}
                        />
                      </div>

                      {/* ── 行 5：儲存（靠左）｜ 🔑 ｜ 🗑（靠右） */}
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
                            onClick={() => { setEditUser(u); setEditForm({ name:u.name, role:u.role, level:u.level, attr:u.attr, halftime:u.halftime, admin_staff:u.admin_staff, note:u.note, showEditPwd:true }); }}>🔑</button>
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
                      <select className="finput" value={newUser.attr} disabled={newUser.admin_staff}
                        style={newUser.admin_staff ? disabledSelStyle : undefined}
                        onChange={e => setNewUser(p=>({...p,attr:e.target.value}))}>
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
                      <select className="finput" value={newUser.role} disabled={newUser.admin_staff}
                        style={newUser.admin_staff ? disabledSelStyle : undefined}
                        onChange={e => setNewUser(p=>({...p,role:e.target.value}))}>
                        <option value="nurse">護理師</option>
                        <option value="dual">管理員兼護理師</option>
                        <option value="admin">管理員</option>
                        {isSuperAdmin && <option value="superadmin">超級管理員</option>}
                      </select>
                    </div>
                    <div>
                      <label className="flabel">層級</label>
                      <select className="finput" value={newUser.level} disabled={newUser.admin_staff}
                        style={newUser.admin_staff ? disabledSelStyle : undefined}
                        onChange={e => setNewUser(p=>({...p,level:e.target.value}))}>
                        <option value="leader">leader</option>
                        <option value="second">second</option>
                        <option value="member">member</option>
                      </select>
                    </div>
                    <div style={{ display:"flex", alignItems:"flex-end", paddingBottom:2, gap:12 }}>
                      <label className="fcheck">
                        <input type="checkbox" checked={newUser.halftime} disabled={newUser.admin_staff}
                          onChange={e => setNewUser(p=>({...p,halftime:e.target.checked}))} />
                        <span style={{ fontSize:13 }}>半職人員</span>
                      </label>
                      <label className="fcheck">
                        <input type="checkbox" checked={newUser.admin_staff}
                          onChange={e => setNewUser(p=>({...p, admin_staff:e.target.checked,
                            ...(e.target.checked ? { role:"nurse", level:"member", halftime:false, is_trainee:false, mentor_uid:"" } : {}) }))} />
                        <span style={{ fontSize:13 }}>行政人員</span>
                      </label>
                      <label className="fcheck">
                        <input type="checkbox" checked={newUser.is_trainee} disabled={newUser.admin_staff}
                          onChange={e => setNewUser(p=>({...p, is_trainee:e.target.checked,
                            ...(e.target.checked ? { role:"nurse" } : { mentor_uid:"" }) }))} />
                        <span style={{ fontSize:13 }}>新人</span>
                      </label>
                    </div>
                    {newUser.is_trainee && (
                      <div>
                        <label className="flabel">導師（新人跟隨此人排班,可留空;選定後 attr 自動跟隨導師）</label>
                        <select className="finput" style={{ maxWidth:240 }} value={newUser.mentor_uid}
                          onChange={e => {
                            const mUid = e.target.value;
                            const mentor = nurseUsers.find(x => x.uid === mUid);
                            setNewUser(p => ({
                              ...p,
                              mentor_uid: mUid,
                              ...(mentor ? { attr: mentor.attr } : {}),
                            }));
                          }}>
                          <option value="">— 選導師 —</option>
                          {nurseUsers.filter(x => x.level === "leader" && !x.admin_staff && !x.is_trainee && !x.halftime).map(mo => <option key={mo.uid} value={mo.uid}>{mo.name}（{mo.attr}）</option>)}
                        </select>
                      </div>
                    )}
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
                      <div style={{ display:"flex", gap:8, alignItems:"stretch" }}>
                        <input className="finput" type="date" value={cycle.deadline_date}
                          onChange={e => setCycle(p=>({...p,deadline_date:e.target.value}))} style={{ flex:1, minWidth:0 }} />
                        <input className="finput" type="time" step={60} value={cycle.deadline_time}
                          onChange={e => setCycle(p=>({...p,deadline_time:e.target.value}))}
                          style={{ width:100, flex:"0 0 100px" }} />
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

            {/* 週期內應休天數 */}
            <div className="card">
              <div className="card-body">
                <div className="setting-section" style={{ marginBottom:0 }}>
                  <div className="setting-title">🗓 週期內應休天數</div>
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
                      <div style={{ fontSize:28, fontWeight:800, color:"#92400e" }}>{partTimeOffExact} 天</div>
                      <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>= 28 − (160 − {cycle.holiday_days}×8)÷2÷8</div>
                    </div>
                    <div style={{ padding:"12px 16px", background:"#eff6ff", borderRadius:10, border:"1px solid #bfdbfe", minWidth:175 }}>
                      <div style={{ fontSize:12, color:"#1d4ed8", fontWeight:600, marginBottom:4 }}>半職可上天數（試算用）</div>
                      <div style={{ fontSize:28, fontWeight:800, color:"#1d4ed8" }}>{partTimeWork} 天</div>
                      <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>小數點無條件捨去</div>
                    </div>
                  </div>
                  <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:14 }}>
                    <button className="btn btn-primary" onClick={saveCycle}>儲存</button>
                    <span style={{ fontSize:12, color:"#9ca3af" }}>修改國定假日天數後請按儲存</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 休假與人數 */}
            <div className="card">
              <div className="card-head"><div style={{ fontSize:16, fontWeight:700 }}>排班規則設定</div></div>
              <div className="card-body">
                <div className="fl">

                  <div className="setting-section">
                    <div className="setting-title">🌴 預班上限（天）</div>
                    <div style={{ maxWidth:280 }}>
                      <label className="flabel">全職護理師可預填的白班/小夜/大夜/OFF 總天數上限</label>
                      <NumInput className="finput" min={0} max={31} value={rulesForm.max_off_days}
                        onChange={n => setRulesForm(p=>({...p,max_off_days:n}))} />
                    </div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginTop:6, lineHeight:1.6 }}>
                      超過此上限時，護理師預班會被硬擋、無法再填。半、特休V 等放假調整類不計入；半職不受限；設為 0 代表不限制。
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
                        <input type="checkbox" checked={rulesForm.lock_first_day}
                          onChange={e => setRulesForm(p=>({...p,lock_first_day:e.target.checked}))} />
                        <span style={{ fontSize:13 }}>第一天鎖定（參考前期最後7天的班別延伸）</span>
                      </label>
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
                          <span style={{ fontSize:13 }}>限制首個週末連休（護理師預班）</span><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>全職護理師預班時，不可將週期第一個週六、週日同時預成 OFF（只算 OFF、半職不受限）。自動排班不受此限。</span>
                        </div>
                      </label>

                      {/* 規則8：一例一休 */}
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.one_in_seven}
                          onChange={e => setRulesForm(p=>({...p,one_in_seven:e.target.checked}))} />
                        <div>
                          <span style={{ fontSize:13 }}>一例一休（每週至少 2 天休假）</span><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>硬規則：每週至少安排 2 天休假。人力或預班湊不出時，一鍵生成會失敗（非扣分），可取消勾選改為不強制</span>
                        </div>
                      </label>

                      {/* 固定班偏離 */}
                      <label className="fcheck">
                        <input type="checkbox" checked={rulesForm.allow_fixed_deviation}
                          onChange={e => setRulesForm(p=>({...p,allow_fixed_deviation:e.target.checked}))} />
                        <div>
                          <span style={{ fontSize:13 }}>允許固定班偏離（最多 2 格）</span><br />
                          <span style={{ fontSize:12, color:"#6b7280" }}>勾選：固定班（固定D/E/N）在人力缺口時最多可偏離 2 格到其他班別。取消勾選：固定班完全不可偏離、只排該班（湊不出時會生成失敗）。註：公平優先版一律不可偏離。</span>
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

                      {/* 規則6/7：連續休假 + 每週上限（手機自動變成單欄堆疊,避免 label 換行） */}
                      <div className="frow" style={{ marginTop:4 }}>
                        <div>
                          <label className="flabel">自動休連續上限（天）</label>
                          <NumInput className="finput" min={1} max={7} value={rulesForm.weekly_max_off_auto}
                            onChange={n => setRulesForm(p=>({...p,weekly_max_off_auto:n}))} />
                          <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>自動休最多連續 N 天，超過視為違規（半職護理師不受此限）</div>
                        </div>
                        <div>
                          <label className="flabel">連續 OFF 總上限（天）</label>
                          <NumInput className="finput" min={1} max={7} value={rulesForm.weekly_max_off_total}
                            onChange={n => setRulesForm(p=>({...p,weekly_max_off_total:n}))} />
                          <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>指定休 + 自動休合計不可連續超過 N 天（特休等放假/調整類自動中斷計算）（半職護理師不受此限）</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── ⚙ 進階調參(懲罰值) — 僅 superadmin 可見(存進 rules.penalties 影響所有人排班,權限收緊) */}
                  {isSuperAdmin && (() => {
                    type PenMeta = { key: string; label: string; def: number; min: number; max: number; step?: number; cat: string; tip: string };
                    const PENALTY_META: PenMeta[] = [
                      { key:"EXCESS_SWITCH_PENALTY",  label:"多餘換班",       def:1500, min:0, max:20000, cat:"順班",     tip:"S8:輪班超過必要換班數的每次罰。拉高 → 班表更整齊、少換班,代價可能孤立日增加" },
                      { key:"DIRECT_SWITCH_PENALTY",  label:"沒休就換",       def:500,  min:0, max:20000, cat:"順班",     tip:"S8:沒先排 OFF 就直接切換每次罰(必要/多餘都加)" },
                      { key:"DIST_PENALTY",           label:"班次比例偏差",   def:900,  min:0, max:20000, cat:"比例/公平", tip:"S10:各護理師 D/E/N 天數偏離設定比例每單位罰" },
                      { key:"SKILL_SPREAD_PENALTY",   label:"應休縮減公平",   def:400,  min:0, max:20000, cat:"比例/公平", tip:"S6:各護理師縮減幅度差距罰(讓縮減平均分攤)" },
                      { key:"ISOLATED_WORK_PENALTY",  label:"孤立上班日",     def:750,  min:0, max:20000, cat:"軟規則",   tip:"S9:OFF-上班-OFF 只出來上一天罰" },
                      { key:"FIX_PENALTY",            label:"固定班偏離",     def:500,  min:0, max:20000, cat:"軟規則",   tip:"S7:固定班偏離其班種每格罰" },
                      { key:"WEEKLY_OFF_OVER_PENALTY",label:"週OFF凸性",      def:500,  min:0, max:20000, cat:"軟規則",   tip:"S3:全職每週 OFF 超過 2 天罰(凸性 3 層)" },
                      { key:"HT_ISOLATED_MULT",       label:"半職孤立日倍率", def:2.5,  min:1, max:10,    step:0.1, cat:"軟規則", tip:"半職的孤立上班日 penalty × 倍率(半職工作天少易被排孤立日)" },
                      { key:"ISOLATED_MAX_TOTAL",     label:"孤立日總數硬上限",def:0,   min:0, max:100,   cat:"軟規則",   tip:"全體護理師的 OFF-上班-OFF 總數硬上限;0=不限制;設 10 就是全體 ≤10 天" },
                      { key:"ISO_MAX_PER_NURSE",      label:"每人孤立日硬上限",def:1,   min:0, max:10,    cat:"軟規則",   tip:"H17:每位全職護理師整週期的孤立日 ≤ 此值;0=不限制;預設 1(半職除外)" },
                      { key:"SHORT_BLOCK_PENALTY",    label:"短塊(1-2天)罰",   def:2000, min:0, max:20000, cat:"塊狀",     tip:"S8:同種班連續 1-2 天每塊罰(D/E/N 各自算);全職套用" },
                      { key:"MID_BLOCK_REWARD",       label:"中塊(3-4天)獎勵", def:500,  min:0, max:20000, cat:"塊狀",     tip:"S9:同種班連續 3-4 天每塊獎勵(建模時取負);讓 solver 主動堆中塊" },
                      { key:"LONG_BLOCK_PENALTY",     label:"長塊(≥5天)罰",    def:800,  min:0, max:20000, cat:"塊狀",     tip:"S10:同種班連續 ≥5 天每塊罰(疲勞管理)" },
                      { key:"TWO_OFF_EXTRA_REWARD",   label:"多連2OFF獎勵",    def:500,  min:0, max:20000, cat:"塊狀",     tip:"H16 額外:每多一次連續 2 天 OFF pair 獎勵(OFF-OFF-OFF 算 2 對,鼓勵 OFF 塊狀化)" },
                      { key:"OVER_OFF_PENALTY_HALF",  label:"半職超休罰",     def:500,  min:0, max:20000, cat:"軟規則",   tip:"半職 OFF 天數超過應休 quota 每天罰(通常低於全職,鼓勵 solver 給半職多 OFF)" },
                      { key:"OVER_OFF_PENALTY_FULL",  label:"全職超休罰",     def:1500, min:0, max:20000, cat:"軟規則",   tip:"全職 OFF 天數超過應休 quota 每天罰(比半職重 → 多餘 OFF 優先給半職填滿)" },
                      { key:"SLACK_PENALTY_HALF",     label:"半職縮減應休罰", def:1000, min:0, max:20000, cat:"軟規則",   tip:"半職使用 off_slack(未達應休)每天罰(拉高 → 強逼給半職滿 OFF,配 OVER_OFF_HALF 低)" },
                      { key:"SLACK_PENALTY_FULL",     label:"全職縮減應休罰", def:200,  min:0, max:20000, cat:"軟規則",   tip:"全職使用 off_slack(未達應休)每天罰(低於半職是刻意的:如果非要縮就縮全職)" },
                      { key:"MENTOR_FOLLOW_PENALTY",  label:"新人跟隨導師",   def:5000, min:0, max:20000, cat:"新人",     tip:"新人每天與導師不同班每格罰(要 ≥ EXCESS_SWITCH 才會真的跟)" },
                      { key:"SMOOTH_SWITCH_MULT",     label:"smooth 換班倍率",def:2,    min:1, max:5,     step:0.1, cat:"版本倍率", tip:"順班優先版的換班懲罰乘倍率(1.5~2.5 為佳)" },
                      { key:"FAIR_DIST_MULT",         label:"fair 比例倍率",  def:2,    min:1, max:5,     step:0.1, cat:"版本倍率", tip:"公平優先版的比例懲罰乘倍率" },
                      { key:"MAIN_SOLVE_SECONDS",     label:"求解時限(秒)",   def:90,   min:30,max:600,   cat:"求解器",   tip:"CP-SAT 每個 profile 最多跑幾秒才停(90/180 各有優缺)" },
                      { key:"MAIN_SOLVE_WORKERS",     label:"求解 CPU 數",    def:4,    min:1, max:16,    cat:"求解器",   tip:"CP-SAT 平行執行緒數(Hobby 給的 vCPU 越多可越大)" },
                    ];
                    const PRESET_ALPHA: Record<string, number> = {
                      EXCESS_SWITCH_PENALTY: 5000,
                      SMOOTH_SWITCH_MULT: 1.5,
                      DIST_PENALTY: 500,
                      MAIN_SOLVE_SECONDS: 180,
                    };
                    const cats = Array.from(new Set(PENALTY_META.map(m => m.cat)));
                    return (
                      <details style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px" }}>
                        <summary style={{ cursor:"pointer", fontWeight:700, color:"#334155", fontSize:14 }}>
                          ⚙ 進階調參(懲罰值)　<span style={{ color:"#94a3b8", fontWeight:500, fontSize:12 }}>一般不需調;調完儲存排班規則即生效</span>
                        </summary>
                        <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:14 }}>
                          {/* 預設方案按鈕列 */}
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                            <button className="btn btn-sm" style={{ background:"#2563eb", color:"#fff" }}
                              onClick={() => setPenaltyForm(PRESET_ALPHA)}>套用 α 方案</button>
                            <button className="btn btn-sm btn-gray"
                              onClick={() => setPenaltyForm({})}>全部重置為原廠預設</button>
                            <span style={{ fontSize:11, color:"#9ca3af", alignSelf:"center", marginLeft:6 }}>
                              α = EXCESS 5000 / SMOOTH_MULT 1.5 / DIST 500 / SOLVE 180s(順班拉高、fair 比例修 bug)
                            </span>
                          </div>
                          {cats.map(cat => (
                            <div key={cat}>
                              <div style={{ fontSize:12, fontWeight:700, color:"#64748b", marginBottom:6, borderBottom:"1px dashed #cbd5e1", paddingBottom:3 }}>
                                {cat}
                              </div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 100px auto", gap:8, alignItems:"center", fontSize:13 }}>
                                {PENALTY_META.filter(m => m.cat === cat).map(m => {
                                  const v = penaltyForm[m.key];
                                  return (
                                    <Fragment key={m.key}>
                                      <label title={m.tip} style={{ color:"#374151", cursor:"help" }}>
                                        {m.label}
                                        <span style={{ fontSize:10, color:"#94a3b8", marginLeft:4 }}>({m.key})</span>
                                      </label>
                                      <input
                                        type="number"
                                        className="finput finput-sm"
                                        value={v ?? ""}
                                        placeholder={String(m.def)}
                                        min={m.min}
                                        max={m.max}
                                        step={m.step ?? 1}
                                        onChange={e => {
                                          const s = e.target.value;
                                          setPenaltyForm(p => {
                                            if (s === "") { const { [m.key]:_, ...rest } = p; return rest; }
                                            return { ...p, [m.key]: Number(s) };
                                          });
                                        }}
                                        style={{ textAlign:"right" }}
                                      />
                                      <span style={{ fontSize:11, color:"#94a3b8" }}>預設 {m.def}</span>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-gray"
                                        style={{ padding:"3px 8px", fontSize:11 }}
                                        onClick={() => setPenaltyForm(p => { const { [m.key]:_, ...rest } = p; return rest; })}
                                        title="清除此欄位使用預設值"
                                      >重置</button>
                                    </Fragment>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <div style={{ fontSize:11, color:"#64748b", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, padding:"6px 10px" }}>
                            💡 空欄位＝用預設值。優先順序:此頁設定 &gt; Railway env &gt; 硬編預設。調完按下方「儲存排班規則」才會生效。
                          </div>
                        </div>
                      </details>
                    );
                  })()}

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

          </div>
        )}

        {/* ══════════════════════════════════
            Tab: 規則總覽（唯讀說明）
        ══════════════════════════════════ */}
        {tab === "rules_overview" && (() => {
          type Row = { no: string; title: string; desc?: string };
          // H11 動態抓取「班別設定 → 放假/調整類」目前設定的代碼
          const _offCodes = offShifts.map(s => s.code).filter(Boolean);
          const H11_DESC = _offCodes.length
            ? `目前包含：${_offCodes.join("、")}（來自「班別設定 → 放假/調整類」，自動同步）。最高優先鎖定，不佔應休名額`
            : "尚未設定放假/調整類班別（請至「班別設定」新增）";
          // H14 行政班也從「上班類」自動抓（admin_only 或非 D/E/N 的 code）
          const _adminCodes = workShifts.filter(s => s.code && (s.admin_only || !["D","E","N"].includes(s.code))).map(s => s.code);
          const H14_DESC = _adminCodes.length
            ? `目前包含：${_adminCodes.join("、")}（來自「班別設定 → 上班類」的 admin_only 或非 D/E/N 代碼）。視同 D 套用所有 D 規則（反向班、連上等），但不佔臨床人數、leader 名額`
            : "尚未設定行政類上班班別";
          const HARD: Row[] = [
            { no:"H1",  title:"每班每日恰好符合設定人數", desc:"預設 D/E/N 各 3 人（可覆蓋，見特殊日期）；行政班、新人不計入。湊不齊會生成失敗" },
            { no:"H2",  title:"已填班別一律保留", desc:"含未確認的預填，不覆蓋、只填空白格" },
            { no:"H3",  title:"反向班禁止", desc:"E→D 隔 1 天休；N→E 隔 1 天休；N→D 隔 2 天休。固定啟用、不可關閉" },
            { no:"H4",  title:"每週 D/E/N 至多兩種班別", desc:"預填出現班屬外班別時，該週自動改為「例外+一種原班」" },
            { no:"H5",  title:"每週至少 1 天休", desc:"底線，恆常生效（OFF 或半）" },
            { no:"H6",  title:"一例一休（每週至少 2 天休）", desc:"勾選時硬性；湊不出會失敗。不勾則不強制下限，但 H5 仍在" },
            { no:"H7",  title:"每班每日至少 1 位 leader", desc:"行政班、新人的 leader 不算" },
            { no:"H8",  title:"每班每日至少 2 位 leader/second", desc:"受當班需求人數上限 min(2, 需求)；行政班、新人不算" },
            { no:"H9",  title:"連續上班天數不超過設定值", desc:"預設 5 天，跨週累計（含上週歷史）" },
            { no:"H10", title:"輪班屬性限制 + 固定班偏離", desc:"輪班DE 只排 D/E 等；勾「允許固定班偏離」＝最多 2 格，未勾＝0 格。公平優先版一律 0 格" },
            { no:"H11", title:"放假/調整類最高優先鎖定", desc:H11_DESC },
            { no:"H12", title:"半職視同應休", desc:"計入應休天數" },
            { no:"H13", title:"班次比例硬上限 ±2 天", desc:"各班種天數偏離理想比例最多 ±2 天（例 10:10 極限 8:12，不會 7:13）。全職半職皆同" },
            { no:"H14", title:"行政類上班：視同 D、不計人力", desc:H14_DESC },
            { no:"H15", title:"新人不計臨床人力", desc:"新人=在學習的正式員工：照所有規則排、但 H1/H7/H8 排除。跟隨導師見 S6" },
            { no:"H16", title:"每週期至少一次連續 2 天 OFF", desc:"全職硬規則:週期內至少存在一次「OFF-OFF」（可跨週,如週日→週一 OK;僅不跨週期）；半職不套用。V/員/喪等 LEAVE_ADJUST 天不算入配對。額外獎勵:每多一次連 2 OFF -500（鼓勵 OFF 塊狀化,OFF-OFF-OFF 算 2 對）" },
            { no:"H17", title:"每人孤立日 ≤ 1", desc:"全職硬規則:每人整週期內「OFF-上班-OFF」孤立上班日最多 1 天；半職不套用（工作天少、密度稀,天然易孤立）。與 S2 軟罰疊加,但硬性擋掉過多" },
          ];
          const QUOTA: Row[] = [
            { no:"R1", title:"應休天數公式", desc:"全職 = 8 + 國定假日（最多 13）；半職 = 28 − ⌊(160 − 國定×8)÷2÷8⌋（可上天數捨去）" },
            { no:"R2", title:"應休下限為軟約束", desc:"人力不足時最多縮減 2 天;縮減每天罰:半職 +1000、全職 +200(強逼填滿半職);超休每天罰:半職 +500、全職 +1500(多餘 OFF 優先給半職);縮減不公另扣 400" },
          ];
          const LEAVE: Row[] = [
            { no:"L1", title:"指定休不可覆蓋", desc:"管理員標記的 OFF 不被生成取代" },
            { no:"L2", title:"第一天鎖定", desc:"週期第一天已有記錄時不被覆蓋" },
            { no:"L3", title:"自動休連續上限 N 天", desc:"系統排的休假不超過 N 天連休（指定休可切斷、放假/調整類也自動中斷；半職不受限）" },
            { no:"L4", title:"連續 OFF 總上限", desc:"指定休+自動休合計連休不得超過設定值（放假/調整類自動中斷；半職不受限）" },
          ];
          const SOFT: (Row & { penalty?: string })[] = [
            { no:"S1", title:"順班", desc:"只罰「多餘換班」+「沒休就換」；輪班必要換班不罰（見下表）", penalty:"1500 / 500" },
            { no:"S2", title:"避免孤立上班日", desc:"OFF-上班-OFF（只出來上一天班）;半職 ×2.5 加重。全職硬上限 ≤1/人（見 H17）；仍保留軟罰疊加", penalty:"+750" },
            { no:"S3", title:"固定班偏離", desc:"偏離固定班種每格；並硬性最多 2 格（H10）", penalty:"+500 / 格" },
            { no:"S4", title:"班次比例偏差", desc:"各護理師班次數接近設定比例（±1 天彈性，硬上限 ±2 見 H13）", penalty:"+900 / 單位" },
            { no:"S5", title:"應休縮減公平性", desc:"各護理師縮減幅度差距（配合 R2）", penalty:"+400" },
            { no:"S6", title:"新人跟隨導師", desc:"新人每天與導師不同班每格扣分；懲罰值高於 S1/S4，確保跟得住。遇新人自己請假可彈性偏離", penalty:"+3000 / 天" },
            { no:"S7", title:"每週標準休超額（凸性）", desc:"全職每週 OFF 超過 2 天就扣分（配合 H6 逼收斂為剛好 2）。3 層門檻遞增，逼多餘休假平均攤開。半職不套用", penalty:"+500 × 3 層" },
            { no:"S8", title:"短塊懲罰（塊狀化）", desc:"同種上班班（D/E/N 各自）連續 1-2 天算「短塊」，每個罰 2000。目的：避免 D-OFF-D-OFF-D 這種碎片。全職套用；OFF/半/V/員/喪等會斷開塊", penalty:"+2000 / 塊" },
            { no:"S9", title:"中塊獎勵（甜蜜區）", desc:"同種班連續 3-4 天算「中塊」，每個獎勵 -500（負罰）。solver 會主動堆中塊而非只是「避免短塊」的副作用", penalty:"-500 / 塊" },
            { no:"S10", title:"長塊懲罰（疲勞管理）", desc:"同種班連續 ≥5 天算「長塊」，每個罰 800。避免連上太久疲勞（H9 連上限預設 5 天已硬擋更長）", penalty:"+800 / 塊" },
          ];
          // 前端硬擋：不進 CP-SAT，在護理師預班階段就擋住
          const FRONT: Row[] = [
            { no:"F1", title:"首個週末不同時休", desc:"全職預班時，週期第一個週六 + 週日不可同時填 OFF（只算 OFF、半職不受限）。自動排班不受此限" },
            { no:"F2", title:"預班上限", desc:"全職預班的 D/E/N/OFF 總數不得超過設定上限（半、特休等放假/調整類不計；半職不受限）" },
          ];
          // 可設定參數（後台「排班規則」分頁可調）
          const CFG_CHIPS: { k: string; v: string }[] = [
            { k:"各班每日人數",         v:"D／E／N 每日需求（預設 3／3／3）" },
            { k:"特殊日期人數覆蓋",     v:"某天可覆蓋不同 D/E/N（如國定假）" },
            { k:"連續上班上限",         v:"預設 5 天，跨週累計（H9）" },
            { k:"一例一休",             v:"每週 ≥2 天休（H6）" },
            { k:"允許固定班偏離",       v:"勾＝最多 2 格、未勾＝0（H10）" },
            { k:"每人休假上限",         v:"預班可填的總天數上限（F2）" },
            { k:"自動休每週上限",       v:"系統排的連休天數（L3）" },
            { k:"含指定休每週上限",     v:"指定休 + 自動休合計（L4）" },
            { k:"第一天鎖定",           v:"週期首日既有記錄不被覆蓋（L2）" },
            { k:"指定休不可覆蓋",       v:"管理員標的 OFF 不被取代（L1）" },
            { k:"首個週末不同時休",     v:"前端預班硬擋（F1）" },
            { k:"輪班比例",             v:"各屬性 D/E/N 比例，可個別覆蓋（S4）" },
          ];

          const COLORS = {
            hard:  { bar:"#dc2626", badge:"#fee2e2", badgeText:"#b91c1c", head:"#7f1d1d" },
            quota: { bar:"#2563eb", badge:"#dbeafe", badgeText:"#1d4ed8", head:"#1e3a8a" },
            leave: { bar:"#059669", badge:"#d1fae5", badgeText:"#047857", head:"#064e3b" },
            soft:  { bar:"#d97706", badge:"#fef3c7", badgeText:"#b45309", head:"#78350f" },
            front: { bar:"#7c3aed", badge:"#ede9fe", badgeText:"#6d28d9", head:"#4c1d95" },
            cfg:   { bar:"#64748b", badge:"#f1f5f9", badgeText:"#475569", head:"#334155" },
          };

          const ruleRow = (r: Row & { penalty?: string }, kind: keyof typeof COLORS, isLast: boolean) => (
            <div key={r.no} style={{
              display:"flex", gap:14, alignItems:"flex-start",
              padding:"12px 4px",
              borderBottom: isLast ? "none" : "1px dashed #f3f4f6",
            }}>
              <div style={{
                flex:"0 0 44px", height:26,
                background: COLORS[kind].badge, color: COLORS[kind].badgeText,
                fontWeight:800, fontSize:12, letterSpacing:0.3,
                display:"flex", alignItems:"center", justifyContent:"center",
                borderRadius:6,
              }}>{r.no}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14.5, fontWeight:700, color:"#111827", lineHeight:1.4 }}>
                  {r.title}
                </div>
                {r.desc && (
                  <div style={{ fontSize:12.5, color:"#6b7280", marginTop:4, lineHeight:1.7 }}>
                    {r.desc}
                  </div>
                )}
              </div>
              {"penalty" in r && r.penalty && (
                <div style={{
                  flex:"0 0 auto",
                  fontSize:11.5, color: COLORS.soft.badgeText,
                  background: COLORS.soft.badge, padding:"3px 8px",
                  borderRadius:999, fontWeight:700, whiteSpace:"nowrap",
                }}>{r.penalty}</div>
              )}
            </div>
          );

          const sectionCard = (
            kind: keyof typeof COLORS,
            title: string, subtitle: string,
            rows: (Row & { penalty?: string })[],
            extra?: React.ReactNode,
          ) => (
            <div style={{
              background:"#fff", borderRadius:12, overflow:"hidden",
              borderLeft: `4px solid ${COLORS[kind].bar}`,
              boxShadow:"0 1px 3px rgba(0,0,0,0.04)",
              border:"1px solid #e5e7eb", borderLeftWidth:4,
            }}>
              <div style={{
                padding:"14px 18px", borderBottom:"1px solid #f3f4f6",
                display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap",
              }}>
                <div style={{ fontSize:16, fontWeight:800, color: COLORS[kind].head }}>{title}</div>
                <div style={{ fontSize:12.5, color:"#9ca3af" }}>{subtitle}</div>
                <div style={{ marginLeft:"auto", fontSize:11.5, color:"#9ca3af" }}>共 {rows.length} 條</div>
              </div>
              <div style={{ padding:"4px 18px 12px" }}>
                {rows.map((r, i) => ruleRow(r, kind, i === rows.length - 1))}
              </div>
              {extra}
            </div>
          );

          const switchTable = (
            <div style={{
              margin:"0 18px 16px", padding:"12px 14px",
              background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8,
            }}>
              <div style={{ fontSize:12.5, fontWeight:700, color:"#78350f", marginBottom:8 }}>
                S1 順班懲罰對照表（每次）
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ background:"#fef3c7" }}>
                      <th style={{ padding:"6px 10px", textAlign:"left", color:"#78350f", fontWeight:700 }}>情境</th>
                      <th style={{ padding:"6px 10px", textAlign:"right", color:"#78350f", fontWeight:700, width:110 }}>懲罰值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding:"6px 10px", color:"#374151" }}>必要換班 + 有休</td><td style={{ padding:"6px 10px", textAlign:"right", color:"#059669", fontWeight:700 }}>0</td></tr>
                    <tr><td style={{ padding:"6px 10px", color:"#374151", borderTop:"1px solid #fde68a" }}>必要換班 + 沒休</td><td style={{ padding:"6px 10px", textAlign:"right", color:"#b45309", fontWeight:700, borderTop:"1px solid #fde68a" }}>+500</td></tr>
                    <tr><td style={{ padding:"6px 10px", color:"#374151", borderTop:"1px solid #fde68a" }}>多餘換班 + 有休</td><td style={{ padding:"6px 10px", textAlign:"right", color:"#b45309", fontWeight:700, borderTop:"1px solid #fde68a" }}>+1500</td></tr>
                    <tr><td style={{ padding:"6px 10px", color:"#374151", borderTop:"1px solid #fde68a" }}>多餘換班 + 沒休</td><td style={{ padding:"6px 10px", textAlign:"right", color:"#dc2626", fontWeight:700, borderTop:"1px solid #fde68a" }}>+2000</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize:11.5, color:"#78350f", marginTop:8, lineHeight:1.7 }}>
                必要換班數 = 班種數 − 1（固定班 0、2 種班 1、DEN 3 種 2 次）。輪班本來就必須換的次數不罰。
              </div>
            </div>
          );

          return (
            <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:880 }}>
              <div style={{
                padding:"12px 16px", background:"#eef2ff",
                border:"1px solid #c7d2fe", borderRadius:10,
                fontSize:13, color:"#3730a3", lineHeight:1.7,
              }}>
                本頁為排班演算法的<b>唯讀規則說明</b>，方便查閱。
                想調整「一例一休/固定班偏離/連續上班上限」等，請至上方「<b>排班規則</b>」分頁。
              </div>

              {sectionCard("hard",  "硬規則",   "違反即生成失敗（會提示衝突原因）", HARD)}
              {sectionCard("quota", "應休天數", "計算公式與縮減上限", QUOTA)}
              {sectionCard("leave", "休假規則", "OFF 鎖定與連休上限", LEAVE)}
              {sectionCard("soft",  "軟規則",   "人力允許時盡量遵守；每項有懲罰值", SOFT, switchTable)}
              {sectionCard("front", "前端硬擋", "護理師預班階段擋住，不進 CP-SAT；自動排班不受此限", FRONT)}

              {/* 可設定參數區（chip 樣式） */}
              <div style={{
                background:"#fff", borderRadius:12, overflow:"hidden",
                borderLeft: `4px solid ${COLORS.cfg.bar}`,
                boxShadow:"0 1px 3px rgba(0,0,0,0.04)",
                border:"1px solid #e5e7eb", borderLeftWidth:4,
              }}>
                <div style={{
                  padding:"14px 18px", borderBottom:"1px solid #f3f4f6",
                  display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap",
                }}>
                  <div style={{ fontSize:16, fontWeight:800, color: COLORS.cfg.head }}>可設定參數</div>
                  <div style={{ fontSize:12.5, color:"#9ca3af" }}>後台「排班規則」分頁可調整</div>
                  <div style={{ marginLeft:"auto", fontSize:11.5, color:"#9ca3af" }}>共 {CFG_CHIPS.length} 項</div>
                </div>
                <div style={{
                  padding:14, display:"grid",
                  gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",
                  gap:10,
                }}>
                  {CFG_CHIPS.map(c => (
                    <div key={c.k} style={{
                      background: COLORS.cfg.badge, border:"1px solid #e2e8f0",
                      borderRadius:10, padding:"10px 12px",
                    }}>
                      <div style={{ fontSize:13.5, fontWeight:700, color:"#111827" }}>{c.k}</div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:3, lineHeight:1.6 }}>{c.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

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
                  <label className="fcheck" style={{ margin:0 }}>
                    <input type="checkbox" checked={!!s.admin_only}
                      onChange={e => updateShiftDef(type, i, "admin_only", e.target.checked)} />
                    <span style={{ fontSize:12 }}>管理員才能填入</span>
                  </label>
                  {s.admin_only && (
                    <div style={{ fontSize:11, color:"#9ca3af", marginTop:4, paddingLeft:4 }}>🔒 此班別護理師不可自行填入</div>
                  )}
                </div>
                {/* 操作 */}
                <div style={{ marginLeft:"auto" }}>
                  <button className="btn btn-sm" style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca" }}
                    onClick={() => removeShift(type, i)}>刪除</button>
                </div>
              </div>
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

          // 一鍵生成頁籤只反映「已儲存至資料庫」的設定（generate 讀 DB），避免誤以為已儲存
          const dCycle = savedCycle ?? cycle;
          const dRules = savedRules ?? rulesForm;
          const dHd = dCycle.holiday_days;
          const dFullOff = Math.min(8 + dHd, 13);
          const dPartWork = Math.floor((160 - dHd * 8) / 2 / 8);
          const dPartOff = 28 - dPartWork;
          const dCycleIsSet = !!(dCycle.start_date && dCycle.end_date);
          const dPeriod = (dCycle.start_date && dCycle.end_date)
            ? dayjs(dCycle.end_date).diff(dayjs(dCycle.start_date), "day") + 1
            : dCycle.period_days;
          const dCycleDays = dCycleIsSet
            ? Array.from({ length: dPeriod }, (_, i) => dayjs(dCycle.start_date).add(i, "day").format("YYYY-MM-DD"))
            : [];

          const unconfirmedCount = schedule.filter(r => dCycleDays.includes(r.date) && !r.confirmed && r.shift).length;
          const confirmedCount   = schedule.filter(r => dCycleDays.includes(r.date) && r.confirmed && r.shift).length;
          const filledCount      = schedule.filter(r => dCycleDays.includes(r.date) && r.shift).length;

          function cancelGenerate() {
            genCanceledRef.current = true;
            try { genAbortRef.current?.abort(); } catch {}
          }

          async function runGenerate() {
            genCanceledRef.current = false;
            setGenerating(true);
            setGenResult(""); setCommitResult("");
            setGenVersions({}); setSelectedProfile(null);
            setConfirmGenerate(false);
            const results: Partial<Record<GenProfileKey, GenVersion>> = {};
            for (const p of GEN_PROFILES) {
              if (genCanceledRef.current) break;
              const controller = new AbortController();
              genAbortRef.current = controller;
              try {
                const hint = lastGenSchedules[p.key];   // 暖啟動：本 profile 上次的解
                const body = hint ? { hint_schedules: hint } : {};
                const { data } = await api.post(
                  `/schedule/generate?overwrite_confirmed=false&profile=${p.key}`,
                  body,
                  { signal: controller.signal },
                );
                results[p.key] = {
                  schedules: data.schedules,
                  cycle_dates: data.cycle_dates,
                  message: data.message ?? "完成",
                  warnings: data.warnings ?? [],
                  anomalies: data.anomalies ?? [],
                  prefill_warnings: data.prefill_warnings ?? [],
                  metrics: data.metrics ?? null,
                };
                setGenDemand(data.demand_config ?? null);
              } catch (err: any) {
                // 使用者取消 → 直接離開迴圈,不記為失敗
                if (genCanceledRef.current || err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
                  break;
                }
                results[p.key] = {
                  schedules: {}, cycle_dates: [], message: "", warnings: [], anomalies: [],
                  prefill_warnings: [], metrics: null,
                  error: err.response?.data?.detail ?? err.message ?? "生成失敗",
                };
              }
              setGenVersions({ ...results });
            }
            genAbortRef.current = null;
            setGenerating(false);
            // 更新暖啟動記憶（只記成功的版本；失敗的保留舊值以免下次拿不到 hint）
            const nextHints = { ...lastGenSchedules };
            for (const p of GEN_PROFILES) {
              const v = results[p.key];
              if (v && !v.error && v.schedules && Object.keys(v.schedules).length) {
                nextHints[p.key] = v.schedules;
              }
            }
            setLastGenSchedules(nextHints);
            const okCount = Object.values(results).filter(v => v && !v.error).length;
            if (genCanceledRef.current) {
              setGenResult(okCount === 0
                ? "⚠ 已取消生成"
                : `⚠ 已取消，保留已生成 ${okCount}／3 個版本`);
            } else {
              setGenResult(okCount === 0 ? "✗ 三個版本皆生成失敗" : `✓ 已生成 ${okCount}／3 個版本，請比較後選擇一版匯入`);
            }
          }

          async function runCommit() {
            if (!selectedProfile) return;
            const v = genVersions[selectedProfile];
            if (!v) return;
            setCommitting(true); setCommitResult("");
            try {
              const { data } = await api.post("/schedule/commit", {
                schedules: v.schedules, cycle_dates: v.cycle_dates, overwrite_confirmed: false,
              });
              setCommitResult(data.message ?? "匯入完成");
              setHasGenerated(true);
              setGenVersions({}); setSelectedProfile(null);
              setLastGenSchedules({});   // 匯入後暖啟動記憶失效（所有 cell 已鎖定，不再需要 hint）
              fetchSchedule();
            } catch (err: any) {
              setCommitResult("✗ " + (err.response?.data?.detail ?? err.message ?? "匯入失敗"));
            } finally { setCommitting(false); }
          }

          async function downloadVersionTemp(p: GenProfileKey) {
            const v = genVersions[p];
            if (!v) return;
            try {
              const { data } = await api.post("/export/temp", {
                schedules: v.schedules, cycle_dates: v.cycle_dates,
              }, { responseType: "blob" });
              const blobUrl = URL.createObjectURL(data);
              const link = document.createElement("a");
              link.href = blobUrl;
              const label = GEN_PROFILES.find(g => g.key === p)?.label ?? p;
              link.download = `暫時班表_${label}_${dCycle.start_date}_${dCycle.end_date}.xlsx`;
              link.click();
              URL.revokeObjectURL(blobUrl);
            } catch (err: any) {
              alert("匯出失敗：" + (err.response?.data?.detail ?? err.message ?? "網路錯誤"));
            }
          }

          async function downloadExport(type: "preview" | "schedule") {
            const token = getAuth()?.token;
            const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
            const url  = `${base}/export/${type}?_=${Date.now()}`;
            try {
              const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert("匯出失敗：" + (err.detail ?? res.statusText));
                return;
              }
              const blob = await res.blob();
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = blobUrl;
              link.download = type === "preview"
                ? `預假狀態_${dCycle.start_date}_${dCycle.end_date}.xlsx`
                : `完整班表_${dCycle.start_date}_${dCycle.end_date}.xlsx`;
              link.click();
              URL.revokeObjectURL(blobUrl);
            } catch (e: any) {
              alert("匯出失敗：" + (e.message ?? "網路錯誤"));
            }
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
                        ok={dCycleIsSet}
                        label={dCycleIsSet
                          ? `排班週期：${dCycle.start_date} ～ ${dCycle.end_date}（${dCycle.period_days} 天）`
                          : "尚未設定排班週期，請先至「排班週期」tab 設定"}
                      />
                      {(() => {
                        const _tr = schedulableNurses.filter(u => u.is_trainee).length;
                        const _cl = schedulableNurses.length - _tr;
                        const lbl = _tr > 0
                          ? `護理師人數：${schedulableNurses.length} 人（不含行政；臨床 ${_cl}、新人 ${_tr}）`
                          : `護理師人數：${schedulableNurses.length} 人（不含行政人員）`;
                        return <CheckItem ok={schedulableNurses.length > 0} label={lbl} />;
                      })()}
                      <CheckItem
                        ok={true}
                        label={`全職應休 ${dFullOff} 天｜半職應休 ${dPartOff} 天`}
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

                  {/* ── 人力試算 */}
                  {(() => {
                    const n = dCycle.period_days;
                    // 新人不佔臨床人力名額（H15）；人力試算只算非新人
                    const clinicalNurses = schedulableNurses.filter(u => !u.is_trainee);
                    const traineeCount = schedulableNurses.filter(u => u.is_trainee).length;
                    const fullNurses  = clinicalNurses.filter(u => !u.halftime).length;
                    const halfNurses  = clinicalNurses.filter(u =>  u.halftime).length;
                    // 非臨床/請假類已填班別統計：D/E/N/OFF/半 以外全部計入（未來新增班別自動涵蓋）
                    const _baseShifts = ["D", "E", "N", "OFF", "半"];
                    const _schedulableUids = new Set(schedulableNurses.map(u => u.uid));
                    const specialShiftCount = schedule.filter(r =>
                      dCycleDays.includes(r.date) && r.shift &&
                      !_baseShifts.includes(r.shift) && _schedulableUids.has(r.nurse_uid)
                    ).length;
                    const defaultDaily = dRules.daily_d + dRules.daily_e + dRules.daily_n;
                    // 特殊日期 map
                    const sdMap: Record<string, { d:number; e:number; n:number }> = {};
                    for (const sd of dRules.special_dates) {
                      if (sd.date) sdMap[sd.date] = sd;
                    }
                    // 逐日加總實際需求（正確公式）
                    const totalRequired = dCycleDays.reduce((acc, d) => {
                      const ov = sdMap[d];
                      return acc + (ov ? ov.d + ov.e + ov.n : defaultDaily);
                    }, 0);
                    const specialCount  = dCycleDays.filter(d => !!sdMap[d]).length;
                    // 各護理師可提供的上班天數
                    const totalAvailable =
                      fullNurses * (n - dFullOff) +
                      halfNurses * dPartWork;
                    // 多餘人力
                    const surplus = totalAvailable - totalRequired;
                    const color =
                      surplus < 0  ? { bg:"#fef2f2", border:"#fecaca", text:"#dc2626", badge:"#ef4444" } :
                      surplus === 0 ? { bg:"#f0fdf4", border:"#86efac", text:"#15803d", badge:"#22c55e" } :
                                     { bg:"#fffbeb", border:"#fde68a", text:"#92400e", badge:"#f59e0b" };
                    return (
                      <div style={{ background:color.bg, border:`1px solid ${color.border}`, borderRadius:10, padding:"14px 16px", fontSize:13 }}>
                        <div style={{ fontWeight:700, color:color.text, marginBottom:10, fontSize:14 }}>
                          人力試算
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 20px", fontSize:12, color:"#374151", marginBottom:10 }}>
                          <div>週期天數：<b>{n} 天</b></div>
                          <div>預設每日需求：<b>D{dRules.daily_d}＋E{dRules.daily_e}＋N{dRules.daily_n}＝{defaultDaily} 人</b></div>
                          <div>全職 {fullNurses} 人 × 可上 {n - dFullOff} 天 ＝ {fullNurses * (n - dFullOff)}</div>
                          <div>半職 {halfNurses} 人 × 可上 {dPartWork} 天 ＝ {halfNurses * dPartWork}</div>
                          {traineeCount > 0 && (
                            <div style={{ gridColumn:"1 / -1", fontSize:11, color:"#6b7280" }}>
                              另有 <b>{traineeCount}</b> 位新人參與排班（照規則排、跟隨導師）但不計入臨床人力
                            </div>
                          )}
                          <div>可提供總人力：<b>{totalAvailable}</b></div>
                          <div>需求總人力：<b>{totalRequired}</b>
                            {specialCount > 0 && <span style={{ color:"#6b7280", fontSize:11 }}>（含 {specialCount} 個特殊日）</span>}
                          </div>
                        </div>
                        {/* 非臨床/請假類已填班別統計（僅顯示，不影響多餘人力計算） */}
                        <div style={{ background:"rgba(0,0,0,0.04)", borderRadius:6, padding:"6px 10px", marginBottom:8, fontSize:12, color:"#374151" }}>
                          非臨床／請假類已填班別（D／E／N／OFF／半 以外，如 會／公／書／V／病／延休／調移…）：<b>{specialShiftCount} 格</b>
                        </div>
                        {/* 特殊日期明細 */}
                        {dRules.special_dates.filter(sd => sd.date && dCycleDays.includes(sd.date)).length > 0 && (
                          <div style={{ background:"rgba(0,0,0,0.04)", borderRadius:6, padding:"6px 10px", marginBottom:8, fontSize:11, color:"#374151" }}>
                            <b>特殊日期覆蓋：</b>
                            {dRules.special_dates.filter(sd => sd.date && dCycleDays.includes(sd.date)).map(sd => (
                              <span key={sd.date} style={{ marginLeft:8 }}>
                                {sd.date}（D{sd.d}E{sd.e}N{sd.n}）
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ fontSize:13, color:color.text, fontWeight:600 }}>
                            多餘人力 ＝ {totalAvailable} － {totalRequired} ＝
                          </div>
                          <div style={{
                            background: color.badge, color:"#fff",
                            borderRadius:6, padding:"2px 12px", fontSize:16, fontWeight:800,
                          }}>
                            {surplus >= 0 ? `+${surplus}` : surplus}
                          </div>
                        </div>
                        {surplus < 0 && (
                          <div style={{ marginTop:8, fontSize:12, color:"#dc2626", fontWeight:600 }}>
                            ⚠ 人力不足 {Math.abs(surplus)} 格，CP-SAT 可能無法生成班表。建議增加護理師人數或減少每日需求。
                          </div>
                        )}
                        {surplus > 0 && (
                          <div style={{ marginTop:8, fontSize:12, color:"#92400e" }}>
                            多出 {surplus} 格彈性空間，系統會自動分配為 OFF（優先補足護理師應休天數）。
                          </div>
                        )}
                        {surplus === 0 && (
                          <div style={{ marginTop:8, fontSize:12, color:"#15803d" }}>
                            人力剛好，系統無需補休。
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── 三個版本差異說明 */}
                  <div className="setting-section" style={{ background:"#f8fafc" }}>
                    <div className="setting-title">🎯 三個版本差異</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12, fontSize:13, color:"#374151", lineHeight:1.7 }}>
                      <div>
                        <span style={{ display:"inline-block", padding:"2px 10px", background:"#dbeafe", color:"#1d4ed8", borderRadius:999, fontWeight:800, fontSize:12, marginRight:6 }}>分數最高版</span>
                        <b style={{ color:"#6b7280", fontSize:12, fontWeight:500 }}>balanced · 預設 · 綜合平衡</b>
                        <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                          全部懲罰值用<b>原倍率</b>：換班 1500、比例 900、孤立 750、固定班 500…
                          總懲罰分數在三版中通常最低。適合大多數情況、想要各面向兼顧。
                        </div>
                      </div>
                      <div>
                        <span style={{ display:"inline-block", padding:"2px 10px", background:"#dcfce7", color:"#15803d", borderRadius:999, fontWeight:800, fontSize:12, marginRight:6 }}>順班優先版</span>
                        <b style={{ color:"#6b7280", fontSize:12, fontWeight:500 }}>smooth · 少換班</b>
                        <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                          <b>換班懲罰 ×2</b>(3000 / 1000)。求解器更用力壓「多餘換班」與「沒休就換」次數,
                          班表更整齊、每人的班種切換較少。代價:比例可能更偏、孤立日略多。
                        </div>
                      </div>
                      <div>
                        <span style={{ display:"inline-block", padding:"2px 10px", background:"#f3e8ff", color:"#6b21a8", borderRadius:999, fontWeight:800, fontSize:12, marginRight:6 }}>公平優先版</span>
                        <b style={{ color:"#6b7280", fontSize:12, fontWeight:500 }}>fair · 比例貼近理想</b>
                        <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                          <b>比例/公平懲罰 ×2</b>(1800 / 800),各護理師的 D/E/N 天數更貼近設定比例。
                          <b>固定班強制 0 偏離</b>(固定 D 只排 D,不受「允許固定班偏離」影響)。
                          代價:人力吃緊時可能生成失敗(fair 這版無解,不影響其他兩版)。
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── 生成原則說明（內建：已填班別一律保留） */}
                  <div className="setting-section">
                    <div style={{ fontSize:12, color:"#6b7280" }}>
                      已填班別（含未確認）一律保留，不得覆蓋，只填寫空白格子。將依序生成「分數最高版」「順班優先版」「公平優先版」三種供比較選擇。
                    </div>
                  </div>

                  {/* ── 生成按鈕 */}
                  {generating ? (
                    <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                      <div style={{ fontSize:13, color:"#1e40af" }}>
                        <b>生成中…</b>
                        <span style={{ color:"#64748b", marginLeft:6 }}>三個版本依序生成中,可能需要 1~3 分鐘</span>
                      </div>
                      <button
                        className="btn btn-sm"
                        style={{ background:"#dc2626", color:"#fff", fontWeight:700 }}
                        onClick={cancelGenerate}
                      >取消生成</button>
                    </div>
                  ) : confirmGenerate ? (
                    <div style={{ background:"#fef9c3", border:"1px solid #fde68a", borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:8 }}>
                        確定要生成班表嗎？將依序生成三個版本供比較（只填入空白格子，已填班別一律保留）
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button className="btn btn-gray btn-sm" onClick={() => setConfirmGenerate(false)}>取消</button>
                        <button className="btn btn-primary btn-sm" onClick={runGenerate}>確認生成</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ alignSelf:"flex-start" }}
                      disabled={!dCycleIsSet}
                      onClick={() => setConfirmGenerate(true)}>
                      一鍵生成排班
                    </button>
                  )}

                  {/* ── 生成結果 */}
                  {genResult && (
                    <div style={{
                      padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600,
                      background: genResult.startsWith("✗") ? "#fef2f2" : "#eff6ff",
                      color:      genResult.startsWith("✗") ? "#dc2626" : "#1e40af",
                      border:     `1px solid ${genResult.startsWith("✗") ? "#fecaca" : "#bfdbfe"}`,
                      whiteSpace: "pre-line", lineHeight: 1.8,
                    }}>{genResult}</div>
                  )}
                  {genDemand && !genResult.startsWith("✗") && (
                    <div style={{ fontSize:12, color:"#374151", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px" }}>
                      後端讀取設定確認：D={genDemand.daily_d}、E={genDemand.daily_e}、N={genDemand.daily_n}
                      {genDemand.special_dates_count > 0 && `（＋${genDemand.special_dates_count} 個特殊日期）`}
                      　總需求人力 = {genDemand.total_work_demand}
                    </div>
                  )}

                  {/* ── 三版比較區 */}
                  {Object.keys(genVersions).length > 0 && (
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      {GEN_PROFILES.map(p => {
                        const v = genVersions[p.key];
                        if (!v) return (
                          <div key={p.key} style={{ flex:"1 1 260px", minWidth:240, border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 14px", color:"#9ca3af", fontSize:13 }}>
                            {p.label} 生成中…
                          </div>
                        );
                        const isSelected = selectedProfile === p.key;
                        return (
                          <div key={p.key} style={{
                            flex:"1 1 260px", minWidth:240, borderRadius:10, padding:"12px 14px",
                            border: isSelected ? "2px solid #16a34a" : "1px solid #e5e7eb",
                            background: isSelected ? "#f0fdf4" : "#fff",
                          }}>
                            <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{p.label}</div>
                            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:8 }}>{p.desc}</div>
                            {v.error ? (
                              <div style={{ fontSize:12, color:"#dc2626", whiteSpace:"pre-line" }}>✗ {v.error}</div>
                            ) : (
                              <>
                                <div style={{ fontSize:12, color:"#374151", lineHeight:1.9 }}>
                                  <div>多餘換班：<b>{v.metrics?.excess_switches ?? "—"}</b>（總換班 {v.metrics?.switches ?? "—"}，已扣必要）</div>
                                  <div>孤立上班日：<b>{v.metrics?.isolated_days ?? "—"}</b></div>
                                  <div>最大比例偏差：<b>{v.metrics?.max_ratio_dev ?? "—"}</b> 天</div>
                                  {(v.warnings.length + v.anomalies.length + v.prefill_warnings.length) > 0 && (() => {
                                    const allWarns = [...v.prefill_warnings, ...v.warnings, ...v.anomalies];
                                    const open = !!warnOpen[p.key];
                                    return (
                                      <div>
                                        <div
                                          onClick={() => setWarnOpen(o => ({ ...o, [p.key]: !o[p.key] }))}
                                          style={{ color:"#b45309", cursor:"pointer", userSelect:"none", fontWeight:600 }}
                                        >
                                          {open ? "▼" : "▶"} 警告：{allWarns.length} 則（點擊{open ? "收合" : "查看"}）
                                        </div>
                                        {open && (
                                          <div style={{ marginTop:4, padding:"6px 8px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, maxHeight:180, overflowY:"auto" }}>
                                            {allWarns.map((w, i) => (
                                              <div key={i} style={{ fontSize:11, color:"#92400e", marginBottom:3, lineHeight:1.5 }}>• {w}</div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
                                  <button className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-gray"}`}
                                    onClick={() => setSelectedProfile(p.key)}>
                                    {isSelected ? "✓ 已選擇" : "選這版"}
                                  </button>
                                  <button className="btn btn-gray btn-sm" onClick={() => downloadVersionTemp(p.key)}>
                                    匯出暫時班表
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── 匯入確認區 */}
                  {selectedProfile && genVersions[selectedProfile] && !genVersions[selectedProfile]!.error && (
                    <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:"14px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#15803d", marginBottom:6 }}>
                        已選擇「{GEN_PROFILES.find(g => g.key === selectedProfile)?.label}」，班表尚未寫入
                      </div>
                      <div style={{ fontSize:12, color:"#166534", marginBottom:12 }}>
                        確認結果無誤後，點擊「匯入到班表」將班表寫入，再進行手動微調。
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={runCommit}
                        disabled={committing}
                        style={{ background:"#16a34a", borderColor:"#15803d" }}>
                        {committing ? "匯入中…" : "匯入到班表"}
                      </button>
                    </div>
                  )}

                  {/* ── 匯入結果 */}
                  {commitResult && (
                    <div style={{
                      padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600,
                      background: commitResult.startsWith("✗") ? "#fef2f2" : "#dcfce7",
                      color:      commitResult.startsWith("✗") ? "#dc2626" : "#15803d",
                      border:     `1px solid ${commitResult.startsWith("✗") ? "#fecaca" : "#bbf7d0"}`,
                    }}>{commitResult}</div>
                  )}

                  {/* ── 選定版本的詳細警告 */}
                  {selectedProfile && genVersions[selectedProfile] && (() => {
                    const v = genVersions[selectedProfile]!;
                    return (
                      <>
                        {v.prefill_warnings.length > 0 && (
                          <div style={{ background:"#fefce8", border:"1px solid #fde047", borderRadius:10, padding:"12px 16px", fontSize:13 }}>
                            <div style={{ fontWeight:700, color:"#854d0e", marginBottom:6 }}>⚠ 預填班別與輪班屬性不符（已保留，CP-SAT 將於後續天數導正）</div>
                            {v.prefill_warnings.map((w, i) => <div key={i} style={{ color:"#854d0e", marginBottom:2 }}>{w}</div>)}
                          </div>
                        )}
                        {v.warnings.length > 0 && (
                          <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"12px 16px", fontSize:13 }}>
                            <div style={{ fontWeight:700, color:"#92400e", marginBottom:6 }}>人力不足警告</div>
                            {v.warnings.map((w, i) => <div key={i} style={{ color:"#92400e" }}>{w}</div>)}
                            <div style={{ fontSize:12, color:"#b45309", marginTop:6 }}>應休天數已平均縮減，請確認後再送出確認。</div>
                          </div>
                        )}
                        {v.anomalies.length > 0 && (
                          <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 16px", fontSize:13 }}>
                            <div style={{ fontWeight:700, color:"#dc2626", marginBottom:6 }}>異常標示</div>
                            {v.anomalies.map((a, i) => <div key={i} style={{ color:"#dc2626" }}>{a}</div>)}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* ── 匯出區塊 */}
                  <div className="setting-section">
                    <div className="setting-title">匯出 Excel（.xlsx）</div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <div>
                        <button
                          className="btn btn-gray"
                          disabled={!dCycleIsSet}
                          onClick={() => downloadExport("preview")}>
                          匯出預假狀態
                        </button>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>目前所有護理師已填寫的班別</div>
                      </div>
                      <div>
                        <button
                          className="btn btn-gray"
                          disabled={!dCycleIsSet || !hasGenerated}
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
                    if (e.target.value === "all") {
                      setClearLogsConfirm({ hours: 0, label: "全部紀錄", all: true });
                    } else {
                      const hours = parseInt(e.target.value);
                      const labels: Record<string,string> = { "24":"一天之外","72":"三天之外","168":"一週之外","720":"一個月之外" };
                      setClearLogsConfirm({ hours, label: labels[e.target.value] ?? e.target.value });
                    }
                    e.target.value = "";
                  }}
                  style={{ fontSize:12, border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 8px", background:"#f9fafb", fontFamily:"inherit", cursor:"pointer" }}>
                  <option value="">清除紀錄…</option>
                  <option value="24">一天之外</option>
                  <option value="72">三天之外</option>
                  <option value="168">一週之外</option>
                  <option value="720">一個月之外</option>
                  <option value="all">全部紀錄</option>
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

      {/* ── 班表還原三選項確認 Dialog */}
      {revertConfirm && (
        <Dialog
          title={
            revertConfirm === "clear"         ? "清除所有 CP-SAT 生成內容" :
            revertConfirm === "clearCycle"    ? "清除預班週期內所有填寫內容" :
            revertConfirm === "restore"       ? "恢復到上次 CP-SAT 生成的內容" :
            revertConfirm === "restoreManual" ? "恢復確認送出及待確認的內容" :
            "清除半年之外所有班表"
          }
          body={
            <div style={{ fontSize:13, color:"#374151", lineHeight:1.6 }}>
              {revertConfirm === "clear" && <>將清除本次一鍵生成新增的班別，只保留人員原本填寫的內容。執行前會自動備份，可用「恢復確認送出及待確認的內容」還原。</>}
              {revertConfirm === "clearCycle" && <>將清除預班週期內<b>所有</b>班別（含已確認）。執行前會自動備份，可用「恢復確認送出及待確認的內容」還原。</>}
              {revertConfirm === "restore" && <>將刪除週期內目前所有班別，還原成上次一鍵生成當下的完整結果。執行前會自動備份目前內容。</>}
              {revertConfirm === "restoreManual" && <>將刪除週期內目前所有班別，還原成最近一次清除/還原操作之前的內容（含確認送出與待確認的班別）。</>}
              {revertConfirm === "purge" && <span style={{ color:"#dc2626" }}>將永久刪除半年（182 天）以前的所有班表資料，釋放資料庫空間。此動作無法復原，且與目前排班週期無關。</span>}
            </div>
          }
          actions={[
            { label: "取消", onClick: () => setRevertConfirm(null) },
            { label: reverting ? "處理中…" : "確定執行", danger: true, onClick: async () => {
              const action = revertConfirm;
              setRevertConfirm(null);
              setReverting(true);
              setRevertResult("");
              const endpoint =
                action === "clear"         ? "/schedule/clear-generated" :
                action === "clearCycle"    ? "/schedule/clear-cycle" :
                action === "restore"       ? "/schedule/restore-generated" :
                action === "restoreManual" ? "/schedule/restore-manual" :
                "/schedule/purge-old";
              try {
                const { data } = await api.post(endpoint);
                setRevertResult(data.message ?? "✓ 完成");
                if (action !== "purge") fetchSchedule();
              } catch (err: any) {
                setRevertResult("✗ " + (err.response?.data?.detail ?? err.message ?? "操作失敗"));
              } finally {
                setReverting(false);
              }
            }},
          ]}
        />
      )}

      {/* ── 班別選擇 Modal */}
      {popup && (
        <ShiftModal
          date={popup.date}
          nurseName={popup.nurseName}
          current={schedule.find(r=>r.nurse_uid===popup.nurseUid&&r.date===popup.date)?.shift ?? ""}
          workShifts={workShifts}
          restShifts={restShifts}
          offShifts={offShifts}
          onSelect={async (shift) => {
            // 先讀取再關閉，避免 popup 被清空後取不到值
            const nurseUid = popup!.nurseUid;
            const date     = popup!.date;
            const nurseName = popup!.nurseName;
            console.log("[onSelect] shift=", shift, "nurseUid=", nurseUid, "date=", date);
            setPopup(null);
            // 屬性衝突警告
            if (shift) {
              const nurse = nurseUsers.find(u => u.uid === nurseUid);
              if (nurse && isAttrConflict(shift, nurse.attr)) {
                const allowed = attrShifts(nurse.attr);
                const allowedLabel = allowed.length ? allowed.join("/") : nurse.attr;
                showToast(`⚠ ${nurseName} 的輪班屬性為 ${nurse.attr}（只排 ${allowedLabel}），${date} 填入 ${shift} 與屬性不符，CP-SAT 將保留此格並於後續導正`, false);
              }
            }
            await updateShift(nurseUid, date, shift);
          }}
          onClose={() => setPopup(null)}
        />
      )}

      {/* ── 修改已確認格子警告 */}
      {confirmEdit && (
        <Dialog
          title="你真的要修改已送出的班別？"
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
                  <select className="finput" value={editForm.attr ?? "輪班DEN"} disabled={editForm.admin_staff}
                    style={editForm.admin_staff ? disabledSelStyle : undefined}
                    onChange={e => setEditForm(p=>({...p,attr:e.target.value}))}>
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
                  <select className="finput" value={editForm.level ?? ""} disabled={editForm.admin_staff}
                    style={editForm.admin_staff ? disabledSelStyle : undefined}
                    onChange={e => setEditForm(p=>({...p,level:e.target.value}))}>
                    <option value="leader">leader</option>
                    <option value="second">second</option>
                    <option value="member">member</option>
                  </select>
                </div>
                {editUser && editUser.role !== "superadmin" && (
                  <div>
                    <label className="flabel">角色</label>
                    <select className="finput" value={editForm.role ?? ""} disabled={editForm.admin_staff}
                      style={editForm.admin_staff ? disabledSelStyle : undefined}
                      onChange={e => setEditForm(p=>({...p,role:e.target.value}))}>
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
                <input type="checkbox" checked={editForm.halftime ?? false} disabled={editForm.admin_staff}
                  onChange={e => setEditForm(p=>({...p,halftime:e.target.checked}))} />
                <span style={{ fontSize:13, color: editForm.admin_staff ? "#9ca3af" : undefined }}>半職人員（以半職公式計算應休天數）</span>
              </label>
              <label className="fcheck">
                <input type="checkbox" checked={editForm.admin_staff ?? false}
                  onChange={e => setEditForm(p=> e.target.checked
                    ? ({...p, admin_staff:true, role:"nurse", level:"member", halftime:false})
                    : ({...p, admin_staff:false}))} />
                <span style={{ fontSize:13 }}>行政人員（可預班，但不參與一鍵生成）</span>
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
          title={clearLogsConfirm.all ? "確定要清除所有操作紀錄嗎？" : `確定要清除「${clearLogsConfirm.label}」的操作紀錄？`}
          body={clearLogsConfirm.all ? "此動作無法復原，將刪除全部操作紀錄。" : "此操作無法復原，將刪除指定時間點之前的所有操作紀錄。"}
          actions={[
            { label:"取消", onClick:() => setClearLogsConfirm(null) },
            { label:"確認清除", danger:true, onClick:() => clearLogs(clearLogsConfirm.hours, clearLogsConfirm.all) },
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
          restShifts={restShifts}
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
          restShifts={restShifts}
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
    </div>
  );
}
