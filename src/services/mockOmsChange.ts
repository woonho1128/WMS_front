/* ============================================================
   목(mock) — 변경·취소 확인
   · 피킹이 시작된 뒤 주문 시스템에서 온 변경 · 취소 (확인 대기 / 처리 완료)
   · 승인: 변경은 요청대로 바꾸고 출고대기로(송장 · 배차를 지운다), 취소는 '취소' 로
   · 거절: 출고는 그대로, 사유를 남긴다
   · 승인 · 거절은 관리자 · 물류만 (서버와 같다). 확인 대기가 있는 출고는 출고 확정이 막힌다
   ⚠ 목 피킹은 재고를 덜어 내지 않으므로 승인해도 재고 수는 바꾸지 않는다 (사내 빌드는 서버가 LOT 그대로 되돌린다).
     새로고침하면 처음 상태로 돌아간다. 사람 이름 · 전화번호는 가짜 값이다.
   ============================================================ */

type AnyRecord = Record<string, any>;

type Kind = "CHANGE" | "CANCEL";
type Status = "PENDING" | "APPLIED" | "REJECTED" | "SUPERSEDED";

type ProposedLine = { lineNo: number; productCode: string; productName: string; qty: number };

type MockChange = {
  id: number;
  outboundId: number;
  kind: Kind;
  status: Status;
  revision: number;
  appliedRevision: number;
  source: string;
  messageId: string;
  reason: string | null;
  decisionReason: string | null;
  receivedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** 바뀌는 머리 칸 — 변경만 */
  fields: Array<{ label: string; before: string | null; after: string | null; apply?: (o: AnyRecord) => void }>;
  /** 요청 줄 — 변경만 */
  lines: ProposedLine[];
  /** 집어 둔 LOT (피킹 완료한 건만) */
  lots: Array<{ itemCode: string; itemName: string; locationCode: string; lotNo: string; receivedDate: string; qty: number }>;
  /** 이 화면에서 처리한 순서 — 처리 완료 목록의 맨 앞에 (처리 시각은 목 날짜 + 실제 시각이라 시드와 순서가 어긋날 수 있다) */
  decidedOrder?: number;
};

type LogEntry = { refNo: string; action: string; detail: string; operator: string; createdAt: string };

export type OmsChangeMockCtx = {
  today: string;
  outbounds: () => AnyRecord[];
  outboundLines: () => Record<number, AnyRecord[]>;
  /** 배차를 지운다 (변경 · 취소 승인) */
  removeDispatch: (outboundNo: string) => void;
  role: () => string | undefined;
  operator: () => string;
  log: (entry: LogEntry) => void;
};

const MANAGER_ROLES = new Set(["admin", "logistics"]);
const NOT_MANAGER = "변경 · 취소 승인과 거절은 관리자 · 물류 담당자만 할 수 있습니다.";

const stamp = (day: string) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

