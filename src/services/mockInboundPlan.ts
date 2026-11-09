/* ============================================================
   목(mock) — 입고예정 등록 · 고치기 · 공급사 추가 · 엑셀 가져오기
   서버 InboundPlanService · InboundPlanImportService · PlanFields 와 같은 규칙 · 같은 문구:
   · 번호 IN-{만든 날}-{001부터}, 이동은 IN-MV-… (만든 날 = 데모 기준일)
   · 고치기: 입고예정에서만 — 받기 전 전부, 나눠 입고 중에는 구분 · 공급사 · 번호 · 창고 그대로 · 받음 + 닫음 아래로 못 줄임
   · 판(planRev) — 그 사이 다른 사람이 고쳤으면 막는다
   · 가져오기: 같은 [구분 · 공급사 · 번호 · 창고 · 도착일 · 시간] 줄 = 한 건, 이미 있는 건(같은 공급사 · 번호 · 도착일) 건너뜀,
     오류가 한 줄이라도 있으면 반영하지 않는다
   ⚠ 목이라 메모리에만 있다 — 새로고침하면 처음으로 돌아간다. 공급사 · 품목 이름은 가짜 값이다.
   ============================================================ */

type AnyRecord = Record<string, any>;
type Problem = { field: string; message: string };

export type InboundPlanMockCtx = {
  today: string;
  inbounds: () => AnyRecord[];
  inboundLines: Record<number, AnyRecord[]>;
  /** 목 품목 (itemCode · itemName · spec · unit · erpItemCode · active) */
  items: () => AnyRecord[];
  warehouses: AnyRecord[];
  /** 줄의 닫은 수량 · 남은 수량 (mockApi 의 inboundLineView) */
  lineView: (row: AnyRecord | undefined, ln: AnyRecord) => AnyRecord;
  can: (feature: string) => boolean;
  operator: () => { id: string; name: string } | null;
  log: (entry: AnyRecord) => void;
  nowText: () => string;
};

const PLAN_WORK = "inbound/inbound-schedule:work";
const NO_RIGHT = "입고 예정 · 처리 권한이 없습니다.";
const NORMAL = "일반";
const CONSIGN = "외주";
const MOVE = "이동";
const SUPPLIER_TYPE: Record<string, string> = { [NORMAL]: "공급사", [CONSIGN]: "외주업체", [MOVE]: "공장" };
const SUPPLIER_HINT: Record<string, string> = {
  [NORMAL]: "일반 입고는 공급사를 골라 주세요",
  [CONSIGN]: "외주 입고는 외주업체를 골라 주세요",
  [MOVE]: "공장 간 이동은 출발 공장을 골라 주세요"
};
const CODE_PREFIX: Record<string, string> = { 공급사: "SUP-", 외주업체: "OEM-", 공장: "FAC-" };
const TYPE_ALIASES: Record<string, string> = {
  일반: NORMAL, 일반입고: NORMAL, 발주: NORMAL, 발주입고: NORMAL, 구매: NORMAL, 구매입고: NORMAL, 국내: NORMAL, 국내입고: NORMAL,
  수입: NORMAL, 수입입고: NORMAL, 외주: CONSIGN, 외주입고: CONSIGN, 이동: MOVE, 이동입고: MOVE, 공장간이동: MOVE, 공장이동: MOVE
};
const MAX_LINES = 200;
const MAX_QTY = 999_999;
const MAX_ROWS = 2_000;
const EXPONENT = /^[+-]?\d+(\.\d+)?e[+-]?\d+$/i;
const CODE_LIKE = /^(?:[A-Za-z]{2,5}-?\d{2,}|\d{4,})$/;
const ARRIVING = "도착 처리 중입니다 — 물류팀이 '도착 취소'를 하면 고칠 수 있습니다.";
const ENDED = "끝난 입고는 고칠 수 없습니다.";

/** 공급사 · 외주업체 · 공장 (가짜 이름 — 목 입고예정에 이미 쓰는 것) */
const partners: AnyRecord[] = [
  { id: 1, code: "SUP001", name: "다온테크놀로지", type: "공급사", erpCode: "S001" },
  { id: 2, code: "SUP003", name: "대성정밀공업", type: "공급사", erpCode: "S003" },
  { id: 3, code: "OEM002", name: "인천외주가공", type: "외주업체", erpCode: null },
  { id: 4, code: "WH-CW", name: "창원공장(출발)", type: "공장", erpCode: null },
  { id: 5, code: "WH-AS", name: "안산공장(출발)", type: "공장", erpCode: null }
];
let partnerSeq = 100;
let inboundSeq = 500;
let lineSeq = 5000;

/* ---------- 칸 읽기 (서버 PlanFields) ---------- */
const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const nameKey = (name: string | null | undefined) =>
  (name ?? "").toLowerCase().replace(/\s+/g, "").replace("(주)", "").replace("㈜", "").replace("주식회사", "").replace("(유)", "").replace("유한회사", "");
const fmt = (n: number) => n.toLocaleString("en-US");
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const utc = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);
const ymdOf = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

class Problems {
  list: Problem[] = [];
  add(field: string, message: string) {
    this.list.push({ field, message });
  }
  has(field: string) {
    return this.list.some((p) => p.field === field);
  }
  get empty() {
    return this.list.length === 0;
  }
  message() {
    const first = this.list[0]?.message ?? "";
    return this.list.length > 1 ? `${first} (그 밖에 ${this.list.length - 1}개 더)` : first;
  }
}

function text(p: Problems, field: string, raw: unknown, max: number): string | null {
  const v = clean(raw);
  if (v && v.length > max) {
    p.add(field, `${field}은(는) ${max}자까지입니다 (${v.length}자)`);
    return null;
  }
  return v;
}

function numberField(p: Problems, field: string, raw: unknown): string | null {
  const v = text(p, field, raw, 40);
  if (v && EXPONENT.test(v)) {
    p.add(field, `${field}가 지수 표기(${v})입니다 — 엑셀이 긴 숫자를 바꾼 것입니다. 그 칸을 텍스트 서식으로 바꾸거나 .xlsx 로 올리세요`);
    return null;
  }
  return v;
}

