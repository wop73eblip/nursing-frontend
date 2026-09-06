import { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import api from "../api";
import { getAuth, clearAuth } from "../auth";

const DEFAULT_WORK = ["D", "E", "N", "會", "公", "書記"];
const DEFAULT_REST = ["OFF", "半"];                              // 應休類
const DEFAULT_OFF  = ["V", "喪", "員", "延休", "補休", "調移"];   // 放假/調整類
const DOW_ZH       = ["日","一","二","三","四","五","六"];

function isOffFn(s: string, offShifts: string[]) { return offShifts.includes(s); }
function shiftColor(s: string, offShifts: string[]) { return isOffFn(s, offShifts) ? "#dc2626" : "#111827"; }
function attrShort(attr: string): string {
  if (!attr) return "";
  if (attr.startsWith("固定")) return attr.slice(2);
  if (attr.startsWith("輪班")) return attr.slice(2);
  const m = attr.match(/([DENden]+)$/);
  if (m) return m[1].toUpperCase();
  return attr;
}

const ATTR_ALLOWED: Record<string, string[]> = {
  "輪班DE":  ["D","E"],
  "輪班EN":  ["E","N"],
  "輪班DN":  ["D","N"],
  "輪班DEN": ["D","E","N"],
  "固定D":   ["D"],
  "固定E":   ["E"],
  "固定N":   ["N"],
  "白班":    ["D"],
  "小夜":    ["E"],
  "大夜":    ["N"],
};

function attrMismatchMsg(shift: string, attr: string, offCodes: string[]): string | null {
  if (!shift || !attr) return null;
  if (offCodes.includes(shift)) return null;
  // 會/公/書記 性質等同 D
  const effectiveShift = ["會", "公", "書記"].includes(shift) ? "D" : shift;
  const allowed = ATTR_ALLOWED[attr];
  if (!allowed) return null; // 未知屬性，不標示
  if (!allowed.includes(effectiveShift))
    return `選取的班別與輪班屬性「${attr}」不符（允許：${allowed.join("/")}）`;
  return null;
}

function cellStyleFor(
  shift: string | undefined,
  confirmed: boolean,
  isSaving: boolean,
  mismatch: boolean,
  offShifts: string[],
  isAdminFilled = false,
): { cls: string; style: React.CSSProperties } {
  let cls = "cell-span";
  let style: React.CSSProperties = {};
  if (isSaving) {
    cls += " is-saving";
  } else if (!shift) {
    cls += " is-empty";
  } else if (mismatch) {
    style = confirmed
      ? { background: "#854d0e", borderColor: "#713f12", color: "#fff" }
      : { background: "#fef9c3", borderColor: "#eab308", color: "#713f12" };
  } else if (isAdminFilled) {
    // 管理員填入：藍色系
    style = confirmed
      ? { background: "#1e40af", borderColor: "#1e3a8a", color: "#fff" }
      : { background: "#dbeafe", borderColor: "#3b82f6", color: shiftColor(shift, offShifts) };
  } else {
    // 護理師填入：綠色系
    style = confirmed
      ? { background: "#166534", borderColor: "#14532d", color: "#fff" }
      : { background: "#dcfce7", borderColor: "#16a34a", color: shiftColor(shift, offShifts) };
  }
  return { cls, style };
}

// ─── 班別選擇 Modal
function ShiftPopup({
  date, current, userAttr, workShifts, restShifts, offShifts, onSelect, onClose,
}: {
  date: string;
  current: string;
  userAttr: string;
  workShifts: string[];
  restShifts: string[];
  offShifts: string[];
  onSelect: (s: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [warnShift, setWarnShift] = useState<string | null>(null);

  useEffect(() => {
    function down(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (!warnShift) onClose();
      }
    }
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [onClose, warnShift]);

  function handleClick(s: string) {
    const warn = attrMismatchMsg(s, userAttr, [...restShifts, ...offShifts]);
    if (warn) {
      setWarnShift(s);
    } else {
      onSelect(s);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: "5px 12px", borderRadius: 7, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", transition: "border-color .1s, background .1s",
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.35)",
      zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div ref={ref} style={{
        background: "#fff", border: "1px solid #d1d5db",
        borderRadius: 14, boxShadow: "0 16px 48px rgba(0,0,0,.22)",
        padding: "16px 16px 12px", width: "100%", maxWidth: 300, userSelect: "none",
      }}>
        {/* 屬性不符警告 */}
        {warnShift ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
              ⚠ 與輪班屬性不符
            </div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 16, lineHeight: 1.6 }}>
              班別「<b>{warnShift}</b>」與您的輪班屬性「<b>{userAttr}</b>」不符。<br />
              是否仍要填入？
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setWarnShift(null)} style={{
                ...btnBase, flex: 1,
                background: "#f3f4f6", color: "#374151", border: "1.5px solid #e5e7eb",
              }}>取消</button>
              <button onClick={() => { onSelect(warnShift); setWarnShift(null); }} style={{
                ...btnBase, flex: 1,
                background: "#f59e0b", color: "#fff", border: "1.5px solid #d97706",
              }}>仍要填入</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{date} 班別</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 700, marginBottom: 6 }}>上班</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {workShifts.map(s => (
                <button key={s} onClick={() => handleClick(s)} style={{
                  ...btnBase, color: "#111827",
                  border: current === s ? "2px solid #2563eb" : "1.5px solid #e5e7eb",
                  background: current === s ? "#eff6ff" : "#f9fafb",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>應休</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {restShifts.map(s => (
                <button key={s} onClick={() => handleClick(s)} style={{
                  ...btnBase, color: "#dc2626",
                  border: current === s ? "2px solid #dc2626" : "1.5px solid #fecaca",
                  background: current === s ? "#fef2f2" : "#fff5f5",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>放假 / 調整</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {offShifts.map(s => (
                <button key={s} onClick={() => handleClick(s)} style={{
                  ...btnBase, color: "#dc2626",
                  border: current === s ? "2px solid #dc2626" : "1.5px solid #fecaca",
                  background: current === s ? "#fef2f2" : "#fff5f5",
                }}>{s}</button>
              ))}
            </div>
            {current && (
              <>
                <div style={{ borderTop: "1px solid #f3f4f6", margin: "10px 0 6px" }} />
                <button onClick={() => onSelect(null)} style={{
                  width: "100%", padding: "6px", background: "none", border: "none",
                  color: "#dc2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>✕ 清除班別</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 通用對話框
function Dialog({
  title, body, actions,
}: {
  title: string;
  body: React.ReactNode;
  actions: { label: string; style?: React.CSSProperties; onClick: () => void }[];
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "22px 20px 18px",
        width: "100%", maxWidth: 320, boxShadow: "0 20px 60px rgba(0,0,0,.25)",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, marginBottom: 18 }}>{body}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {actions.map((a, i) => (
            <button key={i} onClick={a.onClick} style={{
              padding: "10px 16px", borderRadius: 9, border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              background: "#f3f4f6", color: "#374151",
              ...a.style,
            }}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 主頁面
type Entry = { shift: string; confirmed: boolean; updated_by?: string };
type NurseInfo = { uid: string; name: string; attr: string; level: string; role: string; sort_order: number; halftime: boolean; admin_staff?: boolean };

export default function NursePage() {
  const user = getAuth()!;
  const isDual = ["dual", "admin", "superadmin"].includes(user.role);
  const isSuperAdmin = user.role === "superadmin";

  const [ym, setYm] = useState(dayjs().format("YYYY-MM"));
  const [workShifts, setWorkShifts] = useState<string[]>(DEFAULT_WORK);
  const [restShifts, setRestShifts] = useState<string[]>(DEFAULT_REST);
  const [offShifts, setOffShifts]   = useState<string[]>(DEFAULT_OFF);
  const allOffShifts = [...restShifts, ...offShifts];   // 應休 + 放假調整（計入「休假人數」與紅字著色）
  // 從 localStorage 即刻 hydrate 上次已知的 cycleRange，避免登入後 flash 空狀態
  const [cycleRange, setCycleRange] = useState<{ start: string; end: string } | null>(() => {
    try {
      const cached = localStorage.getItem("nurseCycleRange");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.start && parsed?.end) return parsed;
      }
    } catch {}
    return null;
  });
  // 首次 fetch 是否已完成（用來區分「還沒抓」vs「抓完了但沒設 cycle」）
  const [rulesFetched, setRulesFetched] = useState(() => {
    try { return !!localStorage.getItem("nurseCycleRange"); } catch { return false; }
  });
  // 填表截止日(從 rules.cycle.deadline_date/time 讀取)
  const [deadline, setDeadline] = useState<{ date: string; time: string } | null>(() => {
    try {
      const cached = localStorage.getItem("nurseDeadline");
      if (cached) { const p = JSON.parse(cached); if (p?.date) return p; }
    } catch {}
    return null;
  });

  // 全員資料
  const [nurses, setNurses] = useState<NurseInfo[]>([]);
  // 全員班表 uid → date → Entry
  const [allSched, setAllSched] = useState<Record<string, Record<string, Entry>>>({});

  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [popup, setPopup] = useState<{ date: string } | null>(null);
  const [confirmEdit, setConfirmEdit] = useState<{ date: string } | null>(null);
  const [leaveDialog, setLeaveDialog] = useState<{ action: () => void } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [toastErr, setToastErr] = useState(false);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lockFirstDay, setLockFirstDay] = useState(true);
  const [restrictFirstWeekend, setRestrictFirstWeekend] = useState(true);
  const [maxPredDays, setMaxPredDays] = useState(0);   // 預班上限（白班/小夜/大夜/OFF 天數），0＝不限

  // 滑動選取
  const swipeRef  = useRef<{ startDate: string; dates: Set<string>; active: boolean } | null>(null);
  const daysRef   = useRef<string[]>([]);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [swipeDates, setSwipeDates] = useState<Set<string>>(new Set());
  const [swipePopup, setSwipePopup] = useState<{ dates: string[] } | null>(null);

  // Ctrl / Shift 批次選取
  const [shiftAnchor, setShiftAnchor] = useState<{ date: string; shift: string } | null>(null);
  const [ctrlSelected, setCtrlSelected] = useState<Set<string>>(new Set());
  const [shiftRange, setShiftRange] = useState<Set<string>>(new Set());
  const [batchPopup, setBatchPopup] = useState<{ dates: string[] } | null>(null);
  const shiftAnchorRef = useRef<{ date: string; shift: string } | null>(null);
  const ctrlSelectedRef = useRef<Set<string>>(new Set());
  const shiftRangeRef = useRef<Set<string>>(new Set());

  const autoScrollFrameRef = useRef<number | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  // 浮動日期列（手機向上捲過 navbar 後固定）
  const theadRowRef    = useRef<HTMLTableRowElement>(null);
  const stickyScrollRef = useRef<HTMLDivElement>(null);
  const [showStickyHdr, setShowStickyHdr] = useState(false);
  const [colWidths, setColWidths]         = useState<number[]>([]);
  const [stickyBox, setStickyBox]         = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // 頁籤
  const [npTab, setNpTab] = useState<"schedule"|"settings">("schedule");

  // 個人設定
  const [attr, setAttr] = useState("");
  const [note, setNote] = useState("");
  const [pw0, setPw0] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const year  = parseInt(ym.slice(0, 4));
  const month = parseInt(ym.slice(5, 7));
  const days: string[] = cycleRange
    ? (() => {
        const result: string[] = [];
        let d = dayjs(cycleRange.start);
        const end = dayjs(cycleRange.end);
        while (!d.isAfter(end)) { result.push(d.format("YYYY-MM-DD")); d = d.add(1, "day"); }
        return result;
      })()
    : Array.from(
        { length: dayjs(ym + "-01").daysInMonth() },
        (_, i) => ym + "-" + String(i + 1).padStart(2, "0")
      );

  const DOW_ZH_NP = ["週日","週一","週二","週三","週四","週五","週六"];
  const cycleTitleLabel = cycleRange
    ? (() => {
        const s = dayjs(cycleRange.start), e = dayjs(cycleRange.end);
        return `${s.year()}年　${s.format("M/DD")}（${DOW_ZH_NP[s.day()]}）－ ${e.format("M/DD")}（${DOW_ZH_NP[e.day()]}）`;
      })()
    : `${year}年 ${month}月`;

  // 我自己的班表
  const mySchedule = allSched[user.uid] ?? {};
  const myInfo = nurses.find(n => n.uid === user.uid);
  const myAttr = myInfo?.attr ?? attr;

  // 首個週末限制：全職不可將「週期第一個週六 + 第一個週日」同時預成 OFF（半職不受限，只算 OFF）
  const firstSatDate = days.find(d => dayjs(d).day() === 6);
  const firstSunDate = days.find(d => dayjs(d).day() === 0);
  const iAmFullTime = !(myInfo?.halftime);
  const iAmAdminStaff = !!myInfo?.admin_staff;   // 行政人員：個人設定只留備註與修改密碼
  // 檢查：把 datesToOff 這些日期填成 OFF 後，第一個週六與週日是否會「同時為 OFF」
  function firstWeekendBlocked(datesToOff: string[]): boolean {
    if (!restrictFirstWeekend || !iAmFullTime) return false;
    if (!firstSatDate || !firstSunDate) return false;
    const s = new Set(datesToOff);
    const satOff = s.has(firstSatDate) || mySchedule[firstSatDate]?.shift === "OFF";
    const sunOff = s.has(firstSunDate) || mySchedule[firstSunDate]?.shift === "OFF";
    return satOff && sunOff;
  }

  // 預班上限：計入的班別＝白班/小夜/大夜（工作班）或 OFF；半、放假調整類不計。只限全職
  // 只計算「本次週期內（days）」的格子，避免把上週參考、其他月份的舊班別也算進去
  const isCountedShift = (s?: string | null) => !!s && (workShifts.includes(s) || s === "OFF");
  const cycleDaySet = new Set(days);
  const countedPredDays = Object.entries(mySchedule)
    .filter(([d, v]) => cycleDaySet.has(d) && isCountedShift(v.shift)).length;
  // 檢查：把 dates 填成 newShift 後，計入格數是否超過上限
  function predLimitBlocked(dates: string[], newShift: string | null): boolean {
    if (!iAmFullTime || maxPredDays <= 0) return false;
    if (!isCountedShift(newShift)) return false;         // 填半/V/清除 不受限
    // 只看本週期內、且原本「未計入」的日期才會讓計數 +1
    const adds = dates.filter(d => cycleDaySet.has(d) && !isCountedShift(mySchedule[d]?.shift)).length;
    return countedPredDays + adds > maxPredDays;
  }

  // 有未確認的格子
  const hasUnconfirmed = Object.values(mySchedule).some(v => !v.confirmed) || pendingDeletes.size > 0;

  // 我的班別統計
  const myStats: Record<string, number> = {};
  for (const v of Object.values(mySchedule)) myStats[v.shift] = (myStats[v.shift] || 0) + 1;

  // 每日休假人數
  const dailyOff: Record<string, number> = {};
  for (const d of days) {
    dailyOff[d] = nurses.filter(n => {
      const s = allSched[n.uid]?.[d]?.shift;
      return s && isOffFn(s, allOffShifts);
    }).length;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { ctrlSelectedRef.current = ctrlSelected; }, [ctrlSelected]);
  useEffect(() => { shiftRangeRef.current = shiftRange; }, [shiftRange]);
  useEffect(() => { shiftAnchorRef.current = shiftAnchor; }, [shiftAnchor]);

  // 量測日期列各欄寬度（days 或視窗大小改變時重測）
  useEffect(() => {
    const measure = () => {
      const row = theadRowRef.current;
      if (!row) return;
      const ths = Array.from(row.querySelectorAll("th"));
      if (!ths.length || ths[0].getBoundingClientRect().width === 0) return;
      setColWidths(ths.map(th => th.getBoundingClientRect().width));
      // 對齊實際表格容器的左緣與可視寬度（浮動表頭 fixed 定位需與其一致，避免錯位）
      const wrap = tableWrapRef.current;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        setStickyBox({ left: r.left, width: r.width });
      }
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [days, nurses]);

  // 監聽頁面垂直捲動，控制浮動日期列顯示
  useEffect(() => {
    const NAVBAR_H = 52;
    const onScroll = () => {
      const row = theadRowRef.current;
      if (!row) return;
      setShowStickyHdr(row.getBoundingClientRect().bottom <= NAVBAR_H);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 同步水平捲動：表格 → 浮動列
  useEffect(() => {
    const wrap   = tableWrapRef.current;
    const sticky = stickyScrollRef.current;
    if (!wrap || !sticky) return;
    // 初始立即同步(避免剛出現時位置未對齊,需左右滑才對正)
    sticky.scrollLeft = wrap.scrollLeft;
    // 用 requestAnimationFrame 再同步一次(確保 sticky 已 render 完成後對齊)
    requestAnimationFrame(() => {
      if (stickyScrollRef.current && tableWrapRef.current) {
        stickyScrollRef.current.scrollLeft = tableWrapRef.current.scrollLeft;
      }
    });
    const onScroll = () => { sticky.scrollLeft = wrap.scrollLeft; };
    wrap.addEventListener("scroll", onScroll, { passive: true });
    return () => wrap.removeEventListener("scroll", onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStickyHdr]);

  async function loadAll() {
    try {
      // 優化:讀 localStorage 快取的 cycle → 進場立刻並行發 3 個 request(users + rules + schedules)
      let cachedMonths: { year: number; month: number }[] = [];
      try {
        const cached = JSON.parse(localStorage.getItem("nurseCycleRange") || "null");
        if (cached?.start && cached?.end) {
          const months = new Map<string, { year: number; month: number }>();
          let d = dayjs(cached.start);
          while (!d.isAfter(dayjs(cached.end))) {
            months.set(d.format("YYYY-MM"), { year: d.year(), month: d.month() + 1 });
            d = d.add(1, "month").startOf("month");
          }
          cachedMonths = Array.from(months.values());
        }
      } catch {}
      if (cachedMonths.length === 0) cachedMonths = [{ year, month }];

      // 3 組 request 完全並行(schedule 用 cache 猜)
      const [usersRes, rulesRes, ...cachedSchedResults] = await Promise.all([
        api.get("/users"),
        api.get("/rules"),
        ...cachedMonths.map(({ year: y, month: m }) => api.get("/schedule", { params: { year: y, month: m } })),
      ]);

      // 載入自訂班別 & 週期
      const r = rulesRes.data.rules ?? {};
      if (r.shifts?.work) setWorkShifts(r.shifts.work.map((s: any) => s.code));
      if (r.shifts?.rest) setRestShifts(r.shifts.rest.map((s: any) => s.code));
      if (r.shifts?.off)  setOffShifts(r.shifts.off.map((s: any) => s.code));
      setLockFirstDay(r.scheduling?.lock_first_day ?? true);
      setRestrictFirstWeekend(r.scheduling?.restrict_first_weekend ?? true);
      setMaxPredDays(Number(r.scheduling?.max_off_days ?? 0));

      let cycleStart = r.cycle?.start_date ?? "";
      let cycleEnd   = r.cycle?.end_date   ?? "";
      if (cycleStart && cycleEnd) {
        const range = { start: cycleStart, end: cycleEnd };
        setCycleRange(range);
        try { localStorage.setItem("nurseCycleRange", JSON.stringify(range)); } catch {}
      } else {
        setCycleRange(null);
        try { localStorage.removeItem("nurseCycleRange"); } catch {}
        cycleStart = ""; cycleEnd = "";
      }
      // 填表截止日
      const dlDate = r.cycle?.deadline_date ?? "";
      const dlTime = r.cycle?.deadline_time ?? "";
      if (dlDate) {
        const dl = { date: dlDate, time: dlTime || "23:59" };
        setDeadline(dl);
        try { localStorage.setItem("nurseDeadline", JSON.stringify(dl)); } catch {}
      } else {
        setDeadline(null);
        try { localStorage.removeItem("nurseDeadline"); } catch {}
      }
      setRulesFetched(true);

      // 決定要拉哪幾個月的班表
      const monthsToFetch: { year: number; month: number }[] = cycleStart && cycleEnd
        ? (() => {
            const months = new Map<string, { year: number; month: number }>();
            let d = dayjs(cycleStart);
            while (!d.isAfter(dayjs(cycleEnd))) {
              months.set(d.format("YYYY-MM"), { year: d.year(), month: d.month() + 1 });
              d = d.add(1, "month").startOf("month");
            }
            return Array.from(months.values());
          })()
        : [{ year, month }];

      // 若真實 cycle 與 cache 完全一致,直接用剛才並行拿到的 schedResults;否則補打真實所需月份
      const cachedKeys = new Set(cachedMonths.map(m => `${m.year}-${m.month}`));
      const needExtra = monthsToFetch.filter(m => !cachedKeys.has(`${m.year}-${m.month}`));
      const extraResults = needExtra.length
        ? await Promise.all(needExtra.map(({ year: y, month: m }) => api.get("/schedule", { params: { year: y, month: m } })))
        : [];
      // 過濾 cachedSchedResults 只保留還在 monthsToFetch 內的月份(cache 若過期不對應則丟棄)
      const validCached = cachedSchedResults.filter((_, i) => {
        const cm = cachedMonths[i];
        return monthsToFetch.some(m => m.year === cm.year && m.month === cm.month);
      });
      const allSchedResults = [...validCached, ...extraResults];
      const schedRes = { data: { schedule: allSchedResults.flatMap(res => res.data.schedule ?? []) } };

      const nurseList: NurseInfo[] = (usersRes.data.users ?? [])
        .filter((u: any) => ["nurse", "dual"].includes(u.role))
        .sort((a: any, b: any) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
      setNurses(nurseList);

      // 個人設定
      const me = (usersRes.data.users ?? []).find((u: any) => u.uid === user.uid);
      if (me) { setAttr(me.attr ?? ""); setNote(me.note ?? ""); }

      const sched: Record<string, Record<string, Entry>> = {};
      for (const r of (schedRes.data.schedule ?? [])) {
        if (!r.shift) continue;
        if (!sched[r.nurse_uid]) sched[r.nurse_uid] = {};
        sched[r.nurse_uid][r.date] = { shift: r.shift, confirmed: !!r.confirmed, updated_by: r.updated_by ?? null };
      }
      setAllSched(sched);
    } catch (e) { console.error("[loadAll]", e); }
  }

  function showToast(msg: string, isErr = msg.startsWith("✗")) {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(msg);
    setToastErr(isErr);
    toastRef.current = setTimeout(() => setToast(""), 2500);
  }

  // 安全離開：若有未確認，先問
  function safeLeave(action: () => void) {
    if (hasUnconfirmed) {
      setLeaveDialog({ action });
    } else {
      action();
    }
  }

  // beforeunload
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (hasUnconfirmed) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnconfirmed]);

  useEffect(() => {
    function showBatchPopupFor(sel: Set<string>) {
      const sorted = daysRef.current.filter(d => sel.has(d));
      if (sorted.length) setBatchPopup({ dates: sorted });
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") {
        const sel = ctrlSelectedRef.current;
        if (sel.size) showBatchPopupFor(sel);
        return;
      }
      if (e.key === "Shift") {
        const sel = shiftRangeRef.current;
        if (sel.size) showBatchPopupFor(sel);
        return;
      }
    }
    window.addEventListener("keyup", onKeyUp);
    return () => window.removeEventListener("keyup", onKeyUp);
  }, []);

  function handleCellTouchStart(e: React.TouchEvent<HTMLSpanElement>, date: string, myNi: number) {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    let swipeStarted = false;
    let dirDecided = false;

    function nativeMove(ev: TouchEvent) {
      const t = ev.touches[0];
      const dx = t.clientX - touchStartPos.current.x;
      const dy = t.clientY - touchStartPos.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!dirDecided && (absDx > 6 || absDy > 6)) {
        dirDecided = true;
        if (absDx > absDy) {
          swipeStarted = true;
          swipeRef.current = { startDate: date, dates: new Set([date]), active: true };
          setSwipeDates(new Set([date]));
          if (navigator.vibrate) navigator.vibrate(30);
        } else {
          document.removeEventListener("touchmove", nativeMove);
          document.removeEventListener("touchend",  nativeEnd);
          document.removeEventListener("touchcancel", nativeEnd);
          return;
        }
      }

      if (swipeStarted && swipeRef.current) {
        ev.preventDefault();
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        if (!el) return;
        const target = (el.dataset.date ? el : el.closest("[data-date]")) as HTMLElement | null;
        if (!target) return;
        const cellDate = target.dataset.date;
        if (!cellDate) return;
        // 跨列保護：只允許同一護理師的格子
        if (target.dataset.ni !== String(myNi)) return;

        const allD = daysRef.current;
        const startIdx = allD.indexOf(swipeRef.current.startDate);
        const endIdx   = allD.indexOf(cellDate);
        if (startIdx < 0 || endIdx < 0) return;
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const rangeSet = new Set(allD.slice(lo, hi + 1));
        swipeRef.current.dates = rangeSet;
        setSwipeDates(new Set(rangeSet));

        // 自動捲動
        const wrap = tableWrapRef.current;
        const spd = 2.5;   // 固定 150px/秒(60fps × 2.5),NursePage 拖曳選連續多天
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
      }
    }

    function nativeEnd(ev: TouchEvent) {
      document.removeEventListener("touchmove",   nativeMove);
      document.removeEventListener("touchend",    nativeEnd);
      document.removeEventListener("touchcancel", nativeEnd);
      if (autoScrollFrameRef.current) { cancelAnimationFrame(autoScrollFrameRef.current); autoScrollFrameRef.current = null; }

      if (swipeStarted && swipeRef.current && swipeRef.current.dates.size >= 2) {
        ev.preventDefault();
        const sorted = daysRef.current.filter(d => swipeRef.current!.dates.has(d));
        setSwipePopup({ dates: sorted });
        swipeRef.current = null;
        return;
      }

      swipeRef.current = null;
      setSwipeDates(new Set());
      // 單格：讓原本的 onClick 正常觸發
    }

    document.addEventListener("touchmove",   nativeMove, { passive: false });
    document.addEventListener("touchend",    nativeEnd);
    document.addEventListener("touchcancel", nativeEnd);
  }

  async function batchSwipeSave(dates: string[], shift: string | null) {
    setSwipePopup(null);
    setSwipeDates(new Set());
    // 首個週末硬擋：填 OFF 會導致第一個週六+週日同時 OFF → 不讓填
    if (shift === "OFF" && firstWeekendBlocked(dates)) {
      showToast("✗ 不可將週期第一個週六、週日同時預休");
      setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set());
      return;
    }
    // 預班上限硬擋
    if (predLimitBlocked(dates, shift)) {
      showToast(`不可以預班超過${maxPredDays}天喔~~`, true);
      setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set());
      return;
    }
    // 記錄快照供回滾
    const prevSnap: Record<string, { shift: string; confirmed: boolean } | undefined> = {};
    for (const d of dates) prevSnap[d] = mySchedule[d];
    // 樂觀更新所有格子
    setAllSched(cur => {
      const myMap = { ...(cur[user.uid] ?? {}) };
      for (const d of dates) {
        if (shift) myMap[d] = { shift, confirmed: false };
        else delete myMap[d];
      }
      return { ...cur, [user.uid]: myMap };
    });
    setSaving(s => { const n = new Set(s); dates.forEach(d => n.add(d)); return n; });
    try {
      // 一次 API 呼叫取代 N 次
      await api.post("/schedule/shifts/batch",
        dates.map(d => ({ nurse_uid: user.uid, date: d, shift: shift ?? null }))
      );
      showToast(shift ? `✓ 已批次填入 ${dates.length} 格` : `✓ 已清除 ${dates.length} 格`);
    } catch (err: any) {
      // 回滾
      setAllSched(cur => {
        const myMap = { ...(cur[user.uid] ?? {}) };
        for (const d of dates) {
          if (prevSnap[d]) myMap[d] = prevSnap[d]!;
          else delete myMap[d];
        }
        return { ...cur, [user.uid]: myMap };
      });
      const detail = (err as any).response?.data?.detail ?? "網路錯誤";
      showToast(`✗ 儲存失敗：${detail}`);
    } finally {
      setSaving(s => { const n = new Set(s); dates.forEach(d => n.delete(d)); return n; });
    }
  }

  function openCell(date: string) {
    const entry = mySchedule[date];
    if (entry?.confirmed) {
      setConfirmEdit({ date });
    } else {
      setPopup({ date });
    }
  }

  async function handleSelect(shift: string | null) {
    if (!popup) return;
    const { date } = popup;

    // 首個週末硬擋：填 OFF 會導致第一個週六+週日同時 OFF → 不讓填（彈窗保持開著讓他改選）
    if (shift === "OFF" && firstWeekendBlocked([date])) {
      showToast("✗ 不可將週期第一個週六、週日同時預休");
      return;
    }
    // 預班上限硬擋
    if (predLimitBlocked([date], shift)) {
      showToast(`不可以預班超過${maxPredDays}天喔~~`, true);
      return;
    }
    setPopup(null);

    const prev = mySchedule[date] ?? null;
    const wasConfirmed = prev?.confirmed === true;

    // 樂觀更新（標記為未確認）
    setAllSched(cur => {
      const myMap = { ...(cur[user.uid] ?? {}) };
      if (shift) myMap[date] = { shift, confirmed: false };
      else delete myMap[date];
      return { ...cur, [user.uid]: myMap };
    });

    // 若原本是已確認格子，不直接儲存，需透過送出確認
    if (wasConfirmed) {
      if (!shift) {
        // 刪除已確認格子：記錄為待刪除
        setPendingDeletes(s => new Set(s).add(date));
      }
      return;
    }

    setSaving(s => new Set(s).add(date));
    try {
      await api.post("/schedule/shift", { nurse_uid: user.uid, date, shift: shift ?? null });
      showToast("✓ 已儲存");
    } catch (err: any) {
      // 回滾
      setAllSched(cur => {
        const myMap = { ...(cur[user.uid] ?? {}) };
        if (prev) myMap[date] = prev; else delete myMap[date];
        return { ...cur, [user.uid]: myMap };
      });
      const detail = err.response?.data?.detail ?? err.message ?? "請稍後再試";
      showToast(`✗ 儲存失敗：${detail}`);
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(date); return n; });
    }
  }

  async function confirmMyShifts() {
    const toConfirm = Object.entries(mySchedule)
      .filter(([, v]) => !v.confirmed)
      .map(([date, v]) => ({ nurse_uid: user.uid, date, shift: v.shift }));
    const deletes = Array.from(pendingDeletes);
    if (toConfirm.length === 0 && deletes.length === 0) return;

    setConfirming(true);
    try {
      if (toConfirm.length > 0) {
        await api.post("/schedule/confirm", toConfirm);
        setAllSched(cur => {
          const myMap = { ...(cur[user.uid] ?? {}) };
          for (const { date } of toConfirm) {
            if (myMap[date]) myMap[date] = { ...myMap[date], confirmed: true };
          }
          return { ...cur, [user.uid]: myMap };
        });
      }
      if (deletes.length > 0) {
        await Promise.all(deletes.map(date =>
          api.post("/schedule/shift", { nurse_uid: user.uid, date, shift: null })
        ));
        setPendingDeletes(new Set());
      }
      showToast(`✓ 已確認送出 ${toConfirm.length + deletes.length} 格班別`);
    } catch (err: any) {
      const detail = err.response?.data?.detail ?? err.message ?? "請稍後再試";
      showToast(`✗ 確認失敗：${detail}`);
    } finally {
      setConfirming(false);
    }
  }

  async function clearUnconfirmed() {
    setClearConfirm(false);
    const dates = Object.entries(mySchedule).filter(([, v]) => !v.confirmed).map(([date]) => date);
    if (dates.length === 0) return;
    setClearing(true);
    // 快照供回滾
    const prevSnap: Record<string, Entry | undefined> = {};
    for (const d of dates) prevSnap[d] = mySchedule[d];
    // 樂觀更新：移除這些未確認格子
    setAllSched(cur => {
      const myMap = { ...(cur[user.uid] ?? {}) };
      for (const d of dates) delete myMap[d];
      return { ...cur, [user.uid]: myMap };
    });
    try {
      await api.post("/schedule/shifts/batch", dates.map(d => ({ nurse_uid: user.uid, date: d, shift: null })));
      showToast(`✓ 已清除 ${dates.length} 格未確認預班`);
    } catch (err: any) {
      // 回滾
      setAllSched(cur => {
        const myMap = { ...(cur[user.uid] ?? {}) };
        for (const d of dates) { const p = prevSnap[d]; if (p) myMap[d] = p; }
        return { ...cur, [user.uid]: myMap };
      });
      showToast(`✗ 清除失敗：${err.response?.data?.detail ?? err.message ?? "請稍後再試"}`);
    } finally {
      setClearing(false);
    }
  }

  async function saveProfile() {
    try {
      await api.patch(`/users/${user.uid}`, { note, attr });
      // 儲存成功後即時更新本地 nurses，讓 myAttr（畫面用的屬性）立刻反映，不需重整
      setNurses(prev => prev.map(n => n.uid === user.uid ? { ...n, attr } : n));
      flashMsg("個人設定已儲存");
    } catch { flashMsg("儲存失敗", false); }
  }

  async function changePw() {
    if (!pw0 || !pw1 || !pw2) return flashMsg("請填寫所有密碼欄位", false);
    if (pw1 !== pw2) return flashMsg("兩次新密碼不一致", false);
    if (pw1.length < 4) return flashMsg("新密碼至少 4 個字元", false);
    try {
      await api.post("/auth/change-password", { old_password: pw0, new_password: pw1 });
      setPw0(""); setPw1(""); setPw2("");
      flashMsg("密碼已變更");
    } catch (err: any) {
      flashMsg(err.response?.data?.detail ?? "密碼變更失敗", false);
    }
  }

  function flashMsg(text: string, ok = true) {
    // 個人設定訊息改用與預班相同的底部 toast（成功綠、失敗紅）
    showToast(ok ? `✓ ${text}` : `✗ ${text}`);
  }

  const EyeOn  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  const EyeOff = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f1f5f9 !important; color-scheme: light !important; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", sans-serif; color: #111827; font-size: 14px; }

        .np-nav {
          position: sticky; top: 0; z-index: 100;
          height: 52px; background: #fff; border-bottom: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 14px; gap: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,.06);
        }
        .np-nav-l { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
        .np-nav-r { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

        .xbtn { border: none; border-radius: 8px; font-family: inherit; cursor: pointer; font-size: 13px; font-weight: 600; white-space: nowrap; padding: 7px 13px; transition: opacity .15s; }
        .xbtn-purple { background: #7c3aed; color: #fff; }
        .xbtn-gray   { background: #f3f4f6; color: #374151; }
        .xbtn-blue   { background: #2563eb; color: #fff; }
        .xbtn-green  { background: #16a34a; color: #fff; }
        .xbtn-redsoft { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .xbtn:disabled { opacity: .4; cursor: not-allowed; }

        .np-body { max-width: 1080px; margin: 0 auto; padding: 16px 12px 80px; display: flex; flex-direction: column; gap: 14px; }
        .xcard { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }

        .month-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px 10px; flex-wrap: wrap; }
        .month-bar input[type=month] { border: 1.5px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 14px; font-family: inherit; background: #fff; color: #111827; outline: none; color-scheme: light; }
        .month-bar input[type=month]:focus { border-color: #2563eb; }

        .stats-bar { display: flex; flex-wrap: wrap; gap: 10px 16px; padding: 0 16px 12px; font-size: 13px; font-weight: 700; align-items: center; }

        /* 表格 */
        .tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-top: 1px solid #f0f0f0; }
        .tbl { border-collapse: collapse; }
        .tbl th, .tbl td { border: 1px solid #f0f0f0; }

        /* 固定名字欄 */
        .th-name, .td-name {
          position: sticky; left: 0; z-index: 2;
          background: #f8fafc;
          white-space: nowrap;
          width: 70px; min-width: 70px;
        }
        .th-name { padding: 8px 10px; font-size: 11px; font-weight: 700; color: #6b7280; text-align: left; }
        .td-name { padding: 7px 10px; font-size: 15px; font-weight: 700; color: #111827; background: #fff; }
        .td-name.is-me { color: #1d4ed8; background: #eff6ff; }

        /* 班屬欄 */
        .th-attr, .td-attr {
          position: sticky; left: 70px; z-index: 2;
          background: #f8fafc;
          border-right: 2px solid #e2e8f0 !important;
          white-space: nowrap;
          width: 34px; min-width: 34px; text-align: center;
        }
        .th-attr { padding: 8px 4px; font-size: 11px; font-weight: 700; color: #6b7280; }
        .td-attr { padding: 4px 2px; font-size: 10px; font-weight: 600; color: #9ca3af; background: #fff; }
        .td-attr.is-me { background: #eff6ff; }

        /* 日期欄 */
        .th-day { padding: 6px 2px; text-align: center; font-size: 11px; font-weight: 700; color: #374151; background: #f8fafc; width: 42px; min-width: 42px; line-height: 1.3; }
        .th-day.we { color: #dc2626; background: #fef2f2; }
        .td-shift.we { background: #fef9f9; }

        /* 班別格 */
        .td-shift { text-align: center; padding: 3px 2px; }
        .cell-span {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 30px;
          border-radius: 6px;
          font-size: 12px; font-weight: 700;
          cursor: pointer;
          border: 1.5px solid transparent;
          transition: background .12s, border-color .12s, opacity .15s;
          user-select: none;
        }
        .cell-span.readonly { cursor: default; pointer-events: none; }
        .cell-span:not(.readonly):hover { filter: brightness(.93); }
        .cell-span.is-saving   { opacity: .3; pointer-events: none; }
        .cell-span.is-swipe-sel  { outline: 2.5px solid #0891b2; outline-offset: 1px; background: #cffafe !important; color: #164e63 !important; filter: none; }
        .cell-span.is-ctrl-sel   { outline: 2px solid #7c3aed; background: #ede9fe !important; filter: none; }
        .cell-span.is-shift-sel  { outline: 2px solid #2563eb; background: #dbeafe !important; color: #1e3a8a !important; filter: none; }
        .cell-span.is-empty  { color: #d1d5db; font-weight: 300; font-size: 17px; border-color: transparent; }
        .cell-span.is-empty:not(.readonly):hover { background: #f8fafc; border-color: #e5e7eb; color: #6b7280; filter: none; }
        .cell-span.ro-empty  { color: transparent; pointer-events: none; border-color: transparent; cursor: default; }

        /* 每日休假統計列 */
        .td-daily-off { text-align: center; padding: 3px 2px; background: #fafafa; }
        .td-name-off  { position: sticky; left: 0; z-index: 2; background: #f3f4f6; padding: 5px 10px; font-size: 11px; color: #9ca3af; font-weight: 600; border-right: 2px solid #e2e8f0 !important; }

        /* 確認送出按鈕列 */
        .confirm-bar { padding: 10px 16px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

        /* 個人設定 */
        .sblock { padding: 14px 16px; border-top: 1px solid #f3f4f6; }
        .sblock-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 12px; }
        .xfield { margin-bottom: 12px; }
        .xfield label { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 5px; }
        .xfield input, .xfield textarea {
          width: 100%; padding: 9px 12px;
          border: 1.5px solid #d1d5db; border-radius: 8px;
          font-size: 14px; font-family: inherit; color: #111827;
          background: #fff; outline: none; color-scheme: light; -webkit-appearance: none;
        }
        .xfield input:focus, .xfield textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
        .pw-wrap { position: relative; }
        .pw-wrap input { padding-right: 44px; }
        .pw-eye { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #9ca3af; padding: 4px; display: flex; align-items: center; }
        .pw-eye:hover { color: #374151; }
        .smsg-ok  { color: #16a34a; font-size: 13px; margin-top: 8px; }
        .smsg-err { color: #dc2626; font-size: 13px; margin-top: 8px; }

        /* 頁籤 */
        .np-tabs { display: flex; gap: 2px; padding: 10px 16px 0; background: #fff; }
        .np-tab {
          padding: 8px 18px; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 600;
          border: none; background: #f3f4f6; color: #6b7280; cursor: pointer; font-family: inherit; transition: background .12s;
        }
        .np-tab.active { background: #2563eb; color: #fff; }

        /* Toast */
        .toast {
          position: fixed; bottom: 34px; left: 50%; transform: translateX(-50%);
          background: #15803d; color: #fff; padding: 11px 26px;
          border-radius: 12px; font-size: 16px; font-weight: 500; letter-spacing: .3px;
          z-index: 10000; pointer-events: none;
          box-shadow: 0 5px 18px rgba(0,0,0,.2);
          white-space: nowrap;
          animation: fade-up .18s ease;
        }
        @keyframes fade-up { from { opacity: 0; transform: translateX(-50%) translateY(10px); } }
        /* 桌機放大儲存提示 */
        @media (min-width: 768px) {
          .toast { font-size: 18px; font-weight: 600; }
        }

        /* 凡例 */
        .legend { display: flex; flex-wrap: wrap; gap: 8px 14px; padding: 8px 16px 10px; font-size: 11px; color: #6b7280; }
        .legend-dot { display: inline-flex; align-items: center; gap: 4px; }
        .legend-box { width: 14px; height: 14px; border-radius: 3px; border: 1.5px solid; flex-shrink: 0; }

        @media (max-width: 480px) {
          .th-name, .td-name, .td-name-off { width: 56px; min-width: 56px; font-size: 11px; padding: 6px 7px; }
          .th-attr, .td-attr { left: 56px; width: 28px; min-width: 28px; font-size: 9px; }
          .th-day { width: 34px; min-width: 34px; }
          .cell-span { width: 28px; height: 26px; font-size: 11px; }
          .np-body { padding: 10px 8px 80px; }
          .xbtn-purple { font-size: 12px; padding: 6px 9px; }
        }
        @media (orientation: landscape) and (max-width: 1024px) {
          .cell-span { width: 26px !important; height: 24px !important; font-size: 10px !important; }
          .th-day { min-width: 30px !important; width: 30px !important; font-size: 9px !important; padding: 4px 1px !important; }
          .td-shift { padding: 1px !important; }
          .th-name, .td-name, .td-name-off { font-size: 12px !important; min-width: 50px !important; width: 50px !important; }
          .th-attr, .td-attr { left: 50px !important; width: 26px !important; min-width: 26px !important; font-size: 9px !important; }
        }
      `}</style>

      {/* ── Navbar */}
      <nav className="np-nav">
        <div className="np-nav-l">
          <span style={{ fontSize: 15, fontWeight: 800, color: "#1d4ed8" }}>護理排班</span>
          <span style={{ fontSize: 13, color: "#6b7280" }}>{user.name}</span>
        </div>
        <div className="np-nav-r">
          {isDual && (
            <button className="xbtn xbtn-purple" onClick={() => safeLeave(() => { window.location.href = "/admin"; })}>
              管理員後台
            </button>
          )}
          <button className="xbtn xbtn-gray" onClick={() => safeLeave(() => { window.location.href = "/home"; })}>回首頁</button>
          <button className="xbtn xbtn-gray" onClick={() => safeLeave(() => { clearAuth(); window.location.href = "/login"; })}>登出</button>
        </div>
      </nav>

      {/* ── 頁籤列 */}
      <div className="np-tabs">
        <button className={`np-tab${npTab==="schedule"?" active":""}`} onClick={() => setNpTab("schedule")}>本期預班</button>
        <button className={`np-tab${npTab==="settings"?" active":""}`} onClick={() => setNpTab("settings")}>個人設定</button>
      </div>

      <div className="np-body">

        {/* ── 預班表格 */}
        {npTab === "schedule" && <div className="xcard">
          <div className="month-bar">
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>本期預班表</div>
              {cycleRange ? (
                <>
                  <div style={{ fontSize: 18, color: "#000", fontWeight: 600, marginTop: 2 }} className="np-cycle-title">{cycleTitleLabel}</div>
                  {deadline && (() => {
                    const dl = dayjs(`${deadline.date}T${deadline.time}`);
                    const now = dayjs();
                    const expired = dl.isBefore(now);
                    const dow = DOW_ZH_NP[dl.day()];
                    return (
                      <div style={{ fontSize: 12, color: expired ? "#dc2626" : "#dc2626", fontWeight: 600, marginTop: 3 }}>
                        ⏰ 填表截止:{dl.format("M/DD")}（{dow}）{deadline.time}{expired && " ⚠ 已過期"}
                      </div>
                    );
                  })()}
                </>
              ) : !rulesFetched ? (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>載入中…</div>
              ) : null}
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                藍色列為您的班表，點格子可填寫；其他同事為唯讀
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                手機關閉直向鎖定、橫向可觀看比較多日期
              </div>
            </div>
            {!cycleRange && rulesFetched && (
              <input type="month" value={ym} onChange={e => setYm(e.target.value)} />
            )}
          </div>

          {/* 我的統計 */}
          <div className="stats-bar">
            {Object.keys(myStats).length === 0
              ? <span style={{ color: "#d1d5db", fontWeight: 400 }}>本月尚未填寫預班</span>
              : <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
                  已確認 {Object.entries(mySchedule).filter(([d, v]) => cycleDaySet.has(d) && v.confirmed).length} 格
                  ／待確認 {Object.entries(mySchedule).filter(([d, v]) => cycleDaySet.has(d) && !v.confirmed).length + pendingDeletes.size} 格
                </span>
            }
          </div>

          {/* 凡例 */}
          <div className="legend">
            <span className="legend-dot"><span className="legend-box" style={{ background: "#dcfce7", borderColor: "#16a34a" }} />已填入（待確認）</span>
            <span className="legend-dot"><span className="legend-box" style={{ background: "#166534", borderColor: "#14532d" }} />已確認</span>
            <span className="legend-dot"><span className="legend-box" style={{ background: "#fef9c3", borderColor: "#eab308" }} />屬性不符（待確認）</span>
            <span className="legend-dot"><span className="legend-box" style={{ background: "#854d0e", borderColor: "#713f12" }} />屬性不符（已確認）</span>
          </div>

          {/* 表格 */}
          <div className="tbl-scroll" ref={tableWrapRef} style={{ userSelect:"none", WebkitUserSelect:"none" }}>
            <table className="tbl">
              <thead>
                <tr ref={theadRowRef}>
                  <th className="th-name">姓名</th>
                  <th className="th-attr">班屬</th>
                  {days.map(d => {
                    const dow = dayjs(d).day();
                    const isWe = dow === 0 || dow === 6;
                    return (
                      <th key={d} className={`th-day${isWe ? " we" : ""}`}>
                        <div style={{ fontSize: 9, opacity: .6 }}>{String(dayjs(d).month() + 1).padStart(2, "0")}</div>
                        <div>{dayjs(d).date()}</div>
                        <div style={{ fontSize: 9, opacity: .7 }}>{DOW_ZH[dow]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {nurses.map((n, ni) => {
                  const isMe = n.uid === user.uid;
                  const nSched = allSched[n.uid] ?? {};
                  return (
                    <tr key={n.uid}>
                      <td className={`td-name${isMe ? " is-me" : ""}`}>
                        {n.name}
                        {n.halftime && <span style={{ fontSize: 9, color: "#16a34a", fontWeight: 700, marginLeft: 3 }}>半</span>}
                        {(n as any).is_trainee && <span style={{ fontSize: 9, color: "#f97316", fontWeight: 700, marginLeft: 3 }}>新</span>}
                        {n.admin_staff && <span style={{ fontSize: 9, color: "#7c3aed", fontWeight: 700, marginLeft: 3 }}>行政</span>}
                        {isMe ? " ★" : ""}
                      </td>
                      <td className={`td-attr${isMe ? " is-me" : ""}`}>
                        {attrShort(n.attr) || "—"}
                      </td>
                      {days.map(d => {
                        const _dow      = dayjs(d).day();
                        const _isWe     = _dow === 0 || _dow === 6;
                        const entry     = nSched[d];
                        const shift     = entry?.shift;
                        const confirmed = entry?.confirmed ?? false;
                        const isSaving  = isMe && saving.has(d);

                        // 屬性不符（只對自己判斷）
                        const mismatch  = isMe ? !!attrMismatchMsg(shift ?? "", myAttr, allOffShifts) : false;
                        const isDay1Locked = lockFirstDay && cycleRange && d === cycleRange.start;
                        // 管理員填入：updated_by 不是本人
                        const isAdminFilled = !!shift && !!entry?.updated_by && entry.updated_by !== n.uid;

                        const { cls, style } = cellStyleFor(shift, confirmed, isSaving, mismatch, allOffShifts, isAdminFilled);
                        const finalCls = `${cls}${!isMe ? " readonly" : ""}`;

                        const title = !isMe ? undefined
                          : isDay1Locked ? "第一天已鎖定，無法修改"
                          : mismatch ? `⚠ 與輪班屬性「${myAttr}」不符，點擊可修改`
                          : confirmed ? "已確認送出，點擊可申請修改"
                          : shift ? "已填入（待確認），點擊修改"
                          : "點擊填入班別";

                        const isSwipeSel = isMe && swipeDates.has(d) && (swipeRef.current !== null || swipePopup !== null);
                        const isCtrlSel  = isMe && ctrlSelected.has(d);
                        const isShiftSel = isMe && shiftRange.has(d);
                        const swipeCls = isSwipeSel ? " is-swipe-sel" : "";
                        const ctrlShiftCls = (isCtrlSel ? " is-ctrl-sel" : "") + (isShiftSel ? " is-shift-sel" : "");

                        return (
                          <td key={d} className={`td-shift${_isWe ? " we" : ""}`}>
                            <span
                              className={finalCls + swipeCls + ctrlShiftCls}
                              style={isMe && !isSuperAdmin && !isDay1Locked ? { ...style, touchAction: "pan-y" } : style}
                              data-date={isMe && !isDay1Locked ? d : undefined}
                              data-ni={isMe && !isDay1Locked ? String(ni) : undefined}
                              onClick={isMe && !isSuperAdmin && !isDay1Locked ? (e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  setCtrlSelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(d)) next.delete(d); else next.add(d);
                                    return next;
                                  });
                                  setShiftRange(new Set());
                                  return;
                                }
                                if (e.shiftKey) {
                                  e.preventDefault();
                                  const anchor = shiftAnchorRef.current;
                                  if (anchor) {
                                    const ai = days.indexOf(anchor.date);
                                    const ti = days.indexOf(d);
                                    const [from, to] = ai <= ti ? [ai, ti] : [ti, ai];
                                    setShiftRange(new Set(days.slice(from, to + 1)));
                                  } else {
                                    setShiftAnchor({ date: d, shift: mySchedule[d]?.shift ?? "" });
                                    setShiftRange(new Set([d]));
                                  }
                                  setCtrlSelected(new Set());
                                  return;
                                }
                                setCtrlSelected(new Set());
                                setShiftRange(new Set());
                                setShiftAnchor({ date: d, shift: mySchedule[d]?.shift ?? "" });
                                openCell(d);
                              } : undefined}
                              onTouchStart={isMe && !isSuperAdmin && !isDay1Locked ? (e) => handleCellTouchStart(e, d, ni) : undefined}
                              title={title}
                            >
                              {shift ?? (isMe ? "+" : "")}
                              {isDay1Locked && !shift && isMe && <span style={{ fontSize: 8, opacity: .5 }}>🔒</span>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* 每日休假人數 */}
                <tr>
                  <td className="td-name-off">休假</td>
                  <td className="td-attr" style={{ background:"#f3f4f6" }} />
                  {days.map(d => (
                    <td key={d} className="td-daily-off">
                      {dailyOff[d] > 0
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>{dailyOff[d]}</span>
                        : <span style={{ fontSize: 10, color: "#e5e7eb" }}>─</span>
                      }
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 確認送出列 */}
          <div className="confirm-bar">
            <button
              className="xbtn xbtn-green"
              disabled={!hasUnconfirmed || confirming || clearing}
              onClick={confirmMyShifts}
            >
              {confirming ? "送出中…" : `確認送出（${Object.values(mySchedule).filter(v => !v.confirmed).length + pendingDeletes.size} 格待確認）`}
            </button>
            <button
              className="xbtn xbtn-redsoft"
              disabled={Object.values(mySchedule).filter(v => !v.confirmed).length === 0 || confirming || clearing}
              onClick={() => setClearConfirm(true)}
            >
              {clearing ? "清除中…" : `清除未確認（${Object.values(mySchedule).filter(v => !v.confirmed).length} 格）`}
            </button>
            {!hasUnconfirmed && Object.keys(mySchedule).length > 0 && (
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ 本月所有班別已確認</span>
            )}
            <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>
              填寫完成後請按「確認送出」通知管理員
            </span>
          </div>
        </div>}

        {/* ── 個人設定 */}
        {npTab === "settings" && <div className="xcard">
          <div className="sblock">
            <div className="sblock-title">基本資料</div>
            {!iAmAdminStaff && (
            <div className="xfield">
              <label>輪班屬性</label>
              <select value={attr} onChange={e => setAttr(e.target.value)}
                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #d1d5db", borderRadius:8, fontSize:14, fontFamily:"inherit", color:"#111827", background:"#fff", outline:"none" }}>
                <option value="固定D">固定D</option>
                <option value="固定E">固定E</option>
                <option value="固定N">固定N</option>
                <option value="輪班DE">輪班DE</option>
                <option value="輪班EN">輪班EN</option>
                <option value="輪班DN">輪班DN</option>
                <option value="輪班DEN">輪班DEN</option>
              </select>
            </div>
            )}
            <div className="xfield">
              <label>備註</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="其他備註（選填）" rows={2} style={{ resize: "vertical" }} />
            </div>
            <button className="xbtn xbtn-blue" onClick={saveProfile}>儲存設定</button>
          </div>

          <div className="sblock">
            <div className="sblock-title">修改密碼</div>
            <div className="xfield">
              <label>目前密碼</label>
              <div className="pw-wrap">
                <input type={showPw ? "text" : "password"} value={pw0} onChange={e => setPw0(e.target.value)} placeholder="請輸入目前密碼" />
                <button type="button" className="pw-eye" onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff /> : <EyeOn />}
                </button>
              </div>
            </div>
            <div className="xfield">
              <label>新密碼</label>
              <input type={showPw ? "text" : "password"} value={pw1} onChange={e => setPw1(e.target.value)} placeholder="至少 4 個字元" />
            </div>
            <div className="xfield">
              <label>確認新密碼</label>
              <input type={showPw ? "text" : "password"} value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再輸入一次新密碼" />
              {pw1 && pw2 && pw1 !== pw2 && (
                <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>兩次密碼不一致</div>
              )}
            </div>
            <button
              className="xbtn xbtn-redsoft"
              onClick={changePw}
              disabled={!pw0 || !pw1 || !pw2 || pw1 !== pw2}
            >變更密碼</button>
          </div>
        </div>}

      </div>

      {/* ── 批次選取 popup (Ctrl / Shift) */}
      {batchPopup && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onPointerDown={e => { if (e.target === e.currentTarget) { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); } }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: "16px 16px 14px",
            width: "100%", maxWidth: 300, boxShadow: "0 16px 48px rgba(0,0,0,.22)",
            userSelect: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>批次填入</span>
              <button onClick={() => { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              {batchPopup.dates[0]} ～ {batchPopup.dates[batchPopup.dates.length - 1]}（{batchPopup.dates.length} 天）
            </div>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 700, marginBottom: 6 }}>上班</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {workShifts.map(s => (
                <button key={s} onClick={() => batchSwipeSave(batchPopup.dates, s).then(() => { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); })} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #e5e7eb",
                  background: "#f9fafb", color: "#111827",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>應休</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {restShifts.map(s => (
                <button key={s} onClick={() => batchSwipeSave(batchPopup.dates, s).then(() => { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); })} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #fecaca",
                  background: "#fff5f5", color: "#dc2626",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>放假 / 調整</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {offShifts.map(s => (
                <button key={s} onClick={() => batchSwipeSave(batchPopup.dates, s).then(() => { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); })} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #fecaca",
                  background: "#fff5f5", color: "#dc2626",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
              <button onClick={() => batchSwipeSave(batchPopup.dates, null).then(() => { setBatchPopup(null); setCtrlSelected(new Set()); setShiftRange(new Set()); })} style={{
                width: "100%", padding: "6px", background: "none", border: "none",
                color: "#dc2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>✕ 清除選取日期的班別</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 班別 Popup */}
      {/* ── 滑動選取 popup */}
      {swipePopup && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onPointerDown={e => { if (e.target === e.currentTarget) { setSwipePopup(null); setSwipeDates(new Set()); } }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: "16px 16px 14px",
            width: "100%", maxWidth: 300, boxShadow: "0 16px 48px rgba(0,0,0,.22)",
            userSelect: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>批次填入</span>
              <button onClick={() => { setSwipePopup(null); setSwipeDates(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              {swipePopup.dates[0]} ～ {swipePopup.dates[swipePopup.dates.length - 1]}（{swipePopup.dates.length} 天）
            </div>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 700, marginBottom: 6 }}>上班</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {workShifts.map(s => (
                <button key={s} onClick={() => batchSwipeSave(swipePopup.dates, s)} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #e5e7eb",
                  background: "#f9fafb", color: "#111827",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>應休</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {restShifts.map(s => (
                <button key={s} onClick={() => batchSwipeSave(swipePopup.dates, s)} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #fecaca",
                  background: "#fff5f5", color: "#dc2626",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6 }}>放假 / 調整</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {offShifts.map(s => (
                <button key={s} onClick={() => batchSwipeSave(swipePopup.dates, s)} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", border: "1.5px solid #fecaca",
                  background: "#fff5f5", color: "#dc2626",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
              <button onClick={() => batchSwipeSave(swipePopup.dates, null)} style={{
                width: "100%", padding: "6px", background: "none", border: "none",
                color: "#dc2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>✕ 清除選取日期的班別</button>
            </div>
          </div>
        </div>
      )}

      {popup && (
        <ShiftPopup
          date={popup.date}
          current={mySchedule[popup.date]?.shift ?? ""}
          userAttr={myAttr}
          workShifts={workShifts}
          restShifts={restShifts}
          offShifts={offShifts}
          onSelect={handleSelect}
          onClose={() => setPopup(null)}
        />
      )}

      {/* ── 清除未確認確認 */}
      {clearConfirm && (
        <Dialog
          title="清除未確認的預班？"
          body={<>將清除所有<b>尚未確認送出</b>的預班格子（共 {Object.values(mySchedule).filter(v => !v.confirmed).length} 格），已確認的班別不受影響。此動作無法復原。</>}
          actions={[
            { label: "取消", onClick: () => setClearConfirm(false) },
            { label: "確定清除", style: { background: "#dc2626", color: "#fff" }, onClick: clearUnconfirmed },
          ]}
        />
      )}

      {/* ── 已確認格子修改確認 */}
      {confirmEdit && (
        <Dialog
          title="你真的要修改已送出的班別？"
          body={<>已確認的班別（{confirmEdit.date}）修改後將回到<b>待確認</b>狀態，需重新送出確認。</>}
          actions={[
            {
              label: "取消",
              onClick: () => setConfirmEdit(null),
            },
            {
              label: "確認修改",
              style: { background: "#f59e0b", color: "#fff" },
              onClick: () => {
                const d = confirmEdit.date;
                setConfirmEdit(null);
                setPopup({ date: d });
              },
            },
          ]}
        />
      )}

      {/* ── 離開確認 */}
      {leaveDialog && (
        <Dialog
          title="欸欸欸~你還沒確認就要離開喔"
          body="您有班別尚未確認送出。離開後管理員將無法看到這些預班。"
          actions={[
            {
              label: "繼續編輯",
              onClick: () => setLeaveDialog(null),
            },
            {
              label: "儲存後離開",
              style: { background: "#16a34a", color: "#fff" },
              onClick: async () => {
                const action = leaveDialog.action;
                setLeaveDialog(null);
                await confirmMyShifts();
                action();
              },
            },
            {
              label: "放棄並離開",
              style: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
              onClick: () => {
                const action = leaveDialog.action;
                setLeaveDialog(null);
                action();
              },
            },
          ]}
        />
      )}

      {/* ── 浮動日期列（向上捲過 navbar 後固定） */}
      {showStickyHdr && colWidths.length >= 2 && stickyBox.width > 0 && (
        <div style={{
          position: "fixed", top: 52, left: stickyBox.left, width: stickyBox.width,
          zIndex: 98, background: "#f8fafc",
          boxShadow: "0 2px 6px rgba(0,0,0,.10)",
          overflow: "hidden",
        }}>
          <div
            ref={stickyScrollRef}
            style={{ overflowX: "auto", scrollbarWidth: "none" }}
          >
            <style>{`.sticky-hdr-scroll::-webkit-scrollbar { display: none }`}</style>
            <table style={{
              borderCollapse: "collapse",
              tableLayout: "fixed",
              width: colWidths.reduce((a, b) => a + b, 0),
            }}>
              <tbody>
                <tr>
                  {colWidths.map((w, i) => {
                    if (i === 0) return (
                      <th key={i} className="th-name" style={{ width: w }}>姓名</th>
                    );
                    if (i === 1) return (
                      <th key={i} className="th-attr" style={{ width: w }}>班屬</th>
                    );
                    const d = days[i - 2];
                    if (!d) return <th key={i} style={{ width: w }} />;
                    const dow = dayjs(d).day();
                    const isWe = dow === 0 || dow === 6;
                    return (
                      <th key={i} className={`th-day${isWe ? " we" : ""}`} style={{ width: w }}>
                        <div style={{ fontSize: 9, opacity: .6 }}>{String(dayjs(d).month() + 1).padStart(2, "0")}</div>
                        <div>{dayjs(d).date()}</div>
                        <div style={{ fontSize: 9, opacity: .7 }}>{DOW_ZH_NP[dow]}</div>
                      </th>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Toast */}
      {toast && <div className="toast" style={toastErr ? { background: "#dc2626" } : undefined}>{toast}</div>}
    </>
  );
}
