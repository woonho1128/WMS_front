/* ============================================================
   목(mock) — 창고 레이아웃 · 로케이션 마스터 · 재고 이동/조정
   DOCS/WMS_3D창고맵_설계.md 의 원장 분리를 그대로 따른다.
   - 로케이션 존재      → locations            (로케이션 관리)
   - 형상               → zones(좌표) · racks · objects (레이아웃)
   - 연결               → location.rackId / bay / level (null = 미배치)
   3D 적치율은 목에 적어두지 않고 재고에서 계산한다.
   ============================================================ */

import { hasErrors, validateDraft, type DraftLocationInfo, type LayoutDraft } from "../components/warehouse3d/layoutRules";

type AnyRecord = Record<string, any>;

export type WarehouseMockCtx = {
  today: string;
  warehouses: AnyRecord[];
  zones: AnyRecord[];
  items: AnyRecord[];
  locations: () => AnyRecord[];
  stocks: () => AnyRecord[];
  nextStockId: () => number;
  outbounds: () => AnyRecord[];
  outboundLines: Record<number, AnyRecord[]>;
  /** 보충 대상 (파레트 구성 기준) — mockApi 의 계산을 그대로 쓴다 */
  replenishment: () => AnyRecord[];
};

/* ---------- 랙 치수 기본값 (geometry.ts 와 동일) ---------- */
const BAY_W = 2.4;
const BAY_GAP = 0.45;
const ROW_D = 1.6;
const AISLE = 3.4;
const LEVEL_H = 1.5;
const PAD = 1.6;

const LOCATION_TYPES = ["PICKING", "RESERVE", "CROSS_DOCK", "DEFECT", "DAMAGED"];
const PURPOSE_NAME: Record<string, string> = {
  PICKING: "피킹 구역",
  RESERVE: "보관 구역",
  CROSS_DOCK: "직출 구역",
  RETURN: "반품·불량",
  INBOUND: "입고장",
  OUTBOUND: "출고장",
  OFFICE: "사무실",
  ETC: "기타 공간"
};

/** 랙 없는 장소 — 입고장 · 출고장 · 사무실. shape 는 구역 로컬 꼭짓점(외곽 사각형 중심 원점), null = 사각형 */
const ICHEON_PLACES: Array<{ code: string; name: string; floor: string; purpose: string; x: number; z: number; width: number; depth: number; shape: Array<[number, number]> | null; manager: string }> = [
  // 입고 도크 앞 하차 · 검수 대기 — 1번 도크 쪽이 더 깊다
  { code: "Y-IN", name: "입고장", floor: "1F", purpose: "INBOUND", x: -16.5, z: 14, width: 21, depth: 4, shape: [[-10.5, -2], [-0.5, -2], [-0.5, -0.5], [10.5, -0.5], [10.5, 2], [-10.5, 2]], manager: "김현우 대리" },
  { code: "Y-OUT", name: "출고장", floor: "1F", purpose: "OUTBOUND", x: 16.5, z: 14, width: 21, depth: 4, shape: null, manager: "한지민 대리" },
  // 왼쪽 위 모서리 ㄱ자 사무실
  { code: "Y-OF", name: "사무실", floor: "1F", purpose: "OFFICE", x: -26, z: -18.75, width: 12, depth: 6.5, shape: [[-6, -3.25], [6, -3.25], [6, 0.25], [0, 0.25], [0, 3.25], [-6, 3.25]], manager: "박정호 과장" }
];

export const ADJUST_REASONS: Record<string, string> = {
  COUNT_DIFF: "실사 차이",
  DAMAGE: "파손",
  LOSS: "분실",
  MISRECEIVE: "오입고",
  ETC: "기타"
};

const fail = (message: string): never => {
  throw new Error(message);
};

/** 재현 가능한 난수 — 새로고침해도 같은 목 데이터가 나온다 */
const seeded = (seed: number) => () => {
  seed += 0x6d2b79f5;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

const shiftDate = (base: string, days: number) => {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const byCode = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });

/* ============================================================
   이천물류센터(구 용인물류센터) 시드 — 기존 3D 모습(구역 위치·랙 수·적치율)을 그대로 재현
   ============================================================ */

const EXTRA_ITEMS = [
  { itemCode: "SKU-10301", itemName: "무선 충전 패드 15W", spec: "15W", unit: "EA", safetyStock: 90, unitsPerPallet: 80, unitWeightKg: 0.3, category: "전자기기" },
  { itemCode: "SKU-10455", itemName: "스마트 워치 스트랩", spec: "20mm", unit: "EA", safetyStock: 150, unitsPerPallet: 200, unitWeightKg: 0.05, category: "액세서리" },
  { itemCode: "SKU-11020", itemName: "LED 데스크 램프", spec: "USB-C", unit: "EA", safetyStock: 40, unitsPerPallet: 24, unitWeightKg: 1.4, category: "조명" },
  { itemCode: "SKU-11388", itemName: "휴대용 선풍기", spec: "4000mAh", unit: "EA", safetyStock: 60, unitsPerPallet: 36, unitWeightKg: 0.4, category: "계절가전" },
  { itemCode: "SKU-12210", itemName: "멀티탭 6구 3m", spec: "16A", unit: "EA", safetyStock: 70, unitsPerPallet: 40, unitWeightKg: 0.8, category: "전기용품" },
  { itemCode: "SKU-13002", itemName: "차량용 스마트폰 거치대", spec: "송풍구형", unit: "EA", safetyStock: 100, unitsPerPallet: 90, unitWeightKg: 0.15, category: "액세서리" },
  { itemCode: "SKU-20501", itemName: "스테인리스 텀블러 500ml", spec: "500ml", unit: "EA", safetyStock: 80, unitsPerPallet: 48, unitWeightKg: 0.45, category: "주방용품" },
  { itemCode: "SKU-20877", itemName: "실리콘 조리도구 5종", spec: "5P", unit: "SET", safetyStock: 50, unitsPerPallet: 30, unitWeightKg: 0.9, category: "주방용품" },
  { itemCode: "SKU-21040", itemName: "밀폐용기 세트", spec: "8P", unit: "SET", safetyStock: 30, unitsPerPallet: 16, unitWeightKg: 3.2, category: "주방용품" },
  { itemCode: "SKU-30120", itemName: "육각 너트 M8", spec: "M8", unit: "EA", safetyStock: 800, unitsPerPallet: 400, unitWeightKg: 0.006, category: "부자재" },
  { itemCode: "SKU-30245", itemName: "앵커 볼트 M10", spec: "M10", unit: "EA", safetyStock: 300, unitsPerPallet: 150, unitWeightKg: 0.08, category: "부자재" },
  { itemCode: "SKU-31010", itemName: "케이블 타이 300mm", spec: "300mm", unit: "EA", safetyStock: 1000, unitsPerPallet: 500, unitWeightKg: 0.004, category: "부자재" },
  { itemCode: "SKU-40015", itemName: "포장 박스 (중)", spec: "400×300×250", unit: "EA", safetyStock: 500, unitsPerPallet: 250, unitWeightKg: 0.35, category: "포장재" },
  { itemCode: "SKU-40220", itemName: "에어캡 롤", spec: "1m×50m", unit: "ROLL", safetyStock: 20, unitsPerPallet: 10, unitWeightKg: 4.5, category: "포장재" },
  // 테이프 박스는 무겁다 — 1파레트 864kg. 경량 랙(500kg)·보관 랙 맨 윗단에는 못 올린다
  { itemCode: "SKU-40310", itemName: "OPP 테이프", spec: "48mm", unit: "BOX", safetyStock: 100, unitsPerPallet: 144, unitWeightKg: 6, category: "포장재" }
];

/** 칸당 허용 하중(kg) — 피킹·반품은 경량 랙, 보관·직출은 파레트 랙 */
const RACK_LOAD_KG: Record<string, number> = { PICKING: 500, RESERVE: 1000, CROSS_DOCK: 1000, RETURN: 500 };
/** 5단 보관 랙의 맨 윗단은 로케이션에서 따로 낮춘다 — 무거운 파레트는 아래 단으로 */
const TOP_LEVEL_LIMIT_KG = 500;