function planType(p: Problems, raw: unknown): string | null {
  const v = clean(raw);
  if (!v) return NORMAL;
  const t = TYPE_ALIASES[v.replace(/ /g, "").toLowerCase()];
  if (!t) p.add("구분", `구분은 일반 · 외주 · 이동 중 하나로 적어 주세요 (${v})`);
  return t ?? null;
}

function dateField(p: Problems, field: string, raw: unknown, today: string): string | null {
  const v = clean(raw);
  if (!v) return null;
  let m = v.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?(?:[ T].*)?$/) ?? v.match(/^(\d{4})(\d{2})(\d{2})$/);
  let out: string | null | undefined;
  if (m) out = ymdOf(Number(m[1]), Number(m[2]), Number(m[3]));
  else if ((m = v.match(/^(\d{5})(?:\.\d+)?$/)) && Number(m[1]) >= 36_526 && Number(m[1]) <= 73_050) {
    out = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86_400_000).toISOString().slice(0, 10);
  } else if ((m = v.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/))) {
    const y = Number(today.slice(0, 4));
    const candidates = [y - 1, y, y + 1].map((yy) => ymdOf(yy, Number(m![1]), Number(m![2])));
    if (candidates.some((c) => c == null)) out = null;
    else out = (candidates as string[]).reduce((best, c) => (Math.abs(daysBetween(today, c)) < Math.abs(daysBetween(today, best)) ? c : best));
  }
  if (out === undefined) {
    p.add(field, `${field}을 읽지 못했습니다 (${v}) — 2026-11-12 처럼 적어 주세요`);
    return null;
  }
  if (out === null) p.add(field, `없는 날짜입니다 (${v})`);
  return out;
}

function timeField(p: Problems, raw: unknown): string | null {
  const v = clean(raw);
  if (!v) return null;
  let s = v.toLowerCase();
  const pm = s.startsWith("오후") || s.startsWith("pm") || s.endsWith("pm");
  const am = s.startsWith("오전") || s.startsWith("am") || s.endsWith("am");
  s = s.replace("오후", "").replace("오전", "").replace("pm", "").replace("am", "").trim();
  let hour: number | null = null;
  let minute = 0;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2})\s*:\s*(\d{2})(?::\d{2})?$/))) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  } else if ((m = s.match(/^(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?$/))) {
    hour = Number(m[1]);
    minute = m[2] ? Number(m[2]) : m[3] ? 30 : 0;
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) hour = Number(s);
    else {
      hour = Number(s.slice(0, -2));
      minute = Number(s.slice(-2));
    }
  } else if ((m = s.match(/^(\d*)\.(\d+)$/)) && !pm && !am) {
    const whole = m[1] ? Number(m[1]) : 0;
    if (whole > 0 && whole < 24 && m[2].length === 2) {
      hour = whole;
      minute = Number(m[2]);
    } else if (whole === 0 || whole >= 36_526) {
      const minutes = Math.min(1439, Math.round(Number(`0.${m[2]}`) * 1440));
      hour = Math.floor(minutes / 60);
      minute = minutes % 60;
    }
  }
  if (hour != null && (pm || am)) {
    if (hour < 1 || hour > 12) hour = null;
    else if (pm && hour < 12) hour += 12;
    else if (am && hour === 12) hour = 0;
  }
  if (hour == null || hour > 23 || minute > 59) {
    p.add("도착 시간", `도착 시간을 읽지 못했습니다 (${v}) — 14:00 처럼 적어 주세요`);
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

function range(p: Problems, field: string, value: number | null, min: number, max: number, shown?: string): number | null {
  if (value == null || !Number.isInteger(value) || value < min || value > max) {
    p.add(field, `${field}은(는) ${fmt(min)} 이상 ${fmt(max)} 이하로 적어 주세요 (${shown ?? String(value)})`);
    return null;
  }
  return value;
}

function whole(p: Problems, field: string, raw: unknown, min: number, max: number): number | null {
  const v = clean(raw);
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    p.add(field, `${field}은(는) 정수로 적어 주세요 (${v})`);
    return null;
  }
  return range(p, field, n, min, max, v);
}

function phoneField(p: Problems, raw: unknown): string | null {
  let v = clean(raw);
  if (!v) return null;
  if (!/^[0-9+()\-. ]+$/.test(v)) {
    p.add("기사 연락처", `기사 연락처는 숫자와 - 로 적어 주세요 (${v})`);
    return null;
  }
  let digits = v.replace(/\D/g, "");
  if (digits === v && digits.startsWith("1") && (digits.length === 9 || digits.length === 10)) {
    digits = `0${digits}`;
    v = digits;
  }
  if (digits.length < 8 || digits.length > 15 || v.length > 30) {
    p.add("기사 연락처", `기사 연락처를 확인해 주세요 (${v})`);
    return null;
  }
  if (digits === v && digits.startsWith("01") && (digits.length === 10 || digits.length === 11)) {
    const mid = digits.length === 11 ? 7 : 6;
    v = `${digits.slice(0, 3)}-${digits.slice(3, mid)}-${digits.slice(mid)}`;
  }
  return v;
}