export function createOmsChangeMock(ctx: OmsChangeMockCtx) {
  let seeded = false;
  let decidedSeq = 0;
  const changes: MockChange[] = [];

  /** 목 출고 데이터(mockApi)에 맞춘 시드 — 처음 쓸 때 한 번 */
  const seed = () => {
    if (seeded) return;
    seeded = true;
    changes.push(
      {
        // 포장까지 끝난 건의 수량 · 배송희망일 · 메모 변경 (개정 3 — 앞의 개정 2는 이것이 대신했다)
        id: 9003, outboundId: 62, kind: "CHANGE", status: "PENDING", revision: 3, appliedRevision: 1, source: "OMS",
        messageId: "mock-chg-62-r3", reason: null, decisionReason: null, receivedAt: `${ctx.today} 09:12`, decidedAt: null, decidedBy: null,
        fields: [
          { label: "배송희망일", before: "2026-06-20", after: "2026-06-22", apply: (o) => { o.scheduledDate = "2026-06-22"; } },
          { label: "희망 시간", before: "13:00", after: "15:00" },
          { label: "출고메모", before: null, after: "오후 3시 이후 도착 · 하차 전 연락" }
        ],
        lines: [{ lineNo: 1, productCode: "SKU-10241", productName: "무선 블루투스 이어버드 (블랙)", qty: 30 }],
        lots: [{ itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", locationCode: "PC-A-01", lotNo: "LOT260407-0006", receivedDate: "2026-04-07", qty: 32 }]
      },
      {
        // 피킹 중 취소 — 아직 덜어 낸 재고가 없다
        id: 9004, outboundId: 70, kind: "CANCEL", status: "PENDING", revision: 2, appliedRevision: 1, source: "OMS",
        messageId: "mock-cnl-70-r2", reason: "고객 변심 — 주문 취소", decisionReason: null, receivedAt: `${ctx.today} 10:05`, decidedAt: null, decidedBy: null,
        fields: [], lines: [], lots: []
      },
      {
        id: 9002, outboundId: 62, kind: "CHANGE", status: "SUPERSEDED", revision: 2, appliedRevision: 1, source: "OMS",
        messageId: "mock-chg-62-r2", reason: null, decisionReason: null, receivedAt: `${ctx.today} 08:40`, decidedAt: `${ctx.today} 09:12`, decidedBy: "system",
        fields: [{ label: "배송희망일", before: "2026-06-20", after: "2026-06-21" }],
        lines: [{ lineNo: 1, productCode: "SKU-10241", productName: "무선 블루투스 이어버드 (블랙)", qty: 32 }], lots: []
      },
      {
        id: 9001, outboundId: 57, kind: "CHANGE", status: "REJECTED", revision: 2, appliedRevision: 1, source: "OMS",
        messageId: "mock-chg-57-r2", reason: null, decisionReason: "이미 포장 · 상차 완료 · 다음 주문으로 요청해 주세요",
        receivedAt: "2026-06-16 16:20", decidedAt: "2026-06-16 16:40", decidedBy: "logistics",
        fields: [{ label: "주소", before: "경기 부천시 길주로 210", after: "경기 부천시 길주로 212" }],
        lines: [{ lineNo: 1, productCode: "SKU-10241", productName: "무선 블루투스 이어버드 (블랙)", qty: 31 }], lots: []
      }
    );
  };

  const outboundOf = (c: MockChange) => ctx.outbounds().find((o) => o.id === c.outboundId);
  const currentLines = (c: MockChange) =>
    (ctx.outboundLines()[c.outboundId] ?? []).map((ln, idx) => ({
      lineNo: idx + 1,
      productCode: String(ln.itemCode),
      productName: String(ln.itemName),
      qty: Number(ln.orderQty) || 0,
      // 서버처럼 피킹 완료 때 집은 수량이 생긴다 — 피킹 중에는 0
      pickedQty: outboundOf(c)?.status === "피킹완료" ? Number(ln.pickedQty) || 0 : 0
    }));
  const pickedOf = (c: MockChange) => currentLines(c).reduce((sum, ln) => sum + ln.pickedQty, 0);

  const row = (c: MockChange) => {
    const o = outboundOf(c);
    return {
      id: c.id,
      outboundId: c.outboundId,
      requestNo: o?.outboundNo ?? `#${c.outboundId}`,
      orderNo: o ? `OD${String(o.outboundNo).slice(-8)}` : null,
      kind: c.kind,
      status: c.status,
      revision: c.revision,
      appliedRevision: c.appliedRevision,
      outboundStatus: o?.status ?? "-",
      customerName: o?.customerName ?? null,
      scheduledDate: o?.scheduledDate ?? null,
      source: c.source,
      messageId: c.messageId,
      reason: c.reason,
      decisionReason: c.decisionReason,
      receivedAt: c.receivedAt,
      decidedAt: c.decidedAt,
      decidedBy: c.decidedBy,
      pickedQty: pickedOf(c)
    };
  };

  /** 서버 OmsChangeReviewService.compareLines 와 같은 규칙 — 줄 번호로 맞춘다 */
  const compare = (c: MockChange) => {
    const before = currentLines(c);
    if (c.kind === "CANCEL") {
      return before.map((b) => ({ ...b, erpItemCode: null, beforeQty: b.qty, afterQty: null, mark: "REMOVED" }));
    }
    const nos = Array.from(new Set([...before.map((b) => b.lineNo), ...c.lines.map((a) => a.lineNo)])).sort((x, y) => x - y);
    const out: AnyRecord[] = [];
    nos.forEach((no) => {
      const b = before.find((x) => x.lineNo === no);
      const a = c.lines.find((x) => x.lineNo === no);
      if (b && a && b.productCode === a.productCode) {
        out.push({ lineNo: no, productCode: b.productCode, productName: a.productName, erpItemCode: null, beforeQty: b.qty, afterQty: a.qty, pickedQty: b.pickedQty, mark: b.qty === a.qty ? "SAME" : "QTY" });
        return;
      }
      if (b) out.push({ lineNo: no, productCode: b.productCode, productName: b.productName, erpItemCode: null, beforeQty: b.qty, afterQty: null, pickedQty: b.pickedQty, mark: "REMOVED" });
      if (a) out.push({ lineNo: no, productCode: a.productCode, productName: a.productName, erpItemCode: null, beforeQty: null, afterQty: a.qty, pickedQty: null, mark: "ADDED" });
    });
    return out;
  };

  /** 서버와 같은 막는 이유 — 대기 중에 보류(출고 불가)가 됐어도 승인할 수 있다 */
  const blockReason = (c: MockChange) => {
    const status = outboundOf(c)?.status ?? "-";
    const ok = ["출고대기", "피킹중", "피킹완료", "보류"];
    if (!ok.includes(status)) return `${status} 상태라 ${c.kind === "CANCEL" ? "취소를" : "변경을"} 승인할 수 없습니다 — 거절하세요.`;
    return null;
  };

  const fieldsOf = (c: MockChange) => c.fields.map((f) => ({ label: f.label, before: f.before, after: f.after }));

  const detail = (c: MockChange) => {
    if (c.status !== "PENDING") {
      return { change: row(c), fields: fieldsOf(c), lines: compare(c), lots: [], canApprove: false, blockReason: "이미 처리한 요청입니다." };
    }
    const block = blockReason(c);
    const lots = outboundOf(c)?.status === "피킹완료" ? c.lots : [];
    return { change: row(c), fields: fieldsOf(c), lines: compare(c), lots, canApprove: block == null, blockReason: block };
  };

  const pendingOf = (id: number) => {
    const c = changes.find((x) => x.id === id);
    if (!c) throw new Error("변경 요청을 찾을 수 없습니다.");
    if (c.status !== "PENDING") throw new Error(`이미 처리한 요청입니다 (${c.status}) — 목록을 새로 고치세요.`);
    if (!MANAGER_ROLES.has(ctx.role() ?? "")) throw new Error(NOT_MANAGER);
    return c;
  };

  const approve = (id: number) => {
    const c = pendingOf(id);
    const block = blockReason(c);
    if (block) throw new Error(block);
    const o = outboundOf(c);
    if (!o) throw new Error("출고 건을 찾을 수 없습니다.");
    const lines = ctx.outboundLines()[c.outboundId] ?? [];
    const putBack = o.status === "피킹완료" ? pickedOf(c) : 0;
    ctx.removeDispatch(String(o.outboundNo));
    lines.forEach((ln) => {
      ln.pickedQty = 0;
      ln.scanned = false;
    });
    const operator = ctx.operator();
    c.status = "APPLIED";
    c.decidedAt = stamp(ctx.today);
    c.decidedBy = operator;
    c.decidedOrder = ++decidedSeq;
    const returned = putBack > 0 ? `집어 둔 ${putBack}개를 피킹한 LOT 그대로 되돌림` : "집어 둔 물건 없음";
    if (c.kind === "CANCEL") {
      o.status = "취소";
      ctx.log({ refNo: o.outboundNo, action: "OMS취소승인", detail: `취소 승인 (개정 ${c.revision}) — ${returned} · ${operator}`, operator, createdAt: c.decidedAt });
      return { message: `${o.outboundNo} 취소 승인 — ${returned}.`, outboundStatus: "취소", putBackQty: putBack };
    }
    c.fields.forEach((f) => f.apply?.(o));
    c.lines.forEach((pl) => {
      const ln = lines[pl.lineNo - 1];
      if (ln) ln.orderQty = pl.qty;
    });
    o.qty = lines.reduce((sum, ln) => sum + (Number(ln.orderQty) || 0), 0);
    o.status = "출고대기";
    o.invoiceNo = null;
    ctx.log({ refNo: o.outboundNo, action: "OMS변경승인", detail: `변경 승인 (개정 ${c.revision}) — ${returned} · 출고대기로 (다시 피킹) · ${operator}`, operator, createdAt: c.decidedAt });
    return { message: `${o.outboundNo} 변경 승인 — ${returned}. 출고대기로 돌렸습니다: 출고요청서를 다시 뽑아 피킹하세요.`, outboundStatus: "출고대기", putBackQty: putBack };
  };

  const reject = (id: number, reason: unknown) => {
    const text = String(reason ?? "").trim();
    if (!text) throw new Error("거절 사유를 넣으세요 — 주문 시스템에 그대로 전해집니다.");
    if (text.length > 200) throw new Error("거절 사유는 200자까지입니다.");
    const c = pendingOf(id);
    const o = outboundOf(c);
    const operator = ctx.operator();
    c.status = "REJECTED";
    c.decisionReason = text;
    c.decidedAt = stamp(ctx.today);
    c.decidedBy = operator;
    c.decidedOrder = ++decidedSeq;
    const what = c.kind === "CANCEL" ? "취소" : "변경";
    ctx.log({ refNo: o?.outboundNo ?? "-", action: "OMS변경거절", detail: `${what} 요청 거절 (개정 ${c.revision}) — ${text} · ${operator}`, operator, createdAt: c.decidedAt });
    return { message: `${o?.outboundNo ?? "-"} ${what} 요청 거절 — 출고는 그대로 진행합니다. 사유가 주문 시스템에 전해집니다.`, outboundStatus: o?.status ?? "-", putBackQty: 0 };
  };

  return {
    /** 확인을 기다리는 변경 · 취소 수 — /outbounds 의 pendingChanges, 출고 확정 막기 */
    pendingCount: (outboundId: number) => {
      seed();
      return changes.filter((c) => c.outboundId === outboundId && c.status === "PENDING").length;
    },
    /** GET — 처리하지 않는 경로면 undefined */
    get: (clean: string, params: URLSearchParams): unknown => {
      seed();
      if (clean === "/outbound-requests/changes") {
        const wantDone = params.get("state") === "done";
        return changes
          .filter((c) => (wantDone ? c.status !== "PENDING" : c.status === "PENDING"))
          .sort((a, b) =>
            wantDone
              ? (b.decidedOrder ?? 0) - (a.decidedOrder ?? 0) || String(b.decidedAt).localeCompare(String(a.decidedAt))
              : a.receivedAt.localeCompare(b.receivedAt)
          )
          .map(row);
      }
      const match = clean.match(/^\/outbound-requests\/changes\/(\d+)$/);
      if (match) {
        const c = changes.find((x) => x.id === Number(match[1]));
        if (!c) throw new Error("변경 요청을 찾을 수 없습니다.");
        return detail(c);
      }
      return undefined;
    },
    mutate: (method: string, clean: string, body: AnyRecord): unknown => {
      seed();
      const match = clean.match(/^\/outbound-requests\/changes\/(\d+)\/(approve|reject)$/);
      if (!match || method !== "POST") return undefined;
      return match[2] === "approve" ? approve(Number(match[1])) : reject(Number(match[1]), body.reason);
    }
  };
}
