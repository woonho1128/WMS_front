/* ============================================================
   목(mock) — 대시보드 현황 (입고 · 출고 · 재고) · 작업 알림
   · 오늘(MOCK_TODAY) 처리한 입고·출고 건을 시드로 만들어 기존 목 배열에 넣는다
     → 입고 예정 · 격납 · 피킹 · 출고 확정 · 배차 · 3D 우클릭 메뉴에도 같은 건이 보인다
   · 대시보드 숫자는 목에 적어두지 않고 입고·출고·재고·실사·반품·연동 배열에서 계산한다
   · 시간별 처리량은 작업 이벤트(입고확정 · 격납 · 피킹 · 출고확정) 시각으로 집계한다.
     화면에서 처리하면 record() 로 이벤트가 쌓여 바로 반영된다 (실서버: activity_log · transfer)
   · 7일 추세 가운데 지난 6일은 시드값이다
   ============================================================ */

type AnyRecord = Record<string, any>;

export type DashboardMockCtx = {
  today: string;
  items: AnyRecord[];
  warehouses: AnyRecord[];
  inbounds: () => AnyRecord[];
  inboundLines: Record<number, AnyRecord[]>;
  /** 도크·검수라인 예약 { inboundNo, date, lane, from, to } — 오늘 작업 건 예약을 시드한다 */
  dockReservations: () => AnyRecord[];
  outbounds: () => AnyRecord[];
  outboundLines: Record<number, AnyRecord[]>;
  stocks: () => AnyRecord[];
  nextStockId: () => number;
  returns: () => AnyRecord[];
  stocktakings: () => AnyRecord[];
  interfaces: () => AnyRecord[];
  dispatched: () => AnyRecord[];
  replenishment: () => AnyRecord[];
  shortage: () => AnyRecord[];
  erpRows: () => AnyRecord[];
  /** 이천 레이아웃 슬롯 — 허용 하중 초과 칸 판정 */
  slots: () => AnyRecord[];
};

export type WorkEventKind = "inbound-confirm" | "putaway" | "picking" | "outbound-confirm";
type WorkEvent = { day: string; at: string; kind: WorkEventKind; qty: number; ref: string };

type Tone = "info" | "success" | "warning" | "danger" | "violet" | "teal" | "gray";
type Severity = "danger" | "warning" | "info";
type Category = "재고" | "입고" | "출고" | "반품" | "연동";
type Alert = {
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  refs: string[];
  /** 일이 생긴 시각(반품 수신·ERP 전송 등) — 재고·지연처럼 상태에서 계산한 알림은 null */
  at: string | null;
  action: { label: string; to: string } | null;
};

const pad = (value: number, size = 2) => String(value).padStart(size, "0");
const sumOf = <T,>(list: T[], pick: (item: T) => number) => list.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
const percent = (part: number, whole: number, digits = 1) =>
  whole > 0 ? Math.round((part / whole) * 100 * 10 ** digits) / 10 ** digits : 0;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000));