export function createInboundPlanMock(ctx: InboundPlanMockCtx) {
  const need = () => {
    if (!ctx.can(PLAN_WORK)) throw new Error(NO_RIGHT);
  };
  const activeItems = () => ctx.items().filter((it) => it.active !== false);
  const supplierIdOf = (row: AnyRecord) => row.supplierId ?? partners.find((s) => s.code === row.supplierCode)?.id ?? null;
  const itemByCode = (code: string) => ctx.items().find((it) => it.itemCode === code);
  const defaultWarehouse = () => ctx.warehouses.find((w) => w.name === "이천물류센터") ?? null;
  const hm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : null);
  const who = () => ctx.operator();

  type Header = {
    type: string;
    supplier: AnyRecord;
    poNo: string | null;
    moveRef: string | null;
    warehouse: AnyRecord;
    expectedAt: string;
    arrivalTime: string | null;
    vehicle: string | null;
    palletQty: number | null;
    driverPhone: string | null;
    remark: string | null;
  };
  type NewLine = { item: AnyRecord; qty: number };

  /** 머리 검사 — cur 가 있으면(고치기) 그대로 둔 공급사 · 창고는 지금 안 써도 통과 */
  function header(p: Problems, body: AnyRecord, cur: AnyRecord | null): Header {
    const type = planType(p, body.type);
    let supplier: AnyRecord | undefined;
    if (body.supplierId == null) p.add("공급사", "공급사를 골라 주세요");
    else {
      supplier = partners.find((s) => s.id === Number(body.supplierId));
      const unchanged = cur != null && supplierIdOf(cur) === Number(body.supplierId);
      if (!supplier) p.add("공급사", "없는 공급사입니다 — 다시 골라 주세요");
      else if (!unchanged && type && SUPPLIER_TYPE[type] !== supplier.type) {
        p.add("공급사", `${SUPPLIER_HINT[type]} (고른 곳: ${supplier.name} · ${supplier.type})`);
      }
    }
    let poNo: string | null = null;
    let moveRef: string | null = null;
    if (type === MOVE) moveRef = numberField(p, "이동 번호", body.moveRef ?? body.poNo);
    else {
      poNo = numberField(p, "PO 번호", body.poNo);
      if (type === NORMAL && !poNo && !p.has("PO 번호")) p.add("PO 번호", "일반 입고는 PO 번호(ERP 발주번호)를 넣어 주세요");
    }
    const warehouse = body.warehouseId == null ? undefined : ctx.warehouses.find((w) => w.id === Number(body.warehouseId));
    if (body.warehouseId == null) p.add("받을 창고", "받을 창고를 골라 주세요");
    else if (!warehouse) p.add("받을 창고", "없는 창고입니다 — 다시 골라 주세요");
    const expectedAt = dateField(p, "도착일", body.expectedDate, ctx.today);
    if (!expectedAt && !p.has("도착일")) p.add("도착일", "도착일을 넣어 주세요");
    else if (expectedAt && Math.abs(daysBetween(ctx.today, expectedAt)) > 365) {
      p.add("도착일", `도착일을 확인해 주세요 — 오늘에서 1년 넘게 떨어져 있습니다 (${expectedAt})`);
    }
    const arrivalTime = timeField(p, body.arrivalTime);
    const vehicle = text(p, "차량", body.vehicle, 30);
    const palletQty = body.palletQty == null || body.palletQty === "" ? null : range(p, "파레트 수", Number(body.palletQty), 0, 999);
    const driverPhone = phoneField(p, body.driverPhone);
    const remark = text(p, "메모", body.remark, 200);
    return { type: type ?? NORMAL, supplier: supplier ?? {}, poNo, moveRef, warehouse: warehouse ?? {}, expectedAt: expectedAt ?? "", arrivalTime, vehicle, palletQty, driverPhone, remark };
  }

  function newLines(p: Problems, lines: AnyRecord[], taken: Set<string>): NewLine[] {
    if (lines.length + taken.size > MAX_LINES) {
      p.add("품목", `한 입고예정에 품목은 ${MAX_LINES}줄까지입니다 (${lines.length + taken.size}줄)`);
      return [];
    }
    const seen = new Set(taken);
    const out: NewLine[] = [];
    for (const l of lines) {
      if (l.itemId == null) {
        p.add("품목", "품목을 골라 주세요");
        continue;
      }
      const item = ctx.items().find((it) => it.id === Number(l.itemId));
      if (!item || item.active === false) {
        p.add("품목", `없거나 쓰지 않는 품목입니다 (${item ? item.itemCode : `id ${l.itemId}`})`);
        continue;
      }
      if (seen.has(item.itemCode)) {
        p.add("품목", `같은 품목이 두 줄입니다: ${item.itemCode} — 한 줄로 합쳐 주세요`);
        continue;
      }
      seen.add(item.itemCode);
      if (l.qty == null || l.qty === "") {
        p.add(`${item.itemCode} 수량`, `${item.itemCode} 수량을 넣어 주세요`);
        continue;
      }
      const qty = range(p, `${item.itemCode} 수량`, Number(l.qty), 1, MAX_QTY);
      if (qty != null) out.push({ item, qty });
    }
    return out;
  }

  function warnings(h: Header, id: number | null): string[] {
    const out: string[] = [];
    if (h.expectedAt < ctx.today) out.push(`도착일(${h.expectedAt})이 지났습니다 — 그대로 저장했습니다.`);
    if (h.poNo) {
      const same = ctx
        .inbounds()
        .filter((r) => r.id !== id && supplierIdOf(r) === h.supplier.id && r.poNo === h.poNo && ["scheduled", "registered", "located"].includes(r.status))
        .map((r) => r.inboundNo)
        .sort();
      if (same.length) out.push(`같은 PO(${h.poNo})의 입고예정이 이미 있습니다: ${same.join(", ")}`);
    }
    return out;
  }

  const typeCodes = (type: string) =>
    type === CONSIGN ? { inTypeCode: "OEM", inTypeName: "외주입고", erpLinked: false } : type === MOVE ? { inTypeCode: "MVR", inTypeName: "공장간이동", erpLinked: false } : { inTypeCode: null, inTypeName: null, erpLinked: true };

  const summary = (h: Header, lines: NewLine[]) =>
    `${h.type !== NORMAL ? `${h.type} · ` : ""}${h.supplier.name}${h.poNo ? ` · PO ${h.poNo}` : ""}${h.moveRef ? ` · 이동 ${h.moveRef}` : ""} · 도착 ${h.expectedAt}${h.arrivalTime ? ` ${h.arrivalTime}` : ""} · ${h.warehouse.name} · 품목 ${lines.length}줄 ${lines.reduce((a, l) => a + l.qty, 0)}`;

  const logInbound = (refNo: string, action: string, detail: string) =>
    ctx.log({ refType: "INBOUND", refNo, action, detail: detail.slice(0, 300), operator: who()?.id ?? "system", createdAt: ctx.nowText() });

  /** 저장 — 번호를 잡아 머리 · 줄을 넣는다 (가져오기도 여기) */
  function insert(h: Header, lines: NewLine[], source: string): AnyRecord {
    const prefix = `${h.type === MOVE ? "IN-MV-" : "IN-"}${ctx.today.replace(/-/g, "")}-`;
    const next = ctx
      .inbounds()
      .map((r) => String(r.inboundNo))
      .filter((no) => no.startsWith(prefix) && /^\d+$/.test(no.slice(prefix.length)))
      .reduce((max, no) => Math.max(max, Number(no.slice(prefix.length))), 0) + 1;
    const id = ++inboundSeq;
    const me = who();
    const row: AnyRecord = {
      id,
      inboundNo: `${prefix}${pad(next, 3)}`,
      poNo: h.poNo,
      moveRef: h.moveRef,
      supplierId: h.supplier.id,
      supplierCode: h.supplier.code,
      supplierName: h.supplier.name,
      warehouseId: h.warehouse.id,
      warehouseName: h.warehouse.name,
      warehouseType: h.warehouse.type,
      type: h.type,
      ...typeCodes(h.type),
      purchaseGroupCode: null,
      purchaseGroupName: null,
      remark: h.remark,
      status: "scheduled",
      expectedAt: h.expectedAt,
      qty: lines.reduce((a, l) => a + l.qty, 0),
      arrivalTime: h.arrivalTime,
      vehicle: h.vehicle,
      palletQty: h.palletQty,
      driverPhone: h.driverPhone,
      planSource: source,
      createdBy: me?.id ?? null,
      createdByName: me?.name ?? null,
      createdAt: ctx.nowText(),
      updatedByName: null,
      planRev: 0
    };
    ctx.inbounds().unshift(row);
    ctx.inboundLines[id] = lines.map((l) => ({
      id: ++lineSeq, itemCode: l.item.itemCode, itemName: l.item.itemName, spec: l.item.spec ?? null, unit: l.item.unit ?? "EA",
      consign: Boolean(l.item.consign), locationCode: null, locationId: null, trackingNo: null, inspected: false,
      expectedQty: l.qty, receivedQty: 0, closedQty: 0
    }));
    return row;
  }

  function create(body: AnyRecord): [unknown, string] {
    need();
    const p = new Problems();
    const h = header(p, body, null);
    const lines = newLines(p, Array.isArray(body.lines) ? body.lines.filter(Boolean) : [], new Set());
    if (!lines.length && !p.has("품목")) p.add("품목", "품목을 하나 이상 넣어 주세요");
    if (!p.empty) throw new Error(p.message());
    const row = insert(h, lines, "SCREEN");
    logInbound(row.inboundNo, "입고예정 등록", `화면 — ${summary(h, lines)}`);
    return [{ id: row.id, inboundNo: row.inboundNo, warnings: warnings(h, row.id) }, `${row.inboundNo} 입고예정을 만들었습니다.`];
  }

  const linesOf = (row: AnyRecord) => (ctx.inboundLines[row.id] ?? []).map((ln) => ({ ln, view: ctx.lineView(row, ln) }));
  const touched = (row: AnyRecord) => linesOf(row).some(({ ln, view }) => Number(ln.receivedQty || 0) > 0 || Number(view.closedQty || 0) > 0);

  function planView(id: number): AnyRecord {
    need();
    const row = ctx.inbounds().find((r) => r.id === id);
    if (!row) throw new Error("입고 건을 찾을 수 없습니다.");
    const mode = row.status === "scheduled" ? (touched(row) ? "PARTIAL" : "ALL") : "NONE";
    const supplier = partners.find((s) => s.id === supplierIdOf(row));
    return {
      id: row.id, inboundNo: row.inboundNo, status: row.status, mode,
      lockReason: mode !== "NONE" ? null : row.status === "registered" || row.status === "located" ? ARRIVING : ENDED,
      type: row.type, supplierId: supplier?.id ?? null, supplierCode: row.supplierCode ?? null, supplierName: row.supplierName ?? null,
      supplierType: supplier?.type ?? null, poNo: row.poNo ?? null, moveRef: row.moveRef ?? null, warehouseId: row.warehouseId ?? null,
      warehouseName: row.warehouseName ?? null, expectedDate: row.expectedAt ?? null, arrivalTime: hm(row.arrivalTime), vehicle: row.vehicle ?? null,
      palletQty: row.palletQty ?? null, driverPhone: row.driverPhone ?? null, remark: row.remark ?? null, version: String(row.planRev ?? 0),
      lines: linesOf(row).map(({ ln, view }) => {
        const received = Number(ln.receivedQty || 0);
        const closed = Number(view.closedQty || 0);
        return {
          id: ln.id, itemId: itemByCode(ln.itemCode)?.id ?? 0, itemCode: ln.itemCode, itemName: ln.itemName, spec: ln.spec ?? null, unit: ln.unit ?? "EA",
          qty: Number(ln.expectedQty), receivedQty: received, closedQty: closed, minQty: Math.max(1, received + closed), removable: received === 0 && closed === 0
        };
      })
    };
  }

  function update(id: number, body: AnyRecord): [unknown, string] {
    need();
    const row = ctx.inbounds().find((r) => r.id === id);
    if (!row) throw new Error("입고 건을 찾을 수 없습니다.");
    if (row.status === "registered" || row.status === "located") throw new Error(ARRIVING);
    if (row.status !== "scheduled") throw new Error(ENDED);
    if (String(body.version ?? "") !== String(row.planRev ?? 0)) throw new Error("다른 사람이 먼저 고쳤습니다 — 창을 닫고 다시 열어 주세요.");
    const current = linesOf(row);
    const partial = touched(row);
    const p = new Problems();
    const h = header(p, body, row);
    if (partial && p.empty && (h.type !== row.type || h.supplier.id !== supplierIdOf(row) || (h.poNo ?? null) !== (row.poNo ?? null)
      || (h.moveRef ?? null) !== (row.moveRef ?? null) || h.warehouse.id !== row.warehouseId)) {
      p.add("구분", "나눠 입고 중에는 구분 · 공급사 · PO 번호 · 받을 창고를 바꿀 수 없습니다");
    }
    const given: AnyRecord[] = Array.isArray(body.lines) ? body.lines.filter(Boolean) : [];
    const keep = new Set<number>();
    const keptItems = new Set<string>();
    const qtyChanges = new Map<number, number>();
    const added: AnyRecord[] = [];
    for (const l of given) {
      if (l.id == null) {
        added.push(l);
        continue;
      }
      const found = current.find(({ ln }) => ln.id === Number(l.id));
      if (!found) {
        p.add("품목", `이 입고 건의 품목 줄이 아닙니다: ${l.id}`);
        continue;
      }
      if (keep.has(found.ln.id) || keptItems.has(found.ln.itemCode)) {
        p.add("품목", `같은 품목이 두 줄입니다: ${found.ln.itemCode} — 한 줄로 합쳐 주세요`);
        continue;
      }
      keep.add(found.ln.id);
      keptItems.add(found.ln.itemCode);
      if (l.qty == null || l.qty === "") {
        p.add(`${found.ln.itemCode} 수량`, `${found.ln.itemCode} 수량을 넣어 주세요`);
        continue;
      }
      const qty = range(p, `${found.ln.itemCode} 수량`, Number(l.qty), 1, MAX_QTY);
      if (qty == null) continue;
      const received = Number(found.ln.receivedQty || 0);
      const closed = Number(found.view.closedQty || 0);
      if (qty < received + closed) {
        p.add("품목", `${found.ln.itemCode} 는 받은 ${received} · 닫은 ${closed} 보다 적게 줄일 수 없습니다`);
        continue;
      }
      if (qty !== Number(found.ln.expectedQty)) qtyChanges.set(found.ln.id, qty);
    }
    const adds = newLines(p, added, keptItems);
    const removes = current.filter(({ ln }) => !keep.has(ln.id));
    for (const { ln, view } of removes) {
      if (Number(ln.receivedQty || 0) > 0 || Number(view.closedQty || 0) > 0) {
        p.add("품목", `${ln.itemCode} 는 받은(또는 닫은) 수량이 있어 지울 수 없습니다 — 안 오는 수량은 '남은 수량 닫기'로`);
      }
    }
    if (keep.size + adds.length === 0 && !p.has("품목")) p.add("품목", "품목을 하나 이상 넣어 주세요");
    if (!p.empty) throw new Error(p.message());

    const changes: string[] = [];
    const diff = (label: string, before: unknown, after: unknown) => {
      const b = before == null || before === "" ? null : String(before);
      const a = after == null || after === "" ? null : String(after);
      if (b !== a) changes.push(`${label} ${b ?? "(없음)"} → ${a ?? "(없음)"}`);
    };
    diff("구분", row.type, h.type);
    diff("공급사", row.supplierName, h.supplier.name);
    diff("PO", row.poNo, h.poNo);
    diff("이동 번호", row.moveRef, h.moveRef);
    diff("받을 창고", row.warehouseName, h.warehouse.name);
    diff("도착일", row.expectedAt, h.expectedAt);
    diff("도착 시간", hm(row.arrivalTime), h.arrivalTime);
    diff("차량", row.vehicle, h.vehicle);
    diff("파레트", row.palletQty, h.palletQty);
    if ((row.driverPhone ?? null) !== h.driverPhone) changes.push("기사 연락처 바꿈");
    if ((row.remark ?? null) !== h.remark) changes.push("메모 바꿈");
    if (adds.length) changes.push(`품목 ${adds.length}줄 더함`);
    if (removes.length) changes.push(`품목 ${removes.length}줄 뺌 (${removes.map(({ ln }) => ln.itemCode).join(", ")})`);
    if (qtyChanges.size) changes.push(`수량 바꿈 ${qtyChanges.size}줄`);
    if (!changes.length) return [{ id, inboundNo: row.inboundNo, warnings: [] }, "바뀐 것이 없습니다."];

    const before = current.reduce((a, { ln }) => a + Number(ln.expectedQty), 0);
    const kept = (ctx.inboundLines[id] ?? []).filter((ln) => keep.has(ln.id));
    kept.forEach((ln) => {
      if (qtyChanges.has(ln.id)) ln.expectedQty = qtyChanges.get(ln.id);
    });
    const newRows = adds.map((l) => ({
      id: ++lineSeq, itemCode: l.item.itemCode, itemName: l.item.itemName, spec: l.item.spec ?? null, unit: l.item.unit ?? "EA",
      consign: Boolean(l.item.consign), locationCode: null, locationId: null, trackingNo: null, inspected: false, expectedQty: l.qty, receivedQty: 0, closedQty: 0
    }));
    ctx.inboundLines[id] = [...kept, ...newRows];
    const after = ctx.inboundLines[id].reduce((a, ln) => a + Number(ln.expectedQty), 0);
    if (before !== after) changes.push(`예정 수량 ${before} → ${after}`);

    const codes = h.type === row.type ? {} : typeCodes(h.type);
    Object.assign(row, {
      ...codes, type: h.type, supplierId: h.supplier.id, supplierCode: h.supplier.code, supplierName: h.supplier.name, poNo: h.poNo, moveRef: h.moveRef,
      warehouseId: h.warehouse.id, warehouseName: h.warehouse.name, warehouseType: h.warehouse.type, expectedAt: h.expectedAt, arrivalTime: h.arrivalTime,
      vehicle: h.vehicle, palletQty: h.palletQty, driverPhone: h.driverPhone, remark: h.remark, qty: after,
      updatedByName: who()?.name ?? null, planRev: Number(row.planRev ?? 0) + 1
    });
    logInbound(row.inboundNo, "입고예정 수정", changes.join(" · "));
    return [{ id, inboundNo: row.inboundNo, warnings: warnings(h, id) }, `${row.inboundNo} 입고예정을 고쳤습니다.`];
  }

  /* ---------- 공급사 추가 ---------- */
  function createSupplier(name: string, type: string, erpCode: string | null): AnyRecord {
    const prefix = CODE_PREFIX[type];
    const next = partners
      .map((s) => String(s.code))
      .filter((c) => c.startsWith(prefix) && /^\d+$/.test(c.slice(prefix.length)))
      .reduce((max, c) => Math.max(max, Number(c.slice(prefix.length))), 0) + 1;
    const supplier = { id: ++partnerSeq, code: `${prefix}${pad(next, 4)}`, name, type, erpCode };
    partners.push(supplier);
    ctx.log({ refType: "PARTNER", refNo: supplier.code, action: "공급사 추가", detail: `${type} · ${name}${erpCode ? ` · ERP ${erpCode}` : ""}`, operator: who()?.id ?? "system", createdAt: ctx.nowText() });
    return supplier;
  }

  const findSame = (type: string, name: string, erp: string | null) =>
    partners.find((s) => s.type === type && (nameKey(s.name) === nameKey(name) || (erp != null && erp.toLowerCase() === String(s.erpCode ?? "").toLowerCase())));

  function addSupplier(body: AnyRecord): [unknown, string] {
    need();
    const p = new Problems();
    let type = clean(body.type);
    if (!type) type = "공급사";
    else if (!CODE_PREFIX[type]) p.add("종류", `종류는 공급사 · 외주업체 · 공장 중 하나입니다 (${type})`);
    const name = text(p, "공급사 이름", body.name, 150);
    if (!name && !p.has("공급사 이름")) p.add("공급사 이름", "공급사 이름을 넣어 주세요");
    const erp = text(p, "ERP 거래처 코드", body.erpCode, 50);
    if (!p.empty) throw new Error(p.message());
    const same = findSame(type, name!, erp);
    if (same) return [{ supplier: same, existing: true }, `같은 이름의 공급사가 있어 그것을 골랐습니다 — ${same.name}`];
    const made = createSupplier(name!, type, erp);
    return [{ supplier: made, existing: false }, `공급사를 추가했습니다 — ${made.name} (${made.code})`];
  }

  /* ---------- 엑셀 가져오기 ---------- */
  type SupplierRef = { key: string; existing: AnyRecord | null; newName?: string; newType?: string; newErp?: string | null };
  type RowPlan = { rowNo: number; problems: Problem[]; type?: string | null; supplier?: SupplierRef | null; number?: string | null; warehouse?: AnyRecord | null;
    date?: string | null; time?: string | null; vehicle?: string | null; pallets?: number | null; phone?: string | null; remark?: string | null; item?: AnyRecord | null; qty?: number | null };
  type Group = { rows: RowPlan[]; head: Record<string, unknown>; headRow: Record<string, number>; action: "NEW" | "SKIP"; existingNo: string | null; inboundNo: string | null };

  function supplierOf(p: Problems, row: AnyRecord, type: string | null, refs: Map<string, SupplierRef>): SupplierRef | null {
    const raw = clean(row.supplier);
    const erp = clean(row.supplierErpCode);
    if (!raw && !erp) {
      p.add("공급사", "공급사가 비어 있습니다");
      return null;
    }
    if (!type) return null;
    const ptype = SUPPLIER_TYPE[type];
    const pool = partners.filter((s) => s.type === ptype);
    const lower = (v: unknown) => String(v ?? "").toLowerCase();
    let found = raw ? pool.find((s) => lower(s.code) === raw.toLowerCase()) : undefined;
    for (const code of [erp, raw]) if (!found && code) found = pool.find((s) => s.erpCode && lower(s.erpCode) === code.toLowerCase());
    if (!found && raw) {
      const byName = pool.filter((s) => nameKey(s.name) === nameKey(raw));
      if (byName.length > 1) {
        p.add("공급사", `같은 이름의 ${ptype}가 여럿입니다 — 공급사 코드를 적어 주세요 (${byName.map((s) => s.code).join(", ")})`);
        return null;
      }
      found = byName[0];
    }
    if (found) {
      const key = `ID|${found.id}`;
      if (!refs.has(key)) refs.set(key, { key, existing: found });
      return refs.get(key)!;
    }
    if (raw) {
      const other = partners.find((s) => lower(s.code) === raw.toLowerCase());
      if (other) {
        p.add("공급사", `${other.code} 는 ${other.type}입니다 — ${SUPPLIER_HINT[type]}`);
        return null;
      }
    }
    if (!raw) {
      p.add("공급사", `ERP 거래처 코드(${erp})의 ${ptype}가 없습니다 — 새 공급사면 이름을 적어 주세요`);
      return null;
    }
    if (CODE_LIKE.test(raw)) {
      p.add("공급사", `없는 공급사 코드입니다 (${raw}) — 새 공급사면 이름을 적어 주세요`);
      return null;
    }
    if (raw.length > 150) {
      p.add("공급사", `공급사 이름은 150자까지입니다 (${raw.length}자)`);
      return null;
    }
    const key = `NEW|${ptype}|${nameKey(raw)}`;
    if (!refs.has(key)) refs.set(key, { key, existing: null, newName: raw, newType: ptype, newErp: erp });
    return refs.get(key)!;
  }

  function planImport(body: AnyRecord) {
    const rows: AnyRecord[] = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new Error("가져올 줄이 없습니다.");
    if (rows.length > MAX_ROWS) throw new Error(`한 번에 ${MAX_ROWS}줄까지 가져올 수 있습니다 (${rows.length}줄) — 파일을 나눠 올리세요.`);
    const refs = new Map<string, SupplierRef>();
    const items = activeItems();
    const plans: RowPlan[] = rows.map((row, i) => {
      const r: RowPlan = { rowNo: Number(row?.rowNo) > 0 ? Number(row.rowNo) : i + 1, problems: [] };
      if (!row) {
        r.problems.push({ field: "줄", message: "빈 줄입니다" });
        return r;
      }
      const p = new Problems();
      r.type = planType(p, row.type);
      r.supplier = supplierOf(p, row, r.type, refs);
      if (r.type === MOVE) r.number = numberField(p, "이동 번호", row.poNo);
      else {
        r.number = numberField(p, "PO 번호", row.poNo);
        if (r.type === NORMAL && !r.number && !p.has("PO 번호")) p.add("PO 번호", "일반 입고는 PO 번호(ERP 발주번호)를 넣어 주세요");
      }
      const wh = clean(row.warehouse);
      if (!wh) {
        r.warehouse = defaultWarehouse();
        if (!r.warehouse) p.add("받을 창고", "받을 창고가 비어 있습니다");
      } else {
        r.warehouse = ctx.warehouses.find((w) => String(w.code).toLowerCase() === wh.toLowerCase() || nameKey(w.name) === nameKey(wh)) ?? null;
        if (!r.warehouse) p.add("받을 창고", `없는 창고입니다 (${wh})`);
      }
      r.date = dateField(p, "도착일", row.expectedDate, ctx.today);
      if (!r.date && !p.has("도착일")) p.add("도착일", "도착일이 비어 있습니다");
      else if (r.date && Math.abs(daysBetween(ctx.today, r.date)) > 365) p.add("도착일", `도착일을 확인해 주세요 — 오늘에서 1년 넘게 떨어져 있습니다 (${r.date})`);
      r.time = timeField(p, row.arrivalTime);
      r.vehicle = text(p, "차량", row.vehicle, 30);
      r.pallets = whole(p, "파레트 수", row.palletQty, 0, 999);
      r.phone = phoneField(p, row.driverPhone);
      r.remark = text(p, "메모", row.remark, 200);
      const code = clean(row.itemCode);
      if (!code) p.add("품목코드", "품목코드가 비어 있습니다");
      else if (EXPONENT.test(code)) p.add("품목코드", `품목코드가 지수 표기(${code})입니다 — 엑셀이 긴 숫자를 바꾼 것입니다. 그 칸을 텍스트 서식으로 바꾸거나 .xlsx 로 올리세요`);
      else {
        r.item = items.find((it) => String(it.itemCode).toLowerCase() === code.toLowerCase()) ?? null;
        if (!r.item) {
          const erp = items.filter((it) => it.erpItemCode && String(it.erpItemCode).toLowerCase() === code.toLowerCase());
          if (erp.length > 1) p.add("품목코드", `ERP 단품코드 ${code} 가 여러 품목에 있습니다 — WMS 품목코드로 적어 주세요 (${erp.map((it) => it.itemCode).join(", ")})`);
          else r.item = erp[0] ?? null;
          if (!r.item && erp.length <= 1) p.add("품목코드", `없는 품목입니다 (${code}) — 품목은 품목 가져오기로 먼저 넣어 주세요`);
        }
      }
      r.qty = whole(p, "수량", row.qty, 1, MAX_QTY);
      if (r.qty == null && !p.has("수량")) p.add("수량", "수량이 비어 있습니다");
      r.problems.push(...p.list);
      return r;
    });

    const groups = new Map<string, Group>();
    for (const r of plans) {
      if (r.problems.length) continue;
      const key = [r.type, r.supplier!.key, (r.number ?? "").toLowerCase(), r.warehouse!.id, r.date, r.time ?? ""].join("|");
      let g = groups.get(key);
      if (!g) {
        g = { rows: [], head: {}, headRow: {}, action: "NEW", existingNo: null, inboundNo: null };
        groups.set(key, g);
      }
      for (const [field, value] of [["차량", r.vehicle], ["파레트 수", r.pallets], ["기사 연락처", r.phone], ["메모", r.remark]] as Array<[string, unknown]>) {
        if (value == null) continue;
        if (g.head[field] == null) {
          g.head[field] = value;
          g.headRow[field] = r.rowNo;
        } else if (g.head[field] !== value) {
          r.problems.push({ field, message: `같은 입고예정(${g.headRow[field]}번째 줄과 같은 묶음)의 ${field} 값이 다릅니다${field === "기사 연락처" ? "" : ` (${g.head[field]} / ${value})`}` });
        }
      }
      const dup = g.rows.find((o) => o.item!.id === r.item!.id);
      if (dup) r.problems.push({ field: "품목코드", message: `같은 입고예정에 같은 품목이 두 줄입니다 (${dup.rowNo}번째 줄) — 한 줄로 합쳐 주세요` });
      if (!r.problems.length && g.rows.length >= MAX_LINES) r.problems.push({ field: "품목코드", message: `한 입고예정에 품목은 ${MAX_LINES}줄까지입니다` });
      if (!r.problems.length) g.rows.push(r);
    }
    const list = [...groups.values()].filter((g) => g.rows.length);

    // 이미 있는 입고예정 — 같은 공급사 · 번호 · 도착일(닫힌 것 빼고), 번호가 없으면 같은 품목 · 수량
    for (const g of list) {
      const f = g.rows[0];
      if (!f.supplier!.existing) continue;
      const mine = new Map(g.rows.map((r) => [r.item!.itemCode as string, r.qty!]));
      const hit = ctx.inbounds().find((e) => {
        if (e.status === "closed" || supplierIdOf(e) !== f.supplier!.existing!.id || e.expectedAt !== f.date) return false;
        const number = clean(f.type === MOVE ? e.moveRef : e.poNo);
        if (f.number) return number != null && number.toLowerCase() === f.number.toLowerCase();
        if (number != null) return false;
        const theirs = new Map<string, number>();
        (ctx.inboundLines[e.id] ?? []).forEach((ln) => theirs.set(ln.itemCode, (theirs.get(ln.itemCode) ?? 0) + Number(ln.expectedQty)));
        return theirs.size === mine.size && [...mine].every(([code, qty]) => theirs.get(code) === qty);
      });
      if (hit) {
        g.action = "SKIP";
        g.existingNo = hit.inboundNo;
      }
    }
    return { plans, groups: list };
  }

  function importResult(work: { plans: RowPlan[]; groups: Group[] }, applied: boolean, message: string | null) {
    const errors = work.plans.flatMap((r) => r.problems.map((pr) => ({ rowNo: r.rowNo, field: pr.field, message: pr.message })));
    const newSuppliers = new Set<string>();
    let planCount = 0;
    let lineCount = 0;
    let skipCount = 0;
    const plans = work.groups.map((g) => {
      const f = g.rows[0];
      if (g.action === "NEW") {
        planCount++;
        lineCount += g.rows.length;
        if (f.supplier!.newName) newSuppliers.add(f.supplier!.key);
      } else skipCount++;
      const notes: string[] = [];
      if (f.date! < ctx.today) notes.push("도착일이 지났습니다");
      if (f.time && Number(f.time.slice(0, 2)) >= 12) notes.push("오후 입고 — 물류2팀과 먼저 협의");
      return {
        action: g.action, rowNos: g.rows.map((r) => r.rowNo), type: f.type, supplierName: f.supplier!.existing?.name ?? f.supplier!.newName,
        newSupplier: Boolean(f.supplier!.newName), number: f.number ?? null, warehouseName: f.warehouse!.name, expectedDate: f.date,
        arrivalTime: f.time ?? null, lineCount: g.rows.length, qty: g.rows.reduce((a, r) => a + r.qty!, 0), existingNo: g.existingNo,
        inboundNo: g.inboundNo, notes
      };
    });
    return {
      applied, totalRows: work.plans.length, planCount, lineCount, newSupplierCount: newSuppliers.size, skipCount,
      errorCount: work.plans.filter((r) => r.problems.length).length, plans, errors, message
    };
  }

  function applyImport(body: AnyRecord) {
    const work = planImport(body);
    const errorRows = work.plans.filter((r) => r.problems.length).length;
    if (errorRows) throw new Error(`오류가 있는 줄이 ${errorRows}개라 반영하지 않았습니다 — 파일을 고쳐 다시 올리세요.`);
    const creates = work.groups.filter((g) => g.action === "NEW");
    if (!creates.length) return importResult(work, true, "새로 만들 입고예정이 없습니다 — 모두 이미 있습니다.");
    const made = new Map<string, AnyRecord>();
    for (const g of creates) {
      const s = g.rows[0].supplier!;
      if (!s.existing) {
        if (!made.has(s.key)) made.set(s.key, createSupplier(s.newName!, s.newType!, s.newErp ?? null));
        s.existing = made.get(s.key)!;
      }
    }
    const file = clean(body.fileName) ?? "엑셀";
    for (const g of creates) {
      const f = g.rows[0];
      const h: Header = {
        type: f.type!, supplier: f.supplier!.existing!, poNo: f.type === MOVE ? null : f.number ?? null, moveRef: f.type === MOVE ? f.number ?? null : null,
        warehouse: f.warehouse!, expectedAt: f.date!, arrivalTime: f.time ?? null, vehicle: (g.head["차량"] as string) ?? null,
        palletQty: (g.head["파레트 수"] as number) ?? null, driverPhone: (g.head["기사 연락처"] as string) ?? null, remark: (g.head["메모"] as string) ?? null
      };
      const lines = g.rows.map((r) => ({ item: r.item!, qty: r.qty! }));
      const row = insert(h, lines, "EXCEL");
      g.inboundNo = row.inboundNo;
      logInbound(row.inboundNo, "입고예정 등록", `엑셀(${file.slice(0, 60)}) — ${summary(h, lines)}`);
    }
    const newSuppliers = new Set(creates.map((g) => g.rows[0].supplier!).filter((s) => s.newName).map((s) => s.key)).size;
    const skipped = work.groups.length - creates.length;
    const lineCount = creates.reduce((a, g) => a + g.rows.length, 0);
    return importResult(work, true, `입고예정 ${creates.length}건을 만들었습니다 (품목 ${lineCount}줄${newSuppliers ? ` · 새 공급사 ${newSuppliers}` : ""}${skipped ? ` · 이미 있어 건너뜀 ${skipped}` : ""})`);
  }

  return {
    /** GET — 처리하지 않는 주소면 undefined */
    get(clean: string): unknown {
      if (clean === "/inbounds/plan-options") {
        need();
        return {
          suppliers: [...partners].sort((a, b) => String(a.name).localeCompare(String(b.name), "ko")),
          warehouses: ctx.warehouses.map(({ id, code, name, type }) => ({ id, code, name, type })),
          defaultWarehouseId: defaultWarehouse()?.id ?? null
        };
      }
      if (clean === "/inbounds/plan-items") {
        need();
        return activeItems()
          .map((it) => ({ id: it.id, code: it.itemCode, erpItemCode: it.erpItemCode ?? null, name: it.itemName, spec: it.spec ?? null, unit: it.unit ?? "EA" }))
          .sort((a, b) => a.code.localeCompare(b.code));
      }
      const m = clean.match(/^\/inbounds\/(\d+)\/plan$/);
      if (m) return planView(Number(m[1]));
      return undefined;
    },
    /** 쓰기 — [결과, 서버 문구]. 처리하지 않는 주소면 undefined */
    mutate(method: string, clean: string, body: AnyRecord): [unknown, string | null] | undefined {
      if (method === "POST" && clean === "/inbounds") return create(body);
      if (method === "PUT" && /^\/inbounds\/\d+$/.test(clean)) return update(Number(clean.split("/")[2]), body);
      if (method === "POST" && clean === "/inbounds/suppliers") return addSupplier(body);
      if (method === "POST" && clean === "/inbounds/import/preview") {
        need();
        return [importResult(planImport(body), false, null), null];
      }
      if (method === "POST" && clean === "/inbounds/import") {
        need();
        const result = applyImport(body);
        return [result, result.message];
      }
      return undefined;
    }
  };
}