const POOLS: Record<string, string[]> = {
  PICKING: ["SKU-10241", "SKU-10822", "SKU-12044", "SKU-10301", "SKU-10455", "SKU-11020", "SKU-11388", "SKU-12210", "SKU-13002", "SKU-20501", "SKU-20877"],
  RESERVE: ["SKU-30001", "SKU-30120", "SKU-30245", "SKU-31010", "SKU-40015", "SKU-40310", "SKU-21040", "SKU-20501", "SKU-10241", "SKU-10822", "SKU-12044", "SKU-11388"],
  CROSS_DOCK: ["SKU-10301", "SKU-11388", "SKU-20877", "SKU-21040", "SKU-40015"],
  RETURN: ["SKU-10241", "SKU-10822", "SKU-11020", "SKU-12210", "SKU-20501"],
  LONG: ["SKU-40220", "SKU-30245", "SKU-21040", "SKU-11020"]
};

type ZoneSeed = {
  letter: string;
  floor: string;
  purpose: string;
  purposeName?: string;
  x: number;
  z: number;
  bays: number;
  rows: number;
  levels: number;
  fill: number;
  manager: string;
  recentIn: string;
  recentOut: string;
  longTerm?: boolean;
};

const ICHEON_ZONES: ZoneSeed[] = [
  { letter: "A", floor: "1F", purpose: "PICKING", x: -17, z: -9, bays: 4, rows: 2, levels: 4, fill: 0.85, manager: "김현우 대리", recentIn: "09:20", recentOut: "14:10" },
  { letter: "B", floor: "1F", purpose: "PICKING", x: 0, z: -9, bays: 4, rows: 2, levels: 4, fill: 0.62, manager: "이상민 주임", recentIn: "08:45", recentOut: "13:30" },
  { letter: "C", floor: "1F", purpose: "RESERVE", x: 17, z: -9, bays: 4, rows: 2, levels: 5, fill: 0.73, manager: "박정호 과장", recentIn: "10:15", recentOut: "14:25" },
  { letter: "D", floor: "1F", purpose: "RESERVE", x: -17, z: 6, bays: 4, rows: 2, levels: 5, fill: 0.48, manager: "최미선 주임", recentIn: "09:55", recentOut: "12:50" },
  { letter: "E", floor: "1F", purpose: "CROSS_DOCK", x: 0, z: 6, bays: 4, rows: 2, levels: 3, fill: 0.35, manager: "정우성 사원", recentIn: "11:05", recentOut: "15:02" },
  { letter: "F", floor: "1F", purpose: "PICKING", x: 17, z: 6, bays: 4, rows: 2, levels: 4, fill: 0.9, manager: "한지민 대리", recentIn: "10:40", recentOut: "14:48" },
  { letter: "G", floor: "2F", purpose: "RESERVE", x: -11, z: -9, bays: 5, rows: 2, levels: 5, fill: 0.805, manager: "오세훈 과장", recentIn: "08:10", recentOut: "13:05" },
  { letter: "H", floor: "2F", purpose: "RESERVE", x: 11, z: -9, bays: 5, rows: 2, levels: 5, fill: 0.44, manager: "오세훈 과장", recentIn: "09:02", recentOut: "12:20" },
  { letter: "J", floor: "2F", purpose: "PICKING", x: -11, z: 6, bays: 5, rows: 2, levels: 3, fill: 0.792, manager: "서지훈 주임", recentIn: "10:22", recentOut: "15:20" },
  { letter: "K", floor: "2F", purpose: "RESERVE", x: 11, z: 6, bays: 5, rows: 2, levels: 4, fill: 0.242, manager: "서지훈 주임", recentIn: "07:55", recentOut: "11:40" },
  { letter: "R", floor: "3F", purpose: "RETURN", x: -9, z: -2, bays: 4, rows: 2, levels: 3, fill: 0.825, manager: "문가영 주임", recentIn: "13:15", recentOut: "16:02" },
  { letter: "S", floor: "3F", purpose: "RESERVE", purposeName: "장기 보관", x: 9, z: -2, bays: 4, rows: 2, levels: 4, fill: 0.256, manager: "문가영 주임", recentIn: "—", recentOut: "—", longTerm: true }
];