const nowHm = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};
const nowMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};
const toHm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(Math.floor(minutes) % 60)}`;
const WORK_START = 8 * 60;
const WORK_END = 18 * 60;
/** 시드 작업 계획의 마지막 시각 — 지금이 이보다 이르면 계획 시각을 08:00~지금 사이로 줄여 '미래 이벤트'가 없게 한다 */
const SEED_LAST = 14 * 60 + 30;
const seedAt = (planned: string) => {
  const now = nowMinutes();
  if (now >= SEED_LAST || now < WORK_START + 30) return planned;
  const [hour, minute] = planned.split(":").map(Number);
  return toHm(WORK_START + ((hour * 60 + minute - WORK_START) * (now - WORK_START)) / (SEED_LAST - WORK_START));
};
/** 하루 작업(08~18시) 가운데 지금까지 지난 비율 — 누적 지표의 '전일 동시간' 값 (실서버: 어제 같은 시각까지의 이벤트 합계) */
const dayShare = () => Math.min(1, Math.max(0, (nowMinutes() - WORK_START) / (WORK_END - WORK_START)));
const mmdd = (day: string) => day.slice(5);
const n = (value: number) => value.toLocaleString("ko-KR");
/** 배송지 주소로 배차 권역을 가른다 — 수도권 배차 · 지방권 배차 화면 기준 */
export const regionOf = (address: unknown) => (/^(서울|경기|인천)/.test(String(address ?? "")) ? "수도권" : "지방권");
const byCode = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });

/* ---------------- 추세 시드 (지난 6일, 오래된 날 → 어제) ---------------- */
const HISTORY = {
  inboundOpen: [7, 6, 8, 5, 6, 7],
  inboundConfirmedQty: [1250, 980, 1460, 1120, 1310, 1190],
  putawayQty: [420, 380, 510, 350, 460, 440],
  returnsWaiting: [2, 1, 3, 2, 1, 2],
  outboundOrders: [11, 13, 9, 12, 14, 10],
  pickingRate: [92, 88, 95, 90, 93, 91],
  shippedQty: [120, 145, 98, 132, 150, 110],
  misshipRate: [0.31, 0.29, 0.27, 0.28, 0.26, 0.27],
  stockFactor: [0.97, 0.99, 1.01, 0.98, 1.0, 0.99],
  ira: [96.8, 97.4, 95.9, 98.2, 97.1, 96.5],
  erpMatch: [99.1, 98.7, 99.4, 99.0, 98.8, 99.2],
  shortageRisk: [3, 3, 2, 2, 3, 2]
};
/** 최근 30일 출고 수량(오늘 제외) — 오출률 분모 (실서버: 출고확정 이력 합계) */
const SHIPPED_30D = 3900;

/* ---------------- 오늘 작업 시드 ---------------- */
const SUPPLIERS = [
  { code: "SUP001", name: "다온테크놀로지" },
  { code: "SUP002", name: "미래전자부품" },
  { code: "SUP003", name: "대성정밀공업" },
  { code: "SUP004", name: "글로벌패키징" },
  { code: "OEM002", name: "인천외주가공" }
];

type InboundPlan = {
  supplier: number;
  warehouseId: number;
  status: "scheduled" | "registered" | "located" | "confirmed";
  /** [품목코드, 파레트 수] */
  items: Array<[string, number]>;
  confirmAt?: string;
  putawayAt?: string | null;
  shortBy?: number;
  remark?: string | null;
  /** 도크·검수라인 예약 — lane 은 mockApi DOCK_LANES 순번. 없으면 도크 미배정 */
  dock?: { lane: number; from: string; to: string };
};

const INBOUND_PLAN: InboundPlan[] = [
  { supplier: 3, warehouseId: 4, status: "confirmed", items: [["SKU-40310", 1], ["SKU-40015", 1]], confirmAt: "08:20", putawayAt: "09:05", remark: "오전 1차 도착", dock: { lane: 0, from: "08:00", to: "08:40" } },
  { supplier: 2, warehouseId: 4, status: "confirmed", items: [["SKU-30120", 2]], confirmAt: "09:35", putawayAt: "10:20", remark: null, dock: { lane: 1, from: "09:00", to: "09:50" } },
  { supplier: 1, warehouseId: 4, status: "confirmed", items: [["SKU-10301", 2], ["SKU-11020", 2]], confirmAt: "11:10", putawayAt: null, shortBy: 3, remark: "파손 3개 제외 입고", dock: { lane: 3, from: "10:20", to: "11:20" } },
  { supplier: 0, warehouseId: 4, status: "located", items: [["SKU-21040", 3]], remark: null, dock: { lane: 0, from: "11:30", to: "12:30" } },
  { supplier: 0, warehouseId: 1, status: "registered", items: [["SKU-10241", 2], ["SKU-30001", 3]], remark: "오후 도착 예정", dock: { lane: 1, from: "14:00", to: "15:00" } },
  { supplier: 4, warehouseId: 5, status: "scheduled", items: [["SKU-20114", 10]], remark: null }
];

const CUSTOMERS = [
  { code: "219475", name: "대림 스마트몰", address: "경기 화성시 동탄대로 620", carrier: "가람택배" },
  { code: "305118", name: "도담유통", address: "인천 남동구 논현로 45", carrier: "한길택배" },
  { code: "552031", name: "청람종합상사", address: "부산 동래구 충렬대로 210", carrier: "한길택배" },
  { code: "410227", name: "해림상사", address: "대전 유성구 테크노중앙로 12", carrier: "나루택배" },
  { code: "660912", name: "(주)해든리테일", address: "경기 용인시 기흥구 중부대로 184", carrier: "온길택배" },
  { code: "051794", name: "대림바스(주)", address: "충북 청주시 흥덕구 가경로 50", carrier: "사내차량" },
  { code: "771205", name: "한울 트레이더스", address: "서울 강남구 테헤란로 152", carrier: "나루택배" },
  { code: "132906", name: "주식회사 나래유통", address: "경기 부천시 길주로 210", carrier: "한길택배" }
];

const CARRIER_CODE: Record<string, string> = { 한길택배: "HG", 가람택배: "GR", 나루택배: "NR", 온길택배: "OG", 사내차량: "IN" };

type OutboundPlan = {
  customer: number;
  status: "출고대기" | "피킹중" | "피킹완료" | "출고완료";
  lines: number;
  pickAt?: string;
  shipAt?: string;
  /** 피킹중일 때 피킹한 비율 */
  picked?: number;
  invoice?: boolean;
  dispatched?: boolean;
  /** 가용보다 많이 주문 — 피킹 재고 부족 알림을 보여주기 위해 */
  overAvailable?: boolean;
  outType?: string;
};

const OUTBOUND_PLAN: OutboundPlan[] = [
  { customer: 0, status: "출고완료", lines: 2, pickAt: "08:40", shipAt: "09:30", invoice: true, dispatched: true },
  { customer: 1, status: "출고완료", lines: 1, pickAt: "09:15", shipAt: "10:45", invoice: true, dispatched: true },
  { customer: 2, status: "출고완료", lines: 2, pickAt: "10:05", shipAt: "11:40", invoice: true, dispatched: false },
  { customer: 4, status: "피킹완료", lines: 1, pickAt: "11:20", invoice: true },
  { customer: 3, status: "피킹완료", lines: 2, pickAt: "13:05", invoice: false },
  { customer: 6, status: "피킹중", lines: 2, pickAt: "13:40", picked: 0.6 },
  { customer: 7, status: "피킹중", lines: 1, pickAt: "14:10", picked: 0.25 },
  { customer: 5, status: "출고대기", lines: 1, outType: "A/S 출고(유상)" },
  { customer: 0, status: "출고대기", lines: 2 },
  { customer: 1, status: "출고대기", lines: 1, overAvailable: true }
];

/* ---------------- 단계 정의 ---------------- */
const INBOUND_STAGES: Array<{ key: string; label: string; hint: string; tone: Tone; progress: number; to: string }> = [
  { key: "scheduled", label: "입고예정", hint: "입고 등록 필요", tone: "gray", progress: 0, to: "/inbound/inbound-schedule" },
  { key: "registered", label: "입고등록", hint: "로케이션 지정 필요", tone: "info", progress: 25, to: "/inbound/inbound-schedule" },
  { key: "located", label: "로케이션 지정", hint: "검수·입고확정 필요", tone: "warning", progress: 50, to: "/inbound/inbound-confirm" },
  { key: "putaway", label: "격납 대기", hint: "격납 필요", tone: "violet", progress: 75, to: "/stock/putaway" },
  { key: "done", label: "입고 완료", hint: "격납까지 끝남", tone: "success", progress: 100, to: "/history/inbound-history" }
];

const OUTBOUND_STAGES: Array<{ key: string; label: string; hint: string; tone: Tone }> = [
  { key: "출고대기", label: "출고대기", hint: "피킹 시작 필요", tone: "gray" },
  { key: "피킹중", label: "피킹중", hint: "품목 스캔 중", tone: "info" },
  { key: "피킹완료", label: "피킹완료", hint: "송장·출고확정 필요", tone: "warning" },
  { key: "출고완료", label: "출고완료", hint: "배차·배송", tone: "success" }
];

const INBOUND_KIND_TONE: Record<string, Tone> = { 일반: "info", 외주: "violet", 이동: "teal" };
const BREAKDOWN_TONES: Tone[] = ["info", "teal", "violet", "warning", "success", "gray"];

export function createDashboardMock(ctx: DashboardMockCtx) {
  const events: WorkEvent[] = [];
  const itemOf = (code: string) => ctx.items.find((item) => item.itemCode === code);
  const warehouseOf = (id: number) => ctx.warehouses.find((warehouse) => warehouse.id === id);

  /* ---------------- 시드 ---------------- */
  const seed = () => {
    const ymd = ctx.today.replace(/-/g, "");
    const inboundIds = new Set(ctx.inbounds().map((row) => row.id));
    const outboundIds = new Set(ctx.outbounds().map((row) => row.id));

    // 입고 — 오늘 도착·검수·격납 진행 건
    INBOUND_PLAN.forEach((plan, index) => {
      const id = 300 + index;
      if (inboundIds.has(id)) return;
      const warehouse = warehouseOf(plan.warehouseId);
      const supplier = SUPPLIERS[plan.supplier];
      const consign = warehouse?.type === "외주";
      const inboundNo = `IN-${ymd}-${pad(index + 1, 3)}`;
      const lines = plan.items.map(([code, pallets], lineIndex) => {
        const item = itemOf(code);
        const expectedQty = (Number(item?.unitsPerPallet) || 10) * pallets;
        const received = plan.status === "confirmed" ? expectedQty - (lineIndex === 0 ? plan.shortBy ?? 0 : 0) : 0;
        return {
          id: 3000 + index * 10 + lineIndex,
          itemCode: code,
          itemName: item?.itemName ?? code,
          spec: item?.spec ?? "",
          unit: item?.unit ?? "EA",
          consign,
          locationCode: plan.status === "located" || plan.status === "confirmed" ? "IC-DOCK-01" : null,
          locationId: null,
          trackingNo: `TR-${inboundNo}-${lineIndex + 1}`,
          inspected: plan.status === "confirmed",
          expectedQty,
          receivedQty: received
        };
      });
      ctx.inbounds().push({
        id,
        inboundNo,
        poNo: consign ? `OPO-${pad(10 + index, 3)}` : `PO-92${pad(10 + index, 2)}`,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        warehouseId: plan.warehouseId,
        warehouseName: warehouse?.name ?? "-",
        warehouseType: warehouse?.type ?? "일반",
        type: consign ? "외주" : "일반",
        inTypeCode: consign ? "OEM" : "DGR",
        inTypeName: consign ? "외주입고" : "국내입고",
        purchaseGroupCode: index % 2 ? "PG41" : "PG33",
        purchaseGroupName: index % 2 ? "이지은" : "박서준",
        remark: plan.remark ?? null,
        status: plan.status,
        expectedAt: ctx.today,
        qty: sumOf(lines, (line) => line.expectedQty)
      });
      ctx.inboundLines[id] = lines;

      if (plan.dock) {
        // 끝난 건은 입고확정 이벤트처럼 지금 시각 앞으로 당긴다(최소 30분). 남은 건은 계획 시각 그대로 — 시간이 지나면 화면에서 지연으로 보인다
        const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
        const done = plan.status === "confirmed";
        const from = minutesOf(done ? seedAt(plan.dock.from) : plan.dock.from);
        const to = done ? Math.max(from + 30, minutesOf(seedAt(plan.dock.to))) : minutesOf(plan.dock.to);
        ctx.dockReservations().push({ inboundNo, date: ctx.today, lane: plan.dock.lane, from, to });
      }

      if (plan.status !== "confirmed") return;
      const receivedQty = sumOf(lines, (line) => line.receivedQty);
      events.push({ day: ctx.today, at: seedAt(plan.confirmAt ?? "09:00"), kind: "inbound-confirm", qty: receivedQty, ref: inboundNo });
      if (plan.putawayAt) {
        events.push({ day: ctx.today, at: seedAt(plan.putawayAt), kind: "putaway", qty: receivedQty, ref: `LOT-${inboundNo}` });
        return;
      }
      // 격납 전 — 입고장에 격납대기 재고로 남아 있다 (격납 대기 화면에서 처리)
      lines.forEach((line) => {
        const item = itemOf(line.itemCode);
        ctx.stocks().push({
          stockId: ctx.nextStockId(),
          itemCode: line.itemCode,
          itemName: line.itemName,
          warehouseId: plan.warehouseId,
          warehouseName: warehouse?.name ?? "-",
          warehouseType: warehouse?.type ?? "일반",
          zoneName: "이천 입고장",
          locationCode: "IC-DOCK-01",
          locationType: "PICKING",
          lotNo: `LOT-${inboundNo}`,
          stockStatus: "PUTAWAY_WAIT",
          receivedDate: ctx.today,
          onHand: line.receivedQty,
          allocated: 0,
          available: 0,
          safetyStock: Number(item?.safetyStock) || 0,
          unit: line.unit
        });
      });
    });

    // 출고 — 이천 피킹 로케이션 재고에서 나가는 오늘 주문 (3D 우클릭의 피킹 대기 주문과 이어진다)
    const reserved = new Set(["A-05", "A-09", "B-18", ...ctx.replenishment().map((row) => String(row.pickingLocationCode))]);
    const candidates = ctx
      .stocks()
      .filter(
        (stock) =>
          stock.warehouseId === 4 &&
          stock.locationType === "PICKING" &&
          stock.stockStatus === "AVAILABLE" &&
          Number(stock.available) >= 8 &&
          !reserved.has(stock.locationCode)
      )
      .sort((a, b) => byCode(a.locationCode, b.locationCode));

    OUTBOUND_PLAN.forEach((plan, index) => {
      const id = 200 + index;
      if (outboundIds.has(id) || !candidates.length) return;
      const customer = CUSTOMERS[plan.customer];
      const outboundNo = `DN20260601${pad(23 + index, 3)}`;
      const used = new Set<number>();
      const lines = Array.from({ length: plan.lines }, (_, lineIndex) => {
        let pick = (index * 7 + lineIndex * 3) % candidates.length;
        while (used.has(pick)) pick = (pick + 1) % candidates.length;
        used.add(pick);
        const stock = candidates[pick];
        const available = Number(stock.available);
        const orderQty = plan.overAvailable ? available + 12 : Math.min(available, 6 + ((index + lineIndex) % 4) * 6);
        const pickedQty =
          plan.status === "출고완료" || plan.status === "피킹완료" ? orderQty
          : plan.status === "피킹중" ? Math.floor(orderQty * (plan.picked ?? 0.5))
          : 0;
        return {
          id: 5000 + index * 10 + lineIndex,
          itemCode: stock.itemCode,
          itemName: stock.itemName,
          unit: stock.unit,
          consign: false,
          orderQty,
          pickedQty,
          availableQty: available,
          lotNo: stock.lotNo,
          locationCode: stock.locationCode,
          scanned: pickedQty > 0
        };
      });
      const qty = sumOf(lines, (line) => line.orderQty);
      const carrier = customer.carrier;
      ctx.outbounds().push({
        id,
        outboundNo,
        scheduledDate: ctx.today,
        customerCode: customer.code,
        customerName: customer.name,
        outType: plan.outType ?? "도소매출고",
        qty,
        carrier,
        shipAddress: customer.address,
        invoiceNo: plan.invoice ? `${CARRIER_CODE[carrier] ?? "WM"}260617${pad(100 + index, 4)}` : null,
        status: plan.status,
        rejectReason: null
      });
      ctx.outboundLines[id] = lines;

      const pickedQty = sumOf(lines, (line) => line.pickedQty);
      if (plan.pickAt && pickedQty > 0) events.push({ day: ctx.today, at: seedAt(plan.pickAt), kind: "picking", qty: pickedQty, ref: outboundNo });
      if (plan.shipAt) events.push({ day: ctx.today, at: seedAt(plan.shipAt), kind: "outbound-confirm", qty, ref: outboundNo });
      if (plan.dispatched) {
        ctx.dispatched().push({
          id: 100 + index,
          dispatchNo: `DP-260617-${pad(100 + index, 3)}`,
          outboundNo,
          customerName: customer.name,
          shipAddress: customer.address,
          region: regionOf(customer.address),
          carrierName: carrier,
          vehicleType: "1톤",
          totalWeightKg: 180 + index * 35,
          totalVolumeM3: Math.round((1.6 + index * 0.3) * 10) / 10,
          palletCount: 1 + (index % 2),
          dispatchDate: ctx.today
        });
      }
    });

    // 오늘 실사 — 이천 피킹·보관 로케이션을 고르게 돌며 센 결과 (재고 정확도 계산용)
    const counted = new Set(ctx.stocktakings().map((row) => `${row.locationCode}|${row.lotNo}`));
    const nextId = ctx.stocktakings().reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
    ctx
      .stocks()
      .filter((stock) => stock.warehouseId === 4 && stock.stockStatus === "AVAILABLE" && Number(stock.onHand) > 0)
      .sort((a, b) => byCode(a.locationCode, b.locationCode))
      .filter((_, index) => index % 9 === 0)
      .slice(0, 22)
      .forEach((stock, index) => {
        if (counted.has(`${stock.locationCode}|${stock.lotNo}`)) return;
        ctx.stocktakings().push({
          id: nextId + 1 + index,
          countDate: ctx.today,
          warehouseName: stock.warehouseName,
          locationCode: stock.locationCode,
          itemCode: stock.itemCode,
          itemName: stock.itemName,
          lotNo: stock.lotNo,
          systemQty: stock.onHand,
          countedQty: stock.onHand,
          diff: 0,
          status: "COUNTED",
          memo: null,
          createdBy: "inventory",
          adjustedAt: null
        });
      });
  };

  /* ---------------- 공통 계산 ---------------- */
  const todays = (kind: WorkEventKind) => events.filter((event) => event.day === ctx.today && event.kind === kind);

  const trend = (history: number[], today: number, kind: "line" | "bars") => ({ kind, values: [...history, today] });

  /** 어제 대비 — good: 이 방향 변화가 좋은가 (null = 좋고 나쁨 없음) */
  const delta = (today: number, yesterday: number, unit: string, higherIsGood: boolean | null, digits = 0, basis = "전일 대비") => {
    const diff = Math.round((today - yesterday) * 10 ** digits) / 10 ** digits;
    return { value: diff, unit, basis, good: higherIsGood === null || diff === 0 ? null : diff > 0 === higherIsGood, digits };
  };
  /** 오늘 쌓이는 지표(금일 확정·진행률)는 어제 마감값이 아니라 어제 같은 시각과 비교한다 */
  const deltaSoFar = (today: number, yesterdayFinal: number, unit: string, higherIsGood: boolean | null, digits = 0) =>
    delta(today, Math.round(yesterdayFinal * dayShare() * 10 ** digits) / 10 ** digits, unit, higherIsGood, digits, "전일 동시간");

  const hourly = (series: Array<{ kind: WorkEventKind; label: string; tone: Tone }>, unit: string) => {
    const list = events.filter((event) => event.day === ctx.today && series.some((item) => item.kind === event.kind));
    const eventHours = list.map((event) => Number(event.at.slice(0, 2)));
    const from = Math.min(8, ...eventHours);
    const to = Math.max(18, ...eventHours);
    const points = Array.from({ length: to - from + 1 }, (_, offset) => {
      const hour = from + offset;
      return {
        hour,
        values: series.map((item) => sumOf(list.filter((event) => event.kind === item.kind && Number(event.at.slice(0, 2)) === hour), (event) => event.qty))
      };
    });
    return {
      series: series.map(({ kind, label, tone }) => ({ key: kind, label, tone })),
      points,
      total: sumOf(list, (event) => event.qty),
      unit
    };
  };

  const inboundStage = (row: AnyRecord) => {
    if (row.status !== "confirmed") return String(row.status);
    const waiting = ctx
      .stocks()
      .some((stock) => stock.stockStatus === "PUTAWAY_WAIT" && stock.lotNo === `LOT-${row.inboundNo}` && Number(stock.onHand) > 0);
    return waiting ? "putaway" : "done";
  };

  const liveStocks = () => ctx.stocks().filter((stock) => Number(stock.onHand) > 0);

  /* ---------------- 알림 ---------------- */
  const buildAlerts = (): Alert[] => {
    const list: Alert[] = [];
    const push = (alert: Omit<Alert, "at"> & { at?: string | null }) => list.push({ at: null, ...alert });
    const stamp = (value: unknown) => (value ? String(value).replace("T", " ").slice(5, 16) : null);

    /* 재고 */
    ctx
      .shortage()
      .filter((row) => row.risk === "위험")
      .forEach((row) =>
        push({
          id: `short-${row.itemCode}`,
          severity: "danger",
          category: "재고",
          title: "쇼트 위험",
          message: `${row.itemCode} ${row.itemName} 가용 ${n(row.available)} / 안전재고 ${n(row.safetyStock)} ${row.unit} · ${row.daysOfStock}일분 남음${row.shortageEta ? ` · 쇼트 예상 ${mmdd(row.shortageEta)}` : ""}`,
          refs: [row.itemCode],
          action: { label: "쇼트 관리", to: "/analytics/shortage" }
        })
      );

    const replenish = ctx.replenishment();
    if (replenish.length) {
      const top = replenish[0];
      push({
        id: "replenish",
        severity: "warning",
        category: "재고",
        title: "보충 필요",
        message: `피킹 로케이션 ${replenish.length}곳이 파레트 단위에 못 미칩니다 — ${top.pickingLocationCode} ${top.itemName} ${n(top.shortQty)} ${top.unit} 부족${replenish.length > 1 ? ` 외 ${replenish.length - 1}곳` : ""}`,
        refs: [String(top.pickingLocationCode)],
        action: { label: "보충 작업", to: "/stock/replenishment" }
      });
    }

    const overweight = ctx.slots().filter((slot) => slot.maxLoadKg != null && Number(slot.loadKg) > Number(slot.maxLoadKg) + 1e-6);
    if (overweight.length) {
      push({
        id: "overweight",
        severity: "danger",
        category: "재고",
        title: "허용 하중 초과",
        message: `${overweight.length}칸 무게가 한도를 넘었습니다 — ${overweight
          .slice(0, 3)
          .map((slot) => `${slot.code} ${Math.round(slot.loadKg)}/${slot.maxLoadKg}kg`)
          .join(", ")}`,
        refs: overweight.slice(0, 3).map((slot) => String(slot.code)),
        action: { label: "로케이션 관리", to: "/master/location-master" }
      });
    }

    const aged = liveStocks()
      .filter((stock) => stock.stockStatus !== "PUTAWAY_WAIT" && daysBetween(stock.receivedDate, ctx.today) >= 365)
      .sort((a, b) => String(a.receivedDate).localeCompare(String(b.receivedDate)));
    if (aged.length) {
      const oldest = aged[0];
      push({
        id: "aging",
        severity: "warning",
        category: "재고",
        title: "장기재고",
        message: `입고 후 1년 넘은 재고 ${aged.length} LOT · ${n(sumOf(aged, (stock) => stock.onHand))}개 — 가장 오래된 ${oldest.lotNo} (${oldest.locationCode}, ${daysBetween(oldest.receivedDate, ctx.today)}일)`,
        refs: [String(oldest.lotNo), String(oldest.locationCode)],
        action: { label: "장기재고", to: "/analytics/aging-stock" }
      });
    }

    const erpDiffs = ctx.erpRows().filter((row) => Number(row.diff) !== 0);
    if (erpDiffs.length) {
      const first = erpDiffs[0];
      push({
        id: "erp",
        severity: "info",
        category: "재고",
        title: "ERP 재고 불일치",
        message: `${erpDiffs.length}건 — ${first.itemCode} ${first.locationCode} WMS ${n(first.wmsQty)} / ERP ${n(first.erpQty)}`,
        refs: [String(first.itemCode), String(first.locationCode)],
        action: { label: "ERP 재고 비교", to: "/stock/erp-compare" }
      });
    }

    const countDiffs = ctx.stocktakings().filter((row) => Number(row.diff) !== 0 && row.status !== "ADJUSTED");
    if (countDiffs.length) {
      const first = countDiffs[0];
      push({
        id: "count-diff",
        severity: "info",
        category: "재고",
        title: "실사 차이 미조정",
        message: `${countDiffs.length}건 — ${first.locationCode} ${first.itemName} 전산 ${n(first.systemQty)} / 실물 ${n(first.countedQty)}`,
        refs: [String(first.locationCode)],
        action: { label: "일일 실사", to: "/stock/stocktaking" }
      });
    }

    /* 입고 */
    ctx
      .inbounds()
      .filter((row) => ["scheduled", "registered", "located"].includes(row.status) && String(row.expectedAt) < ctx.today)
      .sort((a, b) => String(a.expectedAt).localeCompare(String(b.expectedAt)))
      .forEach((row) => {
        const stage = INBOUND_STAGES.find((item) => item.key === row.status);
        push({
          id: `in-late-${row.id}`,
          severity: "danger",
          category: "입고",
          title: "입고 지연",
          message: `${row.inboundNo} ${row.supplierName} · 예정일 ${mmdd(row.expectedAt)} (${daysBetween(row.expectedAt, ctx.today)}일 경과) · ${stage?.label ?? row.status} 단계`,
          refs: [String(row.inboundNo)],
          action: { label: stage?.key === "located" ? "입고 확정" : "입고 예정", to: stage?.to ?? "/inbound/inbound-schedule" }
        });
      });

    ctx
      .inbounds()
      .filter((row) => row.status === "located" || row.status === "confirmed")
      .forEach((row) => {
        (ctx.inboundLines[row.id] ?? [])
          .filter((line) => Number(line.receivedQty) > 0 && Number(line.receivedQty) !== Number(line.expectedQty))
          .forEach((line) => {
            const gap = Number(line.receivedQty) - Number(line.expectedQty);
            push({
              id: `in-diff-${line.id}`,
              severity: "warning",
              category: "입고",
              title: "검수 차이",
              message: `${row.inboundNo} ${line.itemName} 예정 ${n(line.expectedQty)} / 실입고 ${n(line.receivedQty)} (${gap > 0 ? "+" : ""}${n(gap)}) — ERP 차이내역 확인`,
              refs: [String(row.inboundNo)],
              action: { label: "입고 확정", to: "/inbound/inbound-confirm" }
            });
          });
      });

    liveStocks()
      .filter((stock) => stock.stockStatus === "PUTAWAY_WAIT" && daysBetween(stock.receivedDate, ctx.today) >= 1)
      .forEach((stock) =>
        push({
          id: `putaway-${stock.stockId}`,
          severity: "warning",
          category: "입고",
          title: "격납 지연",
          message: `${stock.lotNo} ${stock.itemName} ${n(stock.onHand)} ${stock.unit} · ${daysBetween(stock.receivedDate, ctx.today)}일째 격납 대기 (${stock.warehouseName})`,
          refs: [String(stock.lotNo)],
          action: { label: "격납 대기", to: "/stock/putaway" }
        })
      );

    /* 반품 */
    ctx
      .returns()
      .filter((row) => row.status === "received")
      .forEach((row) =>
        push({
          id: `rt-in-${row.id}`,
          severity: "info",
          category: "반품",
          title: "반품 수신",
          message: `${row.returnNo} ${row.customerName} ${row.itemName} ${n(row.qty)} ${row.unit} · 사유 ${row.reason}`,
          refs: [String(row.returnNo)],
          at: stamp(row.receivedAt),
          action: { label: "반품 확정", to: "/inbound/return-confirm" }
        })
      );
    ctx
      .returns()
      .filter((row) => row.status === "rejected")
      .forEach((row) =>
        push({
          id: `rt-rej-${row.id}`,
          severity: "warning",
          category: "반품",
          title: "반품 반려",
          message: `${row.returnNo} ${row.customerName} · ${row.rejectReason} — 영업 담당 ${row.manager} 확인 필요`,
          refs: [String(row.returnNo)],
          at: stamp(row.processedAt),
          action: { label: "반품 확정", to: "/inbound/return-confirm" }
        })
      );

    /* 출고 */
    const dispatchedNos = new Set(ctx.dispatched().map((row) => row.outboundNo));
    ctx
      .outbounds()
      .filter((row) => row.status === "거부")
      .forEach((row) =>
        push({
          id: `out-rej-${row.id}`,
          severity: "danger",
          category: "출고",
          title: "출고 거부",
          message: `${row.outboundNo} ${row.customerName} · ${row.rejectReason ?? "사유 미기재"} — 영업·OMS 확인 필요`,
          refs: [String(row.outboundNo)],
          action: { label: "출고 요청서", to: "/outbound/outbound-order" }
        })
      );

    ctx
      .outbounds()
      .filter((row) => row.status === "출고대기" || row.status === "피킹중")
      .forEach((row) =>
        (ctx.outboundLines[row.id] ?? [])
          .filter((line) => Number(line.orderQty) - Number(line.pickedQty) > Number(line.availableQty))
          .forEach((line) =>
            push({
              id: `out-short-${line.id}`,
              severity: "danger",
              category: "출고",
              title: "피킹 재고 부족",
              message: `${row.outboundNo} ${line.itemName} 필요 ${n(Number(line.orderQty) - Number(line.pickedQty))} / 가용 ${n(line.availableQty)} ${line.unit} (${line.locationCode})`,
              refs: [String(row.outboundNo), String(line.locationCode)],
              action: { label: "보충 작업", to: "/stock/replenishment" }
            })
          )
      );

    ctx
      .outbounds()
      .filter((row) => row.status === "피킹완료" && !row.invoiceNo)
      .forEach((row) =>
        push({
          id: `out-invoice-${row.id}`,
          severity: "warning",
          category: "출고",
          title: "송장 미입력",
          message: `${row.outboundNo} ${row.customerName} · 피킹은 끝났고 송장이 없습니다 (${row.carrier})`,
          refs: [String(row.outboundNo)],
          action: { label: "출고 확정", to: "/outbound/outbound-confirm" }
        })
      );

    ctx
      .outbounds()
      .filter((row) => (row.status === "피킹완료" || row.status === "출고완료") && String(row.scheduledDate) <= ctx.today && !dispatchedNos.has(row.outboundNo))
      .forEach((row) => {
        const region = regionOf(row.shipAddress);
        push({
          id: `out-dispatch-${row.id}`,
          severity: "warning",
          category: "출고",
          title: "배차 전",
          message: `${row.outboundNo} ${row.customerName} · ${region} · ${row.carrier} — 오늘 나가야 합니다`,
          refs: [String(row.outboundNo)],
          action: { label: region === "수도권" ? "수도권 배차" : "지방권 배차", to: region === "수도권" ? "/dispatch/dispatch-metro" : "/dispatch/dispatch-regional" }
        });
      });

    /* 연동 */
    ctx
      .interfaces()
      .filter((row) => row.state === "fail")
      .forEach((row) =>
        push({
          id: `if-${row.id}`,
          severity: "danger",
          category: "연동",
          title: "ERP 전송 실패",
          message: `${row.type} ${row.refNo} · ${row.message} (재시도 ${row.retry}회)`,
          refs: [String(row.refNo)],
          at: stamp(row.createdAt),
          action: { label: "전체 로그", to: "/history/system-logs" }
        })
      );

    const severityRank: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };
    const categoryRank: Record<Category, number> = { 출고: 0, 입고: 1, 재고: 2, 반품: 3, 연동: 4 };
    return list.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || categoryRank[a.category] - categoryRank[b.category]);
  };

  /* ---------------- 입고 현황 ---------------- */
  const inboundDashboard = () => {
    const handledToday = new Set([...todays("inbound-confirm"), ...todays("putaway")].map((event) => event.ref));
    const rows = ctx
      .inbounds()
      .map((row) => {
        const stageKey = inboundStage(row);
        const stage = INBOUND_STAGES.find((item) => item.key === stageKey) ?? INBOUND_STAGES[0];
        const lines = ctx.inboundLines[row.id] ?? [];
        const open = ["scheduled", "registered", "located"].includes(stageKey);
        return {
          id: row.id,
          inboundNo: row.inboundNo,
          kind: row.type,
          supplierName: row.supplierName,
          warehouseName: row.warehouseName,
          expectedAt: row.expectedAt,
          overdue: open && String(row.expectedAt) < ctx.today,
          qty: Number(row.qty) || sumOf(lines, (line) => line.expectedQty),
          receivedQty: sumOf(lines, (line) => line.receivedQty),
          stage: stage.key,
          stageLabel: stage.label,
          progress: stage.progress,
          tone: stage.tone,
          to: stage.to
        };
      })
      // 끝난 건은 오늘 처리했거나 오늘 예정이던 것만, 손대기 전 건은 예정일이 오늘까지인 것만
      .filter((row) =>
        row.stage === "done" ? row.expectedAt === ctx.today || handledToday.has(row.inboundNo) || handledToday.has(`LOT-${row.inboundNo}`)
        : row.stage !== "scheduled" || String(row.expectedAt) <= ctx.today
      )
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          INBOUND_STAGES.findIndex((item) => item.key === a.stage) - INBOUND_STAGES.findIndex((item) => item.key === b.stage) ||
          String(a.expectedAt).localeCompare(String(b.expectedAt))
      );

    const stages = INBOUND_STAGES.map((stage) => {
      const inStage = rows.filter((row) => row.stage === stage.key);
      return { key: stage.key, label: stage.label, hint: stage.hint, tone: stage.tone, count: inStage.length, qty: sumOf(inStage, (row) => row.qty) };
    });

    const open = rows.filter((row) => ["scheduled", "registered", "located"].includes(row.stage));
    const overdue = open.filter((row) => row.overdue);
    const confirmEvents = todays("inbound-confirm");
    const confirmedQty = sumOf(confirmEvents, (event) => event.qty);
    const waiting = liveStocks().filter((stock) => stock.stockStatus === "PUTAWAY_WAIT");
    const waitingQty = sumOf(waiting, (stock) => stock.onHand);
    const oldestWait = waiting.reduce((max, stock) => Math.max(max, daysBetween(stock.receivedDate, ctx.today)), 0);
    const returnsWaiting = ctx.returns().filter((row) => row.status === "received");
    const returnsRejected = ctx.returns().filter((row) => row.status === "rejected");

    const kpis = [
      {
        key: "open",
        label: "입고 대기",
        value: open.length,
        unit: "건",
        sub: `예정 수량 ${n(sumOf(open, (row) => row.qty))}`,
        tone: "info" as Tone,
        badge: overdue.length ? { text: `예정일 지남 ${overdue.length}`, tone: "danger" as Tone } : null,
        delta: delta(open.length, HISTORY.inboundOpen[5], "건", false),
        trend: trend(HISTORY.inboundOpen, open.length, "bars"),
        to: "/inbound/inbound-schedule",
        hint: "입고예정(예정일 오늘까지)·입고등록·로케이션 지정 단계에 있는 입고 건"
      },
      {
        key: "confirmed",
        label: "금일 입고확정",
        value: new Set(confirmEvents.map((event) => event.ref)).size,
        unit: "건",
        sub: `수량 ${n(confirmedQty)}`,
        tone: "success" as Tone,
        badge: null,
        delta: deltaSoFar(confirmedQty, HISTORY.inboundConfirmedQty[5], "개", true),
        trend: trend(HISTORY.inboundConfirmedQty, confirmedQty, "line"),
        to: "/inbound/inbound-confirm",
        hint: "오늘 검수를 마치고 입고확정한 건 (추세·증감은 수량 기준)"
      },
      {
        key: "putaway",
        label: "격납 대기",
        value: waiting.length,
        unit: "LOT",
        sub: `수량 ${n(waitingQty)}`,
        tone: "violet" as Tone,
        badge: oldestWait >= 1 ? { text: `최장 ${oldestWait}일째`, tone: "warning" as Tone } : null,
        delta: delta(waitingQty, HISTORY.putawayQty[5], "개", false),
        trend: trend(HISTORY.putawayQty, waitingQty, "line"),
        to: "/stock/putaway",
        hint: "입고확정 뒤 아직 랙에 넣지 않은 재고"
      },
      {
        key: "returns",
        label: "반품 처리대기",
        value: returnsWaiting.length,
        unit: "건",
        sub: `수량 ${n(sumOf(returnsWaiting, (row) => row.qty))}`,
        tone: "warning" as Tone,
        badge: returnsRejected.length ? { text: `반려 ${returnsRejected.length}`, tone: "violet" as Tone } : null,
        delta: delta(returnsWaiting.length, HISTORY.returnsWaiting[5], "건", false),
        trend: trend(HISTORY.returnsWaiting, returnsWaiting.length, "bars"),
        to: "/inbound/return-confirm",
        hint: "OMS 에서 수신해 승인·반려를 기다리는 반품"
      }
    ];

    const kinds = Array.from(new Set(rows.map((row) => String(row.kind))));
    const breakdown = kinds.map((kind, index) => {
      const list = rows.filter((row) => row.kind === kind);
      return { key: kind, label: `${kind} 입고`, count: list.length, qty: sumOf(list, (row) => row.qty), tone: INBOUND_KIND_TONE[kind] ?? BREAKDOWN_TONES[index % BREAKDOWN_TONES.length] };
    });

    return {
      generatedAt: nowHm(),
      today: ctx.today,
      kpis,
      stages,
      rows,
      hourly: hourly(
        [
          { kind: "inbound-confirm", label: "입고확정", tone: "info" },
          { kind: "putaway", label: "격납 완료", tone: "violet" }
        ],
        "개"
      ),
      breakdown,
      alerts: buildAlerts().filter((alert) => alert.category === "입고" || alert.category === "반품")
    };
  };

  /* ---------------- 출고 현황 ---------------- */
  const outboundDashboard = () => {
    const dispatchedNos = new Set(ctx.dispatched().map((row) => row.outboundNo));
    const shippedToday = new Set(todays("outbound-confirm").map((event) => event.ref));
    const rows = ctx
      .outbounds()
      // 끝난·거부 건은 오늘 것만, 피킹 전 건은 출고예정일이 오늘까지인 것만
      .filter((row) =>
        row.status === "출고완료" ? row.scheduledDate === ctx.today || shippedToday.has(row.outboundNo)
        : row.status === "거부" ? row.scheduledDate === ctx.today
        : row.status !== "출고대기" || String(row.scheduledDate) <= ctx.today
      )
      .map((row) => {
        const lines = ctx.outboundLines[row.id] ?? [];
        const orderQty = lines.length ? sumOf(lines, (line) => line.orderQty) : Number(row.qty) || 0;
        const done = row.status === "피킹완료" || row.status === "출고완료";
        const pickedQty = done ? orderQty : sumOf(lines, (line) => line.pickedQty);
        const region = regionOf(row.shipAddress);
        const dispatched = dispatchedNos.has(row.outboundNo);
        const stage = OUTBOUND_STAGES.find((item) => item.key === row.status);
        const to =
          row.status === "출고대기" || row.status === "피킹중" ? `/outbound/picking?outboundNo=${encodeURIComponent(row.outboundNo)}`
          : row.status === "피킹완료" ? "/outbound/outbound-confirm"
          : row.status === "출고완료" ? (dispatched ? "/outbound/delivery-note" : region === "수도권" ? "/dispatch/dispatch-metro" : "/dispatch/dispatch-regional")
          : "/outbound/outbound-order";
        return {
          id: row.id,
          outboundNo: row.outboundNo,
          customerName: row.customerName,
          outType: row.outType,
          region,
          scheduledDate: row.scheduledDate,
          overdue: !done && row.status !== "거부" && String(row.scheduledDate) < ctx.today,
          qty: orderQty,
          pickedQty,
          progress: row.status === "거부" ? 0 : percent(pickedQty, orderQty, 0),
          carrier: row.carrier,
          invoiceNo: row.invoiceNo,
          dispatched,
          stage: row.status,
          stageLabel: stage?.label ?? row.status,
          tone: (row.status === "거부" ? "danger" : stage?.tone ?? "gray") as Tone,
          rejectReason: row.rejectReason,
          to
        };
      })
      .sort((a, b) => {
        const rank = (stage: string) => (stage === "거부" ? 99 : OUTBOUND_STAGES.findIndex((item) => item.key === stage));
        return Number(b.overdue) - Number(a.overdue) || rank(a.stage) - rank(b.stage) || String(a.scheduledDate).localeCompare(String(b.scheduledDate));
      });

    const active = rows.filter((row) => row.stage !== "거부");
    const stages = OUTBOUND_STAGES.map((stage) => {
      const inStage = active.filter((row) => row.stage === stage.key);
      return { key: stage.key, label: stage.label, hint: stage.hint, tone: stage.tone, count: inStage.length, qty: sumOf(inStage, (row) => row.qty) };
    });
    const rejected = rows.filter((row) => row.stage === "거부");

    const todayOrders = rows.filter((row) => row.scheduledDate === ctx.today);
    const todayActive = todayOrders.filter((row) => row.stage !== "거부");
    const pickWaiting = todayOrders.filter((row) => row.stage === "출고대기");
    const ordered = sumOf(todayActive, (row) => row.qty);
    const picked = sumOf(todayActive, (row) => row.pickedQty);
    const pickingRate = percent(picked, ordered, 0);
    const shipEvents = todays("outbound-confirm");
    const shippedQty = sumOf(shipEvents, (event) => event.qty);
    const since = new Date(Date.parse(ctx.today) - 30 * 86400000).toISOString().slice(0, 10);
    const misshipQty = sumOf(
      ctx.returns().filter((row) => row.reason === "오배송" && String(row.receivedAt).slice(0, 10) >= since),
      (row) => row.qty
    );
    const misshipRate = percent(misshipQty, SHIPPED_30D + shippedQty, 2);

    const kpis = [
      {
        key: "orders",
        label: "금일 출고지시",
        value: todayOrders.length,
        unit: "건",
        sub: `수량 ${n(sumOf(todayOrders, (row) => row.qty))}`,
        tone: "info" as Tone,
        badge: pickWaiting.length ? { text: `피킹대기 ${pickWaiting.length}`, tone: "warning" as Tone } : null,
        delta: delta(todayOrders.length, HISTORY.outboundOrders[5], "건", null),
        trend: trend(HISTORY.outboundOrders, todayOrders.length, "bars"),
        to: "/outbound/outbound-order",
        hint: "출고예정일이 오늘인 출고 요청 (거부 포함)"
      },
      {
        key: "picking",
        label: "피킹 진행률",
        value: pickingRate,
        unit: "%",
        sub: `피킹중 ${todayOrders.filter((row) => row.stage === "피킹중").length}건 · ${n(picked)} / ${n(ordered)}`,
        tone: "violet" as Tone,
        badge: null,
        delta: deltaSoFar(pickingRate, HISTORY.pickingRate[5], "%p", true),
        trend: trend(HISTORY.pickingRate, pickingRate, "line"),
        to: "/outbound/picking",
        hint: "오늘 출고지시(거부 제외) 주문 수량 가운데 피킹한 수량"
      },
      {
        key: "shipped",
        label: "금일 출고완료",
        value: new Set(shipEvents.map((event) => event.ref)).size,
        unit: "건",
        sub: `수량 ${n(shippedQty)}`,
        tone: "success" as Tone,
        badge: null,
        delta: deltaSoFar(shippedQty, HISTORY.shippedQty[5], "개", true),
        trend: trend(HISTORY.shippedQty, shippedQty, "line"),
        to: "/outbound/outbound-confirm",
        hint: "오늘 출고확정한 건 (추세·증감은 수량 기준)"
      },
      {
        key: "misship",
        label: "오출률 (30일)",
        value: misshipRate,
        unit: "%",
        digits: 2,
        sub: `오배송 반품 ${n(misshipQty)} / 출고 ${n(SHIPPED_30D + shippedQty)}`,
        tone: "danger" as Tone,
        badge: null,
        delta: delta(misshipRate, HISTORY.misshipRate[5], "%p", false, 2),
        trend: trend(HISTORY.misshipRate, misshipRate, "line"),
        to: "/inbound/return-confirm",
        hint: "최근 30일 사유가 '오배송'인 반품 수량 ÷ 같은 기간 출고 수량"
      }
    ];

    const carriers = Array.from(new Set(todayActive.map((row) => String(row.carrier ?? "미지정"))));
    const breakdown = carriers
      .map((carrier, index) => {
        const list = todayActive.filter((row) => String(row.carrier ?? "미지정") === carrier);
        return { key: carrier, label: carrier, count: list.length, qty: sumOf(list, (row) => row.qty), tone: BREAKDOWN_TONES[index % BREAKDOWN_TONES.length] };
      })
      .sort((a, b) => b.count - a.count || b.qty - a.qty);

    return {
      generatedAt: nowHm(),
      today: ctx.today,
      kpis,
      stages,
      rejected: { count: rejected.length, qty: sumOf(rejected, (row) => row.qty) },
      rows,
      hourly: hourly(
        [
          { kind: "picking", label: "피킹", tone: "info" },
          { kind: "outbound-confirm", label: "출고확정", tone: "success" }
        ],
        "개"
      ),
      breakdown,
      alerts: buildAlerts().filter((alert) => alert.category === "출고" || alert.category === "연동")
    };
  };

  /* ---------------- 재고 현황 ---------------- */
  const stockDashboard = () => {
    const stocks = liveStocks();
    const total = sumOf(stocks, (stock) => stock.onHand);
    const availableRows = stocks.filter((stock) => stock.stockStatus === "AVAILABLE");
    const available = sumOf(availableRows, (stock) => stock.available);
    const allocated = sumOf(availableRows, (stock) => stock.allocated);
    const putaway = sumOf(stocks.filter((stock) => stock.stockStatus === "PUTAWAY_WAIT"), (stock) => stock.onHand);
    const defect = sumOf(stocks.filter((stock) => stock.stockStatus === "DEFECT"), (stock) => stock.onHand);

    // 재고 정확도 — 가장 최근 실사일에 센 로케이션 가운데 전산과 실물이 같은 비율
    const countDates = ctx.stocktakings().map((row) => String(row.countDate)).sort();
    const lastCount = countDates[countDates.length - 1] ?? ctx.today;
    const countRows = ctx.stocktakings().filter((row) => row.countDate === lastCount);
    const matched = countRows.filter((row) => Number(row.diff) === 0).length;
    const ira = percent(matched, countRows.length, 1);

    const erpRows = ctx.erpRows();
    const erpDiffs = erpRows.filter((row) => Number(row.diff) !== 0).length;
    const erpMatch = percent(erpRows.length - erpDiffs, erpRows.length, 1);

    // 정상이 아닌 품목만, 남은 일수가 짧은 순으로 5개 (전체는 쇼트 관리 화면)
    const riskRows = ctx.shortage().filter((row) => row.risk !== "정상");
    const risks = riskRows
      .slice()
      .sort((a, b) => Number(a.risk !== "위험") - Number(b.risk !== "위험") || Number(a.daysOfStock) - Number(b.daysOfStock))
      .slice(0, 5);
    const riskCount = riskRows.filter((row) => row.risk === "위험").length;
    const yesterdayTotal = Math.round(total * HISTORY.stockFactor[5]);

    const kpis = [
      {
        key: "total",
        label: "총 재고",
        value: total,
        unit: "EA",
        sub: `가용 ${n(available)} (${percent(available, total, 1)}%)`,
        tone: "info" as Tone,
        badge: null,
        delta: delta(total, yesterdayTotal, "", null),
        trend: trend(HISTORY.stockFactor.map((factor) => Math.round(total * factor)), total, "line"),
        to: "/stock/stock-realtime",
        hint: "전 창고 현재고 합계 (격납대기·불량 포함)"
      },
      {
        key: "ira",
        label: "재고 정확도 (IRA)",
        value: ira,
        unit: "%",
        digits: 1,
        sub: `실사 ${mmdd(lastCount)} · ${matched}/${countRows.length} 로케이션 일치`,
        tone: "success" as Tone,
        badge: countRows.length - matched ? { text: `차이 ${countRows.length - matched}건`, tone: "warning" as Tone } : null,
        delta: delta(ira, HISTORY.ira[5], "%p", true, 1),
        trend: trend(HISTORY.ira, ira, "line"),
        to: "/stock/stocktaking",
        hint: "가장 최근 실사에서 센 로케이션 가운데 전산 수량과 실물 수량이 같은 비율"
      },
      {
        key: "erp",
        label: "ERP 재고 일치율",
        value: erpMatch,
        unit: "%",
        digits: 1,
        sub: `불일치 ${erpDiffs}건 · ${mmdd(ctx.today)} 비교`,
        tone: "teal" as Tone,
        badge: null,
        delta: delta(erpMatch, HISTORY.erpMatch[5], "%p", true, 1),
        trend: trend(HISTORY.erpMatch, erpMatch, "line"),
        to: "/stock/erp-compare",
        hint: "오늘 비교한 품목·로케이션 가운데 WMS 와 ERP 수량이 같은 비율"
      },
      {
        key: "risk",
        label: "쇼트 위험 품목",
        value: riskCount,
        unit: "품목",
        sub: `보충 필요 로케이션 ${ctx.replenishment().length}곳`,
        tone: "danger" as Tone,
        badge: null,
        delta: delta(riskCount, HISTORY.shortageRisk[5], "품목", false),
        trend: trend(HISTORY.shortageRisk, riskCount, "bars"),
        to: "/analytics/shortage",
        hint: "가용재고가 안전재고보다 적어 곧 모자랄 품목"
      }
    ];

    const composition = [
      { key: "available", label: "가용", qty: available, tone: "success" as Tone },
      { key: "allocated", label: "출고 할당", qty: allocated, tone: "info" as Tone },
      { key: "putaway", label: "격납 대기", qty: putaway, tone: "violet" as Tone },
      { key: "defect", label: "불량", qty: defect, tone: "danger" as Tone }
    ];

    const warehouseNames = Array.from(new Set(stocks.map((stock) => String(stock.warehouseName))));
    const warehouses = warehouseNames
      .map((name) => {
        const list = stocks.filter((stock) => stock.warehouseName === name);
        const avail = list.filter((stock) => stock.stockStatus === "AVAILABLE");
        return {
          name,
          type: String(list[0]?.warehouseType ?? "일반"),
          total: sumOf(list, (stock) => stock.onHand),
          available: sumOf(avail, (stock) => stock.available),
          allocated: sumOf(avail, (stock) => stock.allocated),
          putaway: sumOf(list.filter((stock) => stock.stockStatus === "PUTAWAY_WAIT"), (stock) => stock.onHand),
          defect: sumOf(list.filter((stock) => stock.stockStatus === "DEFECT"), (stock) => stock.onHand),
          skus: new Set(list.map((stock) => stock.itemCode)).size
        };
      })
      .sort((a, b) => b.total - a.total);

    const BUCKETS = [
      { key: "d30", label: "30일 이내", max: 30, tone: "success" as Tone },
      { key: "d90", label: "31~90일", max: 90, tone: "info" as Tone },
      { key: "d180", label: "91~180일", max: 180, tone: "teal" as Tone },
      { key: "d365", label: "181일~1년", max: 365, tone: "warning" as Tone },
      { key: "over", label: "1년 넘음", max: Number.POSITIVE_INFINITY, tone: "danger" as Tone }
    ];
    const aging = BUCKETS.map((bucket, index) => {
      const min = index === 0 ? -1 : BUCKETS[index - 1].max;
      const list = stocks.filter((stock) => {
        const days = daysBetween(stock.receivedDate, ctx.today);
        return days > min && days <= bucket.max;
      });
      return { key: bucket.key, label: bucket.label, qty: sumOf(list, (stock) => stock.onHand), lots: list.length, tone: bucket.tone };
    });

    return {
      generatedAt: nowHm(),
      today: ctx.today,
      kpis,
      composition,
      warehouses,
      aging,
      risks: risks.map((row) => ({
        itemCode: row.itemCode,
        itemName: row.itemName,
        unit: row.unit,
        available: row.available,
        safetyStock: row.safetyStock,
        daysOfStock: row.daysOfStock,
        shortageEta: row.shortageEta,
        risk: row.risk
      })),
      alerts: buildAlerts().filter((alert) => alert.category === "재고")
    };
  };

  /* ---------------- 요약 (물류 현황 KPI · 진행 현황) — 같은 배열에서 계산 ---------------- */
  const summary = () => {
    const inbounds = ctx.inbounds();
    const outbounds = ctx.outbounds();
    const stocks = liveStocks();
    const byStatus = (status: string) => outbounds.filter((row) => row.status === status).length;
    return {
      logistics: {
        todayInbound: inbounds.filter((row) => row.expectedAt === ctx.today).length,
        todayOutbound: outbounds.filter((row) => row.scheduledDate === ctx.today).length,
        totalStock: sumOf(stocks, (stock) => stock.onHand),
        working: inbounds.filter((row) => ["scheduled", "registered", "located"].includes(row.status)).length + byStatus("피킹중") + stocks.filter((stock) => stock.stockStatus === "PUTAWAY_WAIT").length
      },
      inbound: {
        scheduled: inbounds.filter((row) => row.status === "scheduled").length,
        confirmed: inbounds.filter((row) => row.status === "confirmed").length,
        putawayWait: stocks.filter((stock) => stock.stockStatus === "PUTAWAY_WAIT").length,
        returnReceived: ctx.returns().filter((row) => row.status === "received").length
      },
      outbound: {
        waiting: byStatus("출고대기"),
        picking: byStatus("피킹중"),
        picked: byStatus("피킹완료"),
        completed: byStatus("출고완료"),
        rejected: byStatus("거부")
      },
      stock: {
        total: sumOf(stocks, (stock) => stock.onHand),
        available: sumOf(stocks.filter((stock) => stock.stockStatus === "AVAILABLE"), (stock) => stock.available),
        defect: sumOf(stocks.filter((stock) => stock.stockStatus === "DEFECT"), (stock) => stock.onHand),
        longTerm: sumOf(stocks.filter((stock) => daysBetween(stock.receivedDate, ctx.today) >= 365), (stock) => stock.onHand)
      },
      alerts: {
        replenish: ctx.replenishment().length,
        shortage: ctx.shortage().filter((row) => row.risk === "위험").length,
        interfaceError: ctx.interfaces().filter((row) => row.state === "fail").length,
        returnRejected: ctx.returns().filter((row) => row.status === "rejected").length
      }
    };
  };

  const progress = () => {
    const inbounds = ctx.inbounds();
    const outbounds = ctx.outbounds();
    const inCount = (status: string) => inbounds.filter((row) => row.status === status).length;
    const outCount = (status: string) => outbounds.filter((row) => row.status === status).length;
    return {
      inbound: {
        입고예정: inCount("scheduled"),
        입고등록: inCount("registered"),
        로케이션지정: inCount("located"),
        입고확정: inCount("confirmed"),
        total: inbounds.length,
        progressPct: percent(inCount("confirmed"), inbounds.length, 0)
      },
      outbound: {
        출고대기: outCount("출고대기"),
        피킹중: outCount("피킹중"),
        피킹완료: outCount("피킹완료"),
        출고완료: outCount("출고완료"),
        거부: outCount("거부"),
        total: outbounds.length,
        progressPct: percent(outCount("출고완료"), outbounds.length, 0)
      }
    };
  };

  /** 화면에서 처리한 작업을 이벤트로 남긴다 — 시간별 처리량·금일 KPI 에 바로 반영 */
  const record = (kind: WorkEventKind, qty: number, ref: string) => {
    if (!(qty > 0)) return;
    events.push({ day: ctx.today, at: nowHm(), kind, qty, ref });
  };

  /** GET — 처리하지 않는 경로면 undefined */
  const get = (clean: string): unknown => {
    if (clean === "/dashboard/summary") return summary();
    if (clean === "/dashboard/progress") return progress();
    if (clean === "/dashboard/inbound") return inboundDashboard();
    if (clean === "/dashboard/outbound") return outboundDashboard();
    if (clean === "/dashboard/stock") return stockDashboard();
    if (clean === "/dashboard/alerts") return { generatedAt: nowHm(), today: ctx.today, alerts: buildAlerts() };
    return undefined;
  };

  seed();

  return { get, record };
}