export function createWarehouseMock(ctx: WarehouseMockCtx) {
  const ICHEON_ID = 4;

  const floors: AnyRecord[] = [
    { warehouseId: ICHEON_ID, code: "1F", width: 66, depth: 46, bgImageUrl: null, bgScale: null },
    { warehouseId: ICHEON_ID, code: "2F", width: 66, depth: 46, bgImageUrl: null, bgScale: null },
    { warehouseId: ICHEON_ID, code: "3F", width: 66, depth: 46, bgImageUrl: null, bgScale: null }
  ];

  const racks: AnyRecord[] = [];

  const objects: AnyRecord[] = [
    { id: 1, warehouseId: ICHEON_ID, floor: "1F", kind: "DOCK_IN", x: -22, z: 18, width: 7, depth: 3, rotation: 0, label: "입고 1" },
    { id: 2, warehouseId: ICHEON_ID, floor: "1F", kind: "DOCK_IN", x: -12, z: 18, width: 7, depth: 3, rotation: 0, label: "입고 2" },
    { id: 3, warehouseId: ICHEON_ID, floor: "1F", kind: "DOCK_OUT", x: 12, z: 18, width: 7, depth: 3, rotation: 0, label: "출고 1" },
    { id: 4, warehouseId: ICHEON_ID, floor: "1F", kind: "DOCK_OUT", x: 22, z: 18, width: 7, depth: 3, rotation: 0, label: "출고 2" }
  ];

  const vehicles: AnyRecord[] = [
    { id: "FL-01", warehouseId: ICHEON_ID, kind: "FORKLIFT", floor: "1F", path: [[-8.5, -18], [-8.5, 14], [8.5, 14], [8.5, -18]], speed: 3.4 },
    { id: "AGV-07", warehouseId: ICHEON_ID, kind: "AGV", floor: "1F", path: [[25, 14], [25, -17], [-25, -17], [-25, 14]], speed: 4.6 },
    { id: "FL-02", warehouseId: ICHEON_ID, kind: "FORKLIFT", floor: "2F", path: [[0, -17], [0, 14], [20, 14], [20, -17]], speed: 3.0 }
  ];

  const transferLog: AnyRecord[] = [
    { id: 1, transferNo: "TR260616131934-6", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", fromWarehouse: "창원공장", toWarehouse: "창원공장", fromLocation: "PC-A-01", toLocation: "PC-A-02", qty: 50, type: "일반→일반", lotNo: "LOT260407-0006", erpLinked: true, status: "done", reason: "창고 내 재배치", createdBy: "admin", createdAt: "2026-06-16 13:19" }
  ];

  let transferSeq = transferLog.length;

  const itemOf = (code: string) => ctx.items.find((item) => item.itemCode === code);
  const uppOf = (code: string) => Number(itemOf(code)?.unitsPerPallet) || 1;
  const weightOf = (code: string) => Number(itemOf(code)?.unitWeightKg) || 0;
  const warehouseOf = (id: number) => ctx.warehouses.find((wh) => wh.id === id);
  const warehouseByName = (name: string) => ctx.warehouses.find((wh) => wh.name === name);
  const zoneOf = (id: number) => ctx.zones.find((zone) => zone.id === id);
  const rackOf = (id: number | null | undefined) => (id == null ? undefined : racks.find((rack) => rack.id === id));
  const locationOf = (id: number) => ctx.locations().find((loc) => loc.id === id);

  const nowStamp = () => {
    const now = new Date();
    return `${ctx.today} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  /* ---------------- 시드 ---------------- */
  const seed = () => {
    const rng = seeded(20260617);
    const pick = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];
    const between = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

    // 기존 구역에 창고 ID 를 채워 둔다 (레이아웃 조회 시 창고별로 거른다)
    ctx.zones.forEach((zone) => {
      zone.warehouseId ??= warehouseByName(zone.warehouseName)?.id ?? null;
      zone.floor ??= null;
    });

    EXTRA_ITEMS.forEach((item, idx) => {
      if (itemOf(item.itemCode)) return;
      ctx.items.push({ id: 100 + idx, consign: false, active: true, ...item });
    });

    const warehouse = warehouseOf(ICHEON_ID)!;
    // 기존 구역 ID(11~51)와 겹치지 않게 400번대를 쓴다
    let zoneId = 401;
    let rackId = 4101;
    let locationId = 4001;
    let lotSeq = 1;
    const looseTargets = new Set(["A:3", "F:5"]);

    ICHEON_ZONES.forEach((spec) => {
      const width = round2(spec.bays * BAY_W + (spec.bays - 1) * BAY_GAP + PAD * 2);
      const depth = round2(spec.rows * ROW_D + (spec.rows - 1) * AISLE + PAD * 2);
      const zone = {
        id: zoneId++,
        code: `Y-${spec.letter}`,
        name: `${spec.letter} 구역`,
        warehouseId: ICHEON_ID,
        warehouseName: warehouse.name,
        floor: spec.floor,
        purpose: spec.purpose,
        purposeName: spec.purposeName ?? PURPOSE_NAME[spec.purpose],
        storage: "RACK",
        x: spec.x,
        z: spec.z,
        width,
        depth,
        rotation: 0,
        manager: spec.manager,
        temp: "상온",
        recentIn: spec.recentIn,
        recentOut: spec.recentOut
      };
      ctx.zones.push(zone);

      const zoneRacks = Array.from({ length: spec.rows }, (_, row) => {
        const rack = {
          id: rackId++,
          warehouseId: ICHEON_ID,
          zoneId: zone.id,
          code: `${spec.letter}-R${pad(row + 1)}`,
          x: spec.x,
          z: round2(spec.z - depth / 2 + PAD + ROW_D / 2 + row * (ROW_D + AISLE)),
          rotation: 0,
          bays: spec.bays,
          levels: spec.levels,
          bayWidth: BAY_W,
          depth: ROW_D,
          levelHeight: LEVEL_H,
          palletsPerSlot: 1,
          palletSpec: "1100×1100",
          maxLoadKg: RACK_LOAD_KG[spec.purpose] ?? 1000
        };
        racks.push(rack);
        return rack;
      });

      // 코드는 위치를 담지 않는 일련번호 (랙을 옮겨도 코드가 틀어지지 않게)
      let codeSeq = 1;
      const zoneLocations: AnyRecord[] = [];
      zoneRacks.forEach((rack, rowIdx) => {
        for (let bay = 1; bay <= rack.bays; bay += 1) {
          for (let level = 1; level <= rack.levels; level += 1) {
            const locationType =
              spec.purpose === "RETURN" ? (rowIdx === 0 ? "DEFECT" : "DAMAGED")
              : spec.purpose === "CROSS_DOCK" ? "CROSS_DOCK"
              : spec.purpose === "PICKING" ? "PICKING"
              : "RESERVE";
            const loc = {
              id: locationId++,
              code: `${spec.letter}-${pad(codeSeq++)}`,
              locationType,
              status: "가용",
              maxQty: null as number | null,
              maxWeightKg: spec.purpose === "RESERVE" && spec.levels >= 5 && level === spec.levels ? TOP_LEVEL_LIMIT_KG : null,
              active: true,
              zoneId: zone.id,
              zoneName: zone.name,
              warehouseName: warehouse.name,
              stockCount: 0,
              rackId: rack.id,
              bay,
              level,
              outFreq90: 0
            };
            zoneLocations.push(loc);
            ctx.locations().push(loc);
          }
        }
      });

      // 아래 단부터 채운다 — 실제 적재 순서와 같고, 기존 3D 모습과도 같다
      const fillOrder = [...zoneLocations].sort(
        (a, b) => a.level - b.level || a.rackId - b.rackId || a.bay - b.bay
      );
      const filledCount = Math.ceil(fillOrder.length * spec.fill);
      const pool = spec.longTerm ? POOLS.LONG : POOLS[spec.purpose];

      fillOrder.forEach((loc, idx) => {
        const filled = idx < filledCount;
        loc.outFreq90 =
          spec.longTerm ? (rng() < 0.2 ? 1 : 0)
          : spec.purpose === "PICKING" ? between(filled ? 25 : 5, filled ? 140 : 40)
          : spec.purpose === "CROSS_DOCK" ? between(40, 160)
          : spec.purpose === "RETURN" ? 0
          : between(0, filled ? 12 : 4);
        if (!filled) {
          loc.maxQty = 100;
          return;
        }

        const loose = looseTargets.has(`${spec.letter}:${idx}`);
        const picked = pick(pool);
        // 시드도 허용 하중을 지킨다 — 넘치는 품목이 뽑히면 들어가는 품목으로 바꾼다 (난수는 더 쓰지 않아 나머지 시드는 그대로)
        const limitKg = loc.maxWeightKg ?? rackOf(loc.rackId)?.maxLoadKg ?? null;
        const palletKg = (code: string) => uppOf(code) * weightOf(code);
        const fitted = limitKg != null && palletKg(picked) > limitKg ? pool.find((code) => palletKg(code) <= limitKg) ?? picked : picked;
        // 낱개 피킹 재고는 보관 구역에도 있는 품목으로 — 보충 제안에 출발지가 생기게
        const itemCode = loose ? (spec.letter === "A" ? "SKU-10822" : "SKU-12044") : fitted;
        const item = itemOf(itemCode)!;
        const upp = Number(item.unitsPerPallet);
        const onHand =
          spec.purpose === "RETURN" ? Math.max(1, Math.round(upp * (0.2 + rng() * 0.6)))
          : spec.purpose === "CROSS_DOCK" ? Math.max(1, Math.round(upp * (0.55 + rng() * 0.45)))
          : loose ? Math.max(1, Math.round(upp * 0.75))
          : upp; // 피킹·보관은 파레트 단위로 딱 맞게 — 보충 대상 목록이 폭증하지 않도록
        const daysAgo =
          spec.longTerm ? between(380, 720)
          : spec.purpose === "PICKING" ? between(3, 60)
          : spec.purpose === "CROSS_DOCK" ? between(0, 3)
          : spec.purpose === "RETURN" ? between(1, 30)
          : between(10, 150);
        const receivedDate = shiftDate(ctx.today, -daysAgo);
        const defect = spec.purpose === "RETURN";
        const allocated = !defect && spec.purpose === "PICKING" && rng() < 0.35 ? Math.round(onHand * (0.1 + rng() * 0.2)) : 0;

        loc.maxQty = upp;
        loc.stockCount = 1;
        ctx.stocks().push({
          stockId: ctx.nextStockId(),
          itemCode,
          itemName: item.itemName,
          warehouseId: ICHEON_ID,
          warehouseName: warehouse.name,
          warehouseType: warehouse.type,
          zoneName: zone.name,
          locationCode: loc.code,
          locationType: loc.locationType,
          lotNo: `LOT${receivedDate.slice(2).replace(/-/g, "")}-${pad(lotSeq++, 4)}`,
          stockStatus: defect ? "DEFECT" : "AVAILABLE",
          receivedDate,
          onHand,
          allocated,
          available: defect ? 0 : onHand - allocated,
          safetyStock: item.safetyStock,
          unit: item.unit
        });
      });
    });

    // 혼적 예시 — 파레트 자리 하나에 품목 여러 종 (2026-09-22 현업 회의 9번 "이미 있어도 넣을 수 있게").
    // 1단(바닥 단)은 어느 구역이든 채워져 있어 코드가 흔들리지 않는다. 원래 품목을 파레트 절반으로 줄이고
    // 다른 품목을 조금씩 얹어 칸 하나(1파레트 자리)를 넘지 않게 한다. 시드 난수는 쓰지 않는다(나머지 시드는 그대로).
    const MIXED_SEED: Array<{ code: string; extra: Array<[string, number]> }> = [
      { code: "B-05", extra: [["SKU-13002", 0.3]] },
      { code: "C-06", extra: [["SKU-30245", 0.35]] },
      { code: "D-11", extra: [["SKU-31010", 0.25], ["SKU-40015", 0.2]] },
      { code: "G-06", extra: [["SKU-30120", 0.3]] }
    ];
    MIXED_SEED.forEach(({ code, extra }) => {
      const base = ctx.stocks().find((stock) => stock.locationCode === code);
      if (!base) return;
      const baseQty = Math.max(1, Math.round(uppOf(base.itemCode) * 0.45));
      base.onHand = baseQty;
      base.allocated = Math.min(Number(base.allocated) || 0, baseQty);
      base.available = base.stockStatus === "AVAILABLE" ? baseQty - base.allocated : 0;
      extra.forEach(([extraCode, share], idx) => {
        // 원래 품목과 같으면 혼적이 아니다 — 다른 부자재로
        const itemCode = extraCode === base.itemCode ? "SKU-30120" : extraCode;
        const item = itemOf(itemCode)!;
        const onHand = Math.max(1, Math.round(uppOf(itemCode) * share));
        const receivedDate = shiftDate(String(base.receivedDate), -(3 + idx * 4));
        ctx.stocks().push({
          ...base,
          stockId: ctx.nextStockId(),
          itemCode,
          itemName: item.itemName,
          lotNo: `LOT${receivedDate.slice(2).replace(/-/g, "")}-${pad(lotSeq++, 4)}`,
          stockStatus: "AVAILABLE",
          receivedDate,
          onHand,
          allocated: 0,
          available: onHand,
          safetyStock: item.safetyStock,
          unit: item.unit
        });
      });
    });

    // 랙 없는 장소 (입고장 · 출고장 · 사무실) — 자유형 예시 포함
    ICHEON_PLACES.forEach((place) => {
      ctx.zones.push({
        id: zoneId++,
        warehouseId: ICHEON_ID,
        warehouseName: warehouse.name,
        purposeName: PURPOSE_NAME[place.purpose],
        storage: "FLOOR",
        rotation: 0,
        temp: "상온",
        recentIn: "—",
        recentOut: "—",
        ...place
      });
    });

    // 기존 로케이션 PI-A-01 은 좌표 없이 쓰던 데이터 — 미배치로 남겨 "미배치 트레이" 흐름을 보여준다
    ctx.locations().forEach((loc) => {
      loc.rackId ??= null;
      loc.bay ??= null;
      loc.level ??= null;
      loc.maxWeightKg ??= null;
      loc.outFreq90 ??= 0;
      if (loc.zoneId === 41) {
        loc.zoneId = 401;
        loc.zoneName = "A 구역";
      }
    });
    ctx.stocks().forEach((stock) => {
      if (stock.locationCode === "PI-A-01") stock.zoneName = "A 구역";
    });

    // 이천 피킹 재고를 쓰는 주문 라인 — 3D 우클릭의 "피킹 대기 주문" 연결을 보여주기 위해
    const attachLine = (outboundId: number, locationCode: string, lineId: number) => {
      const order = ctx.outbounds().find((row) => row.id === outboundId);
      const stock = ctx.stocks().find((row) => row.locationCode === locationCode && row.stockStatus === "AVAILABLE" && row.available > 0);
      if (!order || !stock) return;
      const orderQty = Math.max(1, Math.min(6, stock.available));
      (ctx.outboundLines[outboundId] ??= []).push({
        id: lineId,
        itemCode: stock.itemCode,
        itemName: stock.itemName,
        unit: stock.unit,
        consign: false,
        orderQty,
        pickedQty: 0,
        availableQty: stock.available,
        lotNo: stock.lotNo,
        locationCode,
        scanned: false
      });
      order.qty += orderQty;
    };
    attachLine(70, "A-05", 5);
    attachLine(46, "A-09", 6);
    attachLine(46, "B-18", 7);
  };

  /* ---------------- 계산 ---------------- */

  const liveStocksAt = (code: string) =>
    ctx.stocks().filter((stock) => stock.locationCode === code && Number(stock.onHand) > 0);

  /** 적용 허용 하중 — 로케이션에 따로 정한 값이 랙 기준보다 우선. null = 제한 없음 */
  const maxLoadOf = (loc: AnyRecord): number | null => {
    if (loc.maxWeightKg != null) return Number(loc.maxWeightKg);
    const rack = rackOf(loc.rackId);
    return rack?.maxLoadKg != null ? Number(rack.maxLoadKg) : null;
  };

  const slotMetrics = (loc: AnyRecord) => {
    const rows = liveStocksAt(loc.code);
    const rack = rackOf(loc.rackId);
    const capacity = Number(rack?.palletsPerSlot) || 1;
    const pallets = rows.reduce((sum, row) => sum + Number(row.onHand) / uppOf(row.itemCode), 0);
    const used = pallets > 0 ? Math.ceil(pallets - 1e-9) : 0;
    return {
      capacity,
      pallets: round2(pallets),
      used,
      util: Math.round((used / capacity) * 100),
      skuCount: new Set(rows.map((row) => row.itemCode)).size,
      onHand: rows.reduce((sum, row) => sum + Number(row.onHand), 0),
      loadKg: round2(rows.reduce((sum, row) => sum + Number(row.onHand) * weightOf(row.itemCode), 0)),
      maxLoadKg: maxLoadOf(loc)
    };
  };

  /** 칸 허용 하중 — 올린 뒤 무게가 한도를 넘으면 막는다 (이동 · 보충 · 격납 공통) */
  const assertLoad = (locationId: number, itemCode: string, qty: number) => {
    const loc = locationOf(locationId);
    if (!loc) return;
    const limit = maxLoadOf(loc);
    if (limit == null) return;
    const after = slotMetrics(loc).loadKg + qty * weightOf(itemCode);
    if (after > limit + 1e-6) {
      fail(`${loc.code} 허용 하중 초과 — 올린 뒤 ${Math.round(after).toLocaleString()} / ${limit.toLocaleString()} kg`);
    }
  };

  const placementLabel = (loc: AnyRecord) => {
    const rack = rackOf(loc.rackId);
    return rack ? `${rack.code} · ${loc.bay}연 ${loc.level}단` : null;
  };

  const locationRow = (loc: AnyRecord) => {
    const zone = zoneOf(loc.zoneId);
    const rack = rackOf(loc.rackId);
    const live = liveStocksAt(loc.code);
    // 품목 이름은 겹치지 않게, 가나다순 (서버 GROUP_CONCAT DISTINCT … ORDER BY 와 같게)
    const names = Array.from(new Set(live.map((row) => String(row.itemName)))).sort((a, b) => a.localeCompare(b, "ko"));
    return {
      ...loc,
      warehouseId: zone?.warehouseId ?? warehouseByName(loc.warehouseName)?.id ?? null,
      floor: zone?.floor ?? null,
      rackCode: rack?.code ?? null,
      placement: placementLabel(loc),
      maxWeightKg: loc.maxWeightKg ?? null,
      rackMaxLoadKg: rack?.maxLoadKg ?? null,
      palletSpec: rack?.palletSpec ?? null,
      stockCount: live.length,
      /** 든 품목 종류 수 — 2 이상이면 혼적 */
      skuCount: new Set(live.map((row) => row.itemCode)).size,
      /** 든 품목 이름 ", " 로 이음 (표시용) — 비었으면 null */
      skuNames: names.length ? names.join(", ") : null
    };
  };

  const computeLayout = (warehouseId: number) => {
    const warehouse = warehouseOf(warehouseId) ?? fail("창고를 찾을 수 없습니다.");
    const whZones = ctx.zones.filter((zone) => zone.warehouseId === warehouseId);
    const zoneIds = new Set(whZones.map((zone) => zone.id));
    const whLocations = ctx.locations().filter((loc) => zoneIds.has(loc.zoneId));

    const slots = whLocations
      .filter((loc) => rackOf(loc.rackId))
      .map((loc) => ({
        locationId: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        rackId: loc.rackId,
        bay: loc.bay,
        level: loc.level,
        locationType: loc.locationType,
        status: loc.status,
        active: loc.active,
        outFreq90: Number(loc.outFreq90) || 0,
        ...slotMetrics(loc)
      }))
      .sort((a, b) => byCode(a.code, b.code));

    const zones = whZones
      .filter((zone) => zone.floor)
      .map((zone) => {
        const zoneSlots = slots.filter((slot) => slot.zoneId === zone.id);
        const zoneLocs = whLocations.filter((loc) => loc.zoneId === zone.id);
        const stockRows = zoneLocs.flatMap((loc) => liveStocksAt(loc.code));
        const positions = zoneSlots.reduce((sum, slot) => sum + slot.capacity, 0);
        const usedPositions = zoneSlots.reduce((sum, slot) => sum + slot.used, 0);
        const codes = zoneSlots.map((slot) => slot.code).sort(byCode);
        return {
          id: zone.id,
          code: zone.code,
          name: zone.name,
          floor: zone.floor,
          purpose: zone.purpose ?? "RESERVE",
          purposeName: zone.purposeName ?? PURPOSE_NAME[zone.purpose] ?? "보관 구역",
          storage: zone.storage ?? "RACK",
          x: zone.x,
          z: zone.z,
          width: zone.width,
          depth: zone.depth,
          rotation: Number(zone.rotation) || 0,
          shape: zone.shape ?? null,
          manager: zone.manager ?? "-",
          temp: zone.temp ?? "상온",
          recentIn: zone.recentIn ?? "—",
          recentOut: zone.recentOut ?? "—",
          locationCount: zoneLocs.length,
          positions,
          usedPositions,
          util: positions > 0 ? Math.round((usedPositions / positions) * 100) : 0,
          skuCount: new Set(stockRows.map((row) => row.itemCode)).size,
          onHand: stockRows.reduce((sum, row) => sum + Number(row.onHand), 0),
          codeRange: codes.length ? (codes.length > 1 ? `${codes[0]} ~ ${codes[codes.length - 1]}` : codes[0]) : "배치된 로케이션 없음"
        };
      });

    const unplaced = whLocations
      .filter((loc) => !rackOf(loc.rackId))
      .map((loc) => ({
        locationId: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        zoneName: zoneOf(loc.zoneId)?.name ?? "-",
        locationType: loc.locationType,
        stockCount: liveStocksAt(loc.code).length
      }))
      .sort((a, b) => byCode(a.code, b.code));

    const strip = ({ warehouseId: _drop, ...rest }: AnyRecord) => rest;

    return {
      warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name, type: warehouse.type },
      floors: floors.filter((floor) => floor.warehouseId === warehouseId).map(strip),
      zones,
      racks: racks.filter((rack) => zoneIds.has(rack.zoneId)).map(strip),
      slots,
      objects: objects.filter((object) => object.warehouseId === warehouseId).map(strip),
      vehicles: vehicles.filter((vehicle) => vehicle.warehouseId === warehouseId).map(strip),
      unplaced
    };
  };

  const layoutSummary = () =>
    ctx.warehouses.map((warehouse) => {
      const zoneIds = new Set(ctx.zones.filter((zone) => zone.warehouseId === warehouse.id).map((zone) => zone.id));
      const whLocations = ctx.locations().filter((loc) => zoneIds.has(loc.zoneId));
      return {
        warehouseId: warehouse.id,
        name: warehouse.name,
        type: warehouse.type,
        floors: floors.filter((floor) => floor.warehouseId === warehouse.id).length,
        locations: whLocations.length,
        placed: whLocations.filter((loc) => rackOf(loc.rackId)).length
      };
    });

  const slotDetail = (locationId: number) => {
    const loc = locationOf(locationId) ?? fail("로케이션을 찾을 수 없습니다.");
    const zone = zoneOf(loc.zoneId);
    const rack = rackOf(loc.rackId);
    const warehouse = warehouseByName(loc.warehouseName);
    const metrics = slotMetrics(loc);
    return {
      location: {
        id: loc.id,
        code: loc.code,
        locationType: loc.locationType,
        status: loc.status,
        active: loc.active,
        maxQty: loc.maxQty ?? null,
        maxWeightKg: loc.maxWeightKg ?? null,
        warehouseName: loc.warehouseName,
        warehouseType: warehouse?.type ?? "일반"
      },
      zone: zone ? { id: zone.id, code: zone.code, name: zone.name, floor: zone.floor ?? null } : null,
      rack: rack
        ? {
            id: rack.id,
            code: rack.code,
            bays: rack.bays,
            levels: rack.levels,
            palletsPerSlot: rack.palletsPerSlot,
            palletSpec: rack.palletSpec ?? "1100×1100",
            maxLoadKg: rack.maxLoadKg ?? null
          }
        : null,
      bay: rack ? loc.bay : null,
      level: rack ? loc.level : null,
      capacity: metrics.capacity,
      pallets: metrics.pallets,
      used: metrics.used,
      util: metrics.util,
      outFreq90: Number(loc.outFreq90) || 0,
      loadKg: metrics.loadKg,
      maxLoadKg: metrics.maxLoadKg,
      stocks: liveStocksAt(loc.code)
        .map((stock) => ({
          stockId: stock.stockId,
          itemCode: stock.itemCode,
          itemName: stock.itemName,
          lotNo: stock.lotNo,
          receivedDate: stock.receivedDate,
          stockStatus: stock.stockStatus,
          onHand: stock.onHand,
          allocated: stock.allocated,
          available: stock.available,
          unit: stock.unit,
          unitsPerPallet: uppOf(stock.itemCode),
          unitWeightKg: weightOf(stock.itemCode),
          warehouseType: stock.warehouseType
        }))
        .sort((a, b) => (a.receivedDate ?? "").localeCompare(b.receivedDate ?? ""))
    };
  };

  /* ---------------- 로케이션 마스터 ---------------- */

  const assertSlotFree = (rackId: number, bay: number, level: number, exceptLocationId?: number) => {
    const rack = rackOf(rackId) ?? fail("랙을 찾을 수 없습니다.");
    if (!Number.isInteger(bay) || bay < 1 || bay > rack.bays) fail(`${rack.code} 의 연은 1~${rack.bays} 입니다.`);
    if (!Number.isInteger(level) || level < 1 || level > rack.levels) fail(`${rack.code} 의 단은 1~${rack.levels} 입니다.`);
    const taken = ctx
      .locations()
      .find((loc) => loc.rackId === rackId && loc.bay === bay && loc.level === level && loc.id !== exceptLocationId);
    if (taken) fail(`${rack.code} ${bay}연 ${level}단에는 이미 ${taken.code} 가 배치되어 있습니다.`);
    return rack;
  };

  /** 최대 무게 입력 — 비우면 null(랙 기준을 따른다) */
  const readWeight = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const kg = Number(value);
    if (!(kg > 0)) fail("최대 무게는 0보다 커야 합니다.");
    return kg;
  };

  const readPlacement = (body: AnyRecord) => {
    if (body.rackId === undefined) return undefined;
    if (body.rackId === null || body.rackId === "") return null;
    return { rackId: Number(body.rackId), bay: Number(body.bay), level: Number(body.level) };
  };

  const createLocation = (body: AnyRecord) => {
    const code = String(body.code ?? "").trim();
    if (!code) fail("로케이션 코드를 입력하세요.");
    if (ctx.locations().some((loc) => loc.code.toLowerCase() === code.toLowerCase())) fail(`이미 있는 로케이션 코드입니다: ${code}`);
    const zone = zoneOf(Number(body.zoneId)) ?? fail("Zone 을 선택하세요.");
    const locationType = LOCATION_TYPES.includes(body.locationType) ? body.locationType : fail("로케이션 유형이 올바르지 않습니다.");
    const placement = readPlacement(body);
    if (placement) {
      const rack = assertSlotFree(placement.rackId, placement.bay, placement.level);
      if (rack.zoneId !== zone.id) fail(`${rack.code} 는 ${zone.name} 소속 랙이 아닙니다.`);
    }
    const id = ctx.locations().reduce((max, loc) => Math.max(max, loc.id), 0) + 1;
    const loc = {
      id,
      code,
      locationType,
      status: "가용",
      maxQty: body.maxQty == null || body.maxQty === "" ? null : Number(body.maxQty),
      maxWeightKg: readWeight(body.maxWeightKg),
      active: true,
      zoneId: zone.id,
      zoneName: zone.name,
      warehouseName: zone.warehouseName,
      stockCount: 0,
      rackId: placement?.rackId ?? null,
      bay: placement?.bay ?? null,
      level: placement?.level ?? null,
      outFreq90: 0
    };
    ctx.locations().unshift(loc);
    return locationRow(loc);
  };

  const updateLocation = (id: number, body: AnyRecord) => {
    const loc = locationOf(id) ?? fail("로케이션을 찾을 수 없습니다.");
    if (body.locationType !== undefined) {
      if (!LOCATION_TYPES.includes(body.locationType)) fail("로케이션 유형이 올바르지 않습니다.");
      loc.locationType = body.locationType;
      ctx.stocks().forEach((stock) => {
        if (stock.locationCode === loc.code) stock.locationType = body.locationType;
      });
    }
    if (body.status !== undefined) loc.status = body.status;
    if (body.maxQty !== undefined) loc.maxQty = body.maxQty === null || body.maxQty === "" ? null : Number(body.maxQty);
    if (body.maxWeightKg !== undefined) loc.maxWeightKg = readWeight(body.maxWeightKg);
    if (body.active !== undefined) loc.active = Boolean(body.active);
    const placement = readPlacement(body);
    if (placement === null) {
      loc.rackId = null;
      loc.bay = null;
      loc.level = null;
    } else if (placement) {
      const rack = assertSlotFree(placement.rackId, placement.bay, placement.level, loc.id);
      if (rack.zoneId !== loc.zoneId) {
        const zone = zoneOf(rack.zoneId);
        loc.zoneId = rack.zoneId;
        loc.zoneName = zone?.name ?? loc.zoneName;
        ctx.stocks().forEach((stock) => {
          if (stock.locationCode === loc.code) stock.zoneName = loc.zoneName;
        });
      }
      loc.rackId = placement.rackId;
      loc.bay = placement.bay;
      loc.level = placement.level;
    }
    return locationRow(loc);
  };

  const deleteLocation = (id: number) => {
    const loc = locationOf(id) ?? fail("로케이션을 찾을 수 없습니다.");
    const live = liveStocksAt(loc.code);
    if (live.length) fail(`재고가 남아 있는 로케이션은 삭제할 수 없습니다. (${loc.code} · ${live.length}건)`);
    const list = ctx.locations();
    list.splice(list.indexOf(loc), 1);
    return { ok: true };
  };

  const bulkType = (body: AnyRecord) => {
    if (!LOCATION_TYPES.includes(body.locationType)) fail("로케이션 유형이 올바르지 않습니다.");
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    ids.forEach((id) => updateLocation(id, { locationType: body.locationType }));
    return { ok: true, count: ids.length };
  };

  /* ---------------- 재고 이동 · 조정 ---------------- */

  const logTransfer = ({ prefix = "TR", ...row }: AnyRecord) => {
    const stamp = nowStamp();
    const compact = stamp.replace(/[-: ]/g, "").slice(2);
    transferSeq += 1;
    const entry = { id: transferSeq, transferNo: `${prefix}${compact}-${transferSeq}`, status: "done", createdAt: stamp, ...row };
    transferLog.unshift(entry);
    return entry;
  };

  /** kind: 일반 이동 / 보충 — 검증은 같고 이력 유형·번호만 다르다 */
  const moveStock = (body: AnyRecord, kind: "move" | "replenish" = "move") => {
    const stocks = ctx.stocks();
    const src = stocks.find((stock) => stock.stockId === Number(body.sourceStockId)) ?? fail("출발 재고를 찾을 수 없습니다.");
    const dest = locationOf(Number(body.toLocationId)) ?? fail("도착 로케이션을 찾을 수 없습니다.");
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty <= 0) fail("이동 수량을 확인하세요.");
    if (dest.code === src.locationCode) fail("출발과 도착 로케이션이 같습니다.");
    if (!dest.active) fail(`사용중지된 로케이션(${dest.code})으로는 이동할 수 없습니다.`);

    const movable = src.stockStatus === "AVAILABLE" ? Number(src.available) : Number(src.onHand);
    if (qty > movable) fail(`이동 가능 수량(${movable})을 넘었습니다.`);

    const destWarehouse = warehouseByName(dest.warehouseName);
    if ((destWarehouse?.type ?? "일반") !== src.warehouseType) fail("일반 ↔ 외주 창고 간 이동은 불가합니다.");

    const badDest = dest.locationType === "DEFECT" || dest.locationType === "DAMAGED";
    if (src.stockStatus === "AVAILABLE" && badDest) fail("가용 재고는 불량·파손 로케이션으로 옮길 수 없습니다. 불량 처리는 재고 조정으로 하세요.");
    if (src.stockStatus === "DEFECT" && !badDest) fail("불량 재고는 불량·파손 로케이션으로만 옮길 수 있습니다.");

    const destRack = rackOf(dest.rackId);
    if (destRack) {
      const before = slotMetrics(dest);
      const after = Math.ceil(before.pallets + qty / uppOf(src.itemCode) - 1e-9);
      if (after > before.capacity) fail(`${dest.code} 적치 한도 초과 — 이동 후 ${after}/${before.capacity} 파레트`);
    }
    assertLoad(dest.id, src.itemCode, qty);

    src.onHand -= qty;
    if (src.stockStatus === "AVAILABLE") src.available -= qty;
    const merged = stocks.find(
      (stock) =>
        stock.locationCode === dest.code &&
        stock.itemCode === src.itemCode &&
        stock.lotNo === src.lotNo &&
        stock.stockStatus === src.stockStatus
    );
    if (merged) {
      merged.onHand += qty;
      if (merged.stockStatus === "AVAILABLE") merged.available += qty;
    } else {
      stocks.push({
        ...src,
        stockId: ctx.nextStockId(),
        warehouseId: destWarehouse?.id ?? src.warehouseId,
        warehouseName: dest.warehouseName,
        zoneName: dest.zoneName,
        locationCode: dest.code,
        locationType: dest.locationType,
        onHand: qty,
        allocated: 0,
        available: src.stockStatus === "AVAILABLE" ? qty : 0
      });
    }
    const srcCode = src.locationCode;
    if (src.onHand <= 0 && Number(src.allocated) <= 0) stocks.splice(stocks.indexOf(src), 1);

    const entry = logTransfer({
      prefix: kind === "replenish" ? "RP" : "TR",
      itemCode: src.itemCode,
      itemName: src.itemName,
      fromWarehouse: src.warehouseName,
      toWarehouse: dest.warehouseName,
      fromLocation: srcCode,
      toLocation: dest.code,
      qty,
      type: kind === "replenish" ? "보충" : `${src.warehouseType}→${destWarehouse?.type ?? "일반"}`,
      lotNo: src.lotNo,
      erpLinked: src.warehouseType === "일반",
      reason: body.reason ? String(body.reason) : kind === "replenish" ? "피킹 로케이션 보충 (파레트 구성)" : null,
      createdBy: body.operator ? String(body.operator) : "system"
    });
    return { ok: true, transferNo: entry.transferNo };
  };

  /** 보충 — 출발은 보충(RESERVE) 재고, 도착은 피킹 로케이션이어야 한다 */
  const replenish = (body: AnyRecord) => {
    const src = ctx.stocks().find((stock) => stock.stockId === Number(body.sourceStockId)) ?? fail("보충할 재고를 찾을 수 없습니다.");
    const dest = locationOf(Number(body.toLocationId)) ?? fail("피킹 로케이션을 찾을 수 없습니다.");
    if (src.locationType !== "RESERVE") fail(`${src.locationCode} 는 보충 로케이션이 아닙니다.`);
    if (dest.locationType !== "PICKING") fail(`${dest.code} 는 피킹 로케이션이 아닙니다.`);
    return moveStock(body, "replenish");
  };

  /** 우클릭 메뉴 한 번에 — 칸 상세 + 보충 제안 + 이 칸을 쓰는 피킹 대기 주문 */
  const slotContext = (locationId: number) => {
    const detail = slotDetail(locationId);
    const code = detail.location.code;
    const suggestion = ctx
      .replenishment()
      .filter((row) => row.pickingLocationCode === code)
      .sort((a, b) => b.shortQty - a.shortQty)[0] ?? null;
    const orders = ctx
      .outbounds()
      .filter((order) => order.status === "출고대기" || order.status === "피킹중")
      .map((order) => ({
        outboundId: order.id,
        outboundNo: order.outboundNo,
        customerName: order.customerName,
        status: order.status,
        scheduledDate: order.scheduledDate,
        lines: (ctx.outboundLines[order.id] ?? [])
          .filter((line) => line.locationCode === code)
          .map((line) => ({ itemCode: line.itemCode, itemName: line.itemName, orderQty: line.orderQty, pickedQty: line.pickedQty, unit: line.unit }))
      }))
      .filter((order) => order.lines.length > 0);
    return { ...detail, replenishment: suggestion, orders };
  };

  const adjustStock = (body: AnyRecord) => {
    const stocks = ctx.stocks();
    const stock = stocks.find((row) => row.stockId === Number(body.stockId)) ?? fail("재고를 찾을 수 없습니다.");
    const reasonLabel = ADJUST_REASONS[body.reasonCode] ?? fail("조정 사유를 선택하세요.");
    const memo = String(body.memo ?? "").trim();
    if (body.reasonCode === "ETC" && !memo) fail("기타 사유는 메모를 입력해야 합니다.");
    const newQty = Number(body.newQty);
    if (!Number.isInteger(newQty) || newQty < 0) fail("조정 후 수량을 확인하세요.");
    const diff = newQty - Number(stock.onHand);
    if (diff === 0) fail("수량 변화가 없습니다.");
    if (newQty < Number(stock.allocated)) fail(`출고 할당 수량(${stock.allocated})보다 적게 조정할 수 없습니다.`);

    stock.onHand = newQty;
    if (stock.stockStatus === "AVAILABLE") stock.available = newQty - Number(stock.allocated);
    const code = stock.locationCode;
    if (newQty === 0) stocks.splice(stocks.indexOf(stock), 1);

    const entry = logTransfer({
      prefix: "AJ",
      itemCode: stock.itemCode,
      itemName: stock.itemName,
      fromWarehouse: stock.warehouseName,
      toWarehouse: stock.warehouseName,
      fromLocation: code,
      toLocation: code,
      qty: diff,
      type: "조정",
      lotNo: stock.lotNo,
      // 외주 재고는 ERP 전송 금지 (프로세스 문서 규칙)
      erpLinked: stock.warehouseType === "일반",
      reason: memo ? `${reasonLabel} · ${memo}` : reasonLabel,
      createdBy: body.operator ? String(body.operator) : "system"
    });
    return { ok: true, transferNo: entry.transferNo, diff };
  };

  const transferHistory = (params: URLSearchParams) => {
    const type = params.get("type");
    const from = params.get("dateFrom");
    const to = params.get("dateTo");
    const keyword = (params.get("keyword") ?? "").toLowerCase();
    return transferLog.filter((row) => {
      if (type && row.type !== type) return false;
      const day = String(row.createdAt).slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (keyword) {
        const hay = `${row.transferNo} ${row.itemCode} ${row.itemName} ${row.fromLocation} ${row.toLocation} ${row.lotNo}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  };

  /** 맵 검색 — 로케이션 코드 / 품목코드·품명. 품목은 그 품목이 있는 로케이션 전부를 돌려준다 */
  const searchMap = (warehouseId: number, rawQuery: string) => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return { locations: [], items: [] };
    const zoneIds = new Set(ctx.zones.filter((zone) => zone.warehouseId === warehouseId).map((zone) => zone.id));
    const whLocations = ctx.locations().filter((loc) => zoneIds.has(loc.zoneId));
    const placedInfo = (loc: AnyRecord) => {
      const zone = zoneOf(loc.zoneId);
      return {
        locationId: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        zoneName: zone?.name ?? "-",
        floor: zone?.floor ?? null,
        placed: Boolean(rackOf(loc.rackId)),
        locationType: loc.locationType
      };
    };

    const locations = whLocations
      .filter((loc) => loc.code.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.code.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.code.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || byCode(a.code, b.code);
      })
      .slice(0, 8)
      .map(placedInfo);

    const codes = new Set(whLocations.map((loc) => loc.code));
    const byItem = new Map<string, { itemCode: string; itemName: string; unit: string; onHand: number; codes: Set<string> }>();
    ctx.stocks().forEach((stock) => {
      if (!codes.has(stock.locationCode) || Number(stock.onHand) <= 0) return;
      const hay = `${stock.itemCode} ${stock.itemName}`.toLowerCase();
      if (!hay.includes(query)) return;
      const entry = byItem.get(stock.itemCode) ?? { itemCode: stock.itemCode, itemName: stock.itemName, unit: stock.unit, onHand: 0, codes: new Set<string>() };
      entry.onHand += Number(stock.onHand);
      entry.codes.add(stock.locationCode);
      byItem.set(stock.itemCode, entry);
    });
    const items = [...byItem.values()]
      .sort((a, b) => byCode(a.itemCode, b.itemCode))
      .slice(0, 6)
      .map((entry) => ({
        itemCode: entry.itemCode,
        itemName: entry.itemName,
        unit: entry.unit,
        onHand: entry.onHand,
        locations: whLocations.filter((loc) => entry.codes.has(loc.code)).map(placedInfo).sort((a, b) => byCode(a.code, b.code))
      }));

    return { locations, items };
  };

  /* ---------------- 배치 초안 · 게시 ---------------- */

  const versions = new Map<number, { version: number; publishedAt: string | null; publishedBy: string | null }>([
    [ICHEON_ID, { version: 1, publishedAt: "2026-06-10 09:00", publishedBy: "admin" }]
  ]);
  const drafts = new Map<number, { draft: LayoutDraft; savedAt: string; savedBy: string }>();

  const versionOf = (warehouseId: number) =>
    versions.get(warehouseId) ?? { version: 0, publishedAt: null, publishedBy: null };

  const warehouseZoneIds = (warehouseId: number) =>
    new Set(ctx.zones.filter((zone) => zone.warehouseId === warehouseId).map((zone) => zone.id));

  const draftLocations = (warehouseId: number) => {
    const zoneIds = warehouseZoneIds(warehouseId);
    return ctx
      .locations()
      .filter((loc) => zoneIds.has(loc.zoneId))
      .map((loc) => {
        const live = liveStocksAt(loc.code);
        const metrics = slotMetrics(loc);
        return {
          id: loc.id,
          code: loc.code,
          zoneId: loc.zoneId,
          locationType: loc.locationType,
          active: loc.active,
          hasStock: live.length > 0,
          stockCount: live.length,
          pallets: metrics.pallets,
          loadKg: metrics.loadKg,
          maxWeightKg: (loc.maxWeightKg ?? null) as number | null
        };
      })
      .sort((a, b) => byCode(a.code, b.code));
  };

  /** 게시본을 그대로 옮긴 편집용 사본 */
  const snapshotDraft = (warehouseId: number): LayoutDraft => {
    const zoneIds = warehouseZoneIds(warehouseId);
    const strip = ({ warehouseId: _omit, ...rest }: AnyRecord) => rest;
    const bindings: LayoutDraft["bindings"] = {};
    ctx
      .locations()
      .filter((loc) => zoneIds.has(loc.zoneId))
      .forEach((loc) => {
        bindings[String(loc.id)] = rackOf(loc.rackId) ? { rackId: loc.rackId, bay: loc.bay, level: loc.level } : null;
      });
    return {
      warehouseId,
      basedOn: versionOf(warehouseId).version,
      floors: floors.filter((floor) => floor.warehouseId === warehouseId).map(strip) as LayoutDraft["floors"],
      zones: ctx.zones
        .filter((zone) => zone.warehouseId === warehouseId)
        .map((zone) => ({
          id: zone.id,
          code: zone.code,
          name: zone.name,
          floor: zone.floor ?? null,
          purpose: zone.purpose ?? "RESERVE",
          purposeName: zone.purposeName ?? PURPOSE_NAME[zone.purpose ?? "RESERVE"],
          storage: zone.storage ?? "RACK",
          x: zone.x ?? 0,
          z: zone.z ?? 0,
          width: zone.width ?? 12,
          depth: zone.depth ?? 8,
          rotation: Number(zone.rotation) || 0,
          shape: zone.shape ?? null,
          manager: zone.manager ?? "-"
        })),
      racks: racks.filter((rack) => zoneIds.has(rack.zoneId)).map(strip) as LayoutDraft["racks"],
      objects: objects.filter((object) => object.warehouseId === warehouseId).map(strip) as LayoutDraft["objects"],
      bindings,
      newLocations: []
    };
  };

  const getDraft = (warehouseId: number) => {
    warehouseOf(warehouseId) ?? fail("창고를 찾을 수 없습니다.");
    const saved = drafts.get(warehouseId);
    const publishedDraft = snapshotDraft(warehouseId);
    return {
      draft: saved?.draft ?? publishedDraft,
      publishedDraft,
      hasSavedDraft: Boolean(saved),
      savedAt: saved?.savedAt ?? null,
      savedBy: saved?.savedBy ?? null,
      published: versionOf(warehouseId),
      locations: draftLocations(warehouseId)
    };
  };

  const saveDraft = (body: AnyRecord) => {
    const draft = body.draft as LayoutDraft;
    if (!draft || !warehouseOf(Number(draft.warehouseId))) fail("초안 형식이 올바르지 않습니다.");
    const savedAt = nowStamp();
    drafts.set(Number(draft.warehouseId), { draft, savedAt, savedBy: body.operator ? String(body.operator) : "system" });
    return { ok: true, savedAt };
  };

  const publishDraft = (body: AnyRecord) => {
    const draft = body.draft as LayoutDraft;
    const warehouseId = Number(draft?.warehouseId);
    const warehouse = warehouseOf(warehouseId) ?? fail("창고를 찾을 수 없습니다.");
    const current = versionOf(warehouseId);
    if (draft.basedOn !== current.version) {
      fail(`초안을 만든 뒤 다른 게시(v${current.version}, ${current.publishedBy ?? "-"})가 있었습니다. 초안을 다시 불러와 주세요.`);
    }

    const infos: DraftLocationInfo[] = [
      ...draftLocations(warehouseId).map((loc) => ({
        id: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        hasStock: loc.hasStock,
        pallets: loc.pallets,
        loadKg: loc.loadKg,
        maxWeightKg: loc.maxWeightKg
      })),
      ...draft.newLocations.map((loc) => ({ id: loc.id, code: loc.code, zoneId: loc.zoneId, hasStock: false }))
    ];
    const issues = validateDraft(draft, infos);
    if (hasErrors(issues)) {
      const errors = issues.filter((issue) => issue.level === "error").map((issue) => issue.message);
      fail(`게시할 수 없습니다 — ${errors.slice(0, 3).join(" / ")}${errors.length > 3 ? ` 외 ${errors.length - 3}건` : ""}`);
    }

    // 1) 층
    for (let i = floors.length - 1; i >= 0; i -= 1) if (floors[i].warehouseId === warehouseId) floors.splice(i, 1);
    // lastShape([자유형]으로 되돌릴 모양)는 초안 전용 — 게시본에는 남기지 않는다
    draft.floors.forEach(({ lastShape: _memo, ...floor }) => floors.push({ ...floor, warehouseId }));

    // 2) 구역 — 새 구역은 마스터에도 만든다. 기존 구역은 형상·이름만 바꾼다
    const zoneIdMap = new Map<number, number>();
    let nextZoneId = ctx.zones.reduce((max, zone) => Math.max(max, zone.id), 0);
    draft.zones.forEach((dz) => {
      const fields = {
        code: dz.code.trim(),
        name: dz.name.trim() || dz.code.trim(),
        floor: dz.floor,
        purpose: dz.purpose,
        purposeName: dz.purposeName || PURPOSE_NAME[dz.purpose],
        storage: dz.storage,
        x: dz.x,
        z: dz.z,
        width: dz.width,
        depth: dz.depth,
        rotation: Number(dz.rotation) || 0,
        shape: dz.shape ?? null,
        manager: dz.manager
      };
      if (dz.id > 0) {
        const zone = zoneOf(dz.id);
        if (!zone) return;
        const renamed = zone.name !== fields.name;
        Object.assign(zone, fields);
        zoneIdMap.set(dz.id, dz.id);
        if (renamed) {
          ctx.locations().forEach((loc) => {
            if (loc.zoneId === zone.id) {
              loc.zoneName = zone.name;
              ctx.stocks().forEach((stock) => {
                if (stock.locationCode === loc.code) stock.zoneName = zone.name;
              });
            }
          });
        }
      } else {
        nextZoneId += 1;
        ctx.zones.push({ id: nextZoneId, warehouseId, warehouseName: warehouse.name, temp: "상온", recentIn: "—", recentOut: "—", ...fields });
        zoneIdMap.set(dz.id, nextZoneId);
      }
    });

    // 3) 랙 — 창고 단위로 통째로 바꾼다
    const rackIdMap = new Map<number, number>();
    for (let i = racks.length - 1; i >= 0; i -= 1) if (racks[i].warehouseId === warehouseId) racks.splice(i, 1);
    let nextRackId = Math.max(4100, ...racks.map((rack) => rack.id));
    draft.racks.forEach((dr) => {
      const id = dr.id > 0 && !racks.some((rack) => rack.id === dr.id) ? dr.id : (nextRackId += 1);
      nextRackId = Math.max(nextRackId, id);
      rackIdMap.set(dr.id, id);
      racks.push({ ...dr, id, warehouseId, zoneId: zoneIdMap.get(dr.zoneId) ?? dr.zoneId });
    });

    // 4) 시설물
    for (let i = objects.length - 1; i >= 0; i -= 1) if (objects[i].warehouseId === warehouseId) objects.splice(i, 1);
    let nextObjectId = objects.reduce((max, object) => Math.max(max, object.id), 0);
    draft.objects.forEach((object) => {
      nextObjectId += 1;
      objects.push({ ...object, id: nextObjectId, warehouseId });
    });

    // 5) 새 로케이션 — 마스터에 만든다
    const locationIdMap = new Map<number, number>();
    let nextLocationId = ctx.locations().reduce((max, loc) => Math.max(max, loc.id), 0);
    draft.newLocations.forEach((nl) => {
      nextLocationId += 1;
      const zoneId = zoneIdMap.get(nl.zoneId) ?? nl.zoneId;
      const zone = zoneOf(zoneId);
      ctx.locations().push({
        id: nextLocationId,
        code: nl.code.trim(),
        locationType: nl.locationType,
        status: "가용",
        maxQty: null,
        maxWeightKg: null,
        active: true,
        zoneId,
        zoneName: zone?.name ?? "-",
        warehouseName: warehouse.name,
        stockCount: 0,
        rackId: null,
        bay: null,
        level: null,
        outFreq90: 0
      });
      locationIdMap.set(nl.id, nextLocationId);
    });

    // 6) 배정 — 다른 구역 랙으로 옮겨진 로케이션은 소속 구역도 따라간다
    Object.entries(draft.bindings).forEach(([key, placement]) => {
      const rawId = Number(key);
      const loc = locationOf(locationIdMap.get(rawId) ?? rawId);
      if (!loc) return;
      if (!placement) {
        loc.rackId = null;
        loc.bay = null;
        loc.level = null;
        return;
      }
      const rack = rackOf(rackIdMap.get(placement.rackId) ?? placement.rackId);
      if (!rack) return;
      loc.rackId = rack.id;
      loc.bay = placement.bay;
      loc.level = placement.level;
      if (loc.zoneId !== rack.zoneId) {
        const zone = zoneOf(rack.zoneId);
        loc.zoneId = rack.zoneId;
        loc.zoneName = zone?.name ?? loc.zoneName;
        ctx.stocks().forEach((stock) => {
          if (stock.locationCode === loc.code) stock.zoneName = loc.zoneName;
        });
      }
    });

    const published = { version: current.version + 1, publishedAt: nowStamp(), publishedBy: body.operator ? String(body.operator) : "system" };
    versions.set(warehouseId, published);
    drafts.delete(warehouseId);
    return { ok: true, published, warnings: issues.filter((issue) => issue.level === "warning").map((issue) => issue.message) };
  };

  /* ---------------- 라우팅 ---------------- */

  /** GET — 처리하지 않는 경로면 undefined */
  const get = (clean: string, params: URLSearchParams): unknown => {
    if (clean === "/warehouse/layout") return computeLayout(Number(params.get("warehouseId") ?? ICHEON_ID));
    if (clean === "/warehouse/layout-summary") return layoutSummary();
    if (clean === "/warehouse/layout/draft") return getDraft(Number(params.get("warehouseId") ?? ICHEON_ID));
    if (clean === "/warehouse/search") return searchMap(Number(params.get("warehouseId") ?? ICHEON_ID), params.get("q") ?? "");
    if (clean === "/locations") {
      const warehouseId = params.get("warehouseId");
      return ctx
        .locations()
        .map(locationRow)
        .filter((row) => !warehouseId || row.warehouseId === Number(warehouseId));
    }
    const detail = clean.match(/^\/locations\/(\d+)\/detail$/);
    if (detail) return slotDetail(Number(detail[1]));
    const context = clean.match(/^\/locations\/(\d+)\/context$/);
    if (context) return slotContext(Number(context[1]));
    if (clean === "/zones") return ctx.zones;
    if (clean === "/racks") {
      const zoneId = params.get("zoneId");
      return racks.filter((rack) => !zoneId || rack.zoneId === Number(zoneId));
    }
    if (clean === "/transfers") return transferLog;
    if (clean.startsWith("/history/transfer")) return transferHistory(params);
    return undefined;
  };

  /** POST/PUT/DELETE — 처리하지 않는 경로면 undefined */
  const mutate = (method: string, clean: string, body: AnyRecord): unknown => {
    if (method === "POST" && clean === "/locations") return createLocation(body);
    if (method === "POST" && clean === "/locations/bulk-type") return bulkType(body);
    const one = clean.match(/^\/locations\/(\d+)$/);
    if (one && method === "PUT") return updateLocation(Number(one[1]), body);
    if (one && method === "DELETE") return deleteLocation(Number(one[1]));
    if (method === "POST" && clean === "/transfers/move") return moveStock(body);
    // 보충 작업 화면(기존)과 3D 우클릭이 같은 처리를 쓴다
    if (method === "POST" && (clean === "/stocks/replenish" || clean === "/stocks/replenishment/complete")) return replenish(body);
    if (method === "POST" && clean === "/stocks/adjust") return adjustStock(body);
    if (method === "PUT" && clean === "/warehouse/layout/draft") return saveDraft(body);
    if (method === "POST" && clean === "/warehouse/layout/draft/discard") {
      drafts.delete(Number(body.warehouseId));
      return { ok: true };
    }
    if (method === "POST" && clean === "/warehouse/layout/publish") return publishDraft(body);
    return undefined;
  };

  seed();

  // logTransfer — 격납(mockApi)도 서버처럼 이동 이력에 '격납' 줄을 남긴다
  return { get, mutate, assertLoad, logTransfer };
}
