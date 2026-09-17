/* ============================================================
   3D 창고 맵 데이터 계약 — GET /warehouse/layout?warehouseId=
   원장 분리 (DOCS/WMS_3D창고맵_설계.md §3)
   - 로케이션이 있는가  → 로케이션 마스터
   - 어디에 놓였는가    → 레이아웃(구역 좌표 · 랙 · 시설물)
   - 둘을 잇는 값       → location.rackId / bay / level (null = 미배치)
   적치율은 저장값이 아니라 재고에서 계산한 값이다.
   ============================================================ */

/** 장소 유형 — 랙을 두는 보관 구역 4종 + 작업장(입고장 · 출고장) + 지원 공간(사무실 · 기타) */
export type ZonePurpose = "PICKING" | "RESERVE" | "CROSS_DOCK" | "RETURN" | "INBOUND" | "OUTBOUND" | "OFFICE" | "ETC";
export type StorageKind = "RACK" | "FLOOR";
export type LocationType = "PICKING" | "RESERVE" | "CROSS_DOCK" | "DEFECT" | "DAMAGED";
/** 자유형 장소의 꼭짓점 [x, z] — 구역 로컬 좌표(중심 원점, 회전 전), m. null 이면 가로 × 세로 사각형 */
export type ZoneShape = Array<[number, number]>;
/** 시설물(도크·기둥·벽·통로)은 90° 단위로만 돌린다. 구역·랙은 임의 각도(°) */
export type RackRotation = 0 | 90 | 180 | 270;

export type LayoutFloor = {
  code: string;
  /** 층 외곽 치수(m) — 층 중앙이 원점. 자유형이면 원점 기준 대칭으로 모든 꼭짓점을 담는 크기 */
  width: number;
  depth: number;
  /** 건물(층) 모양 — 층 좌표 꼭짓점 [[x, z], …]. 없거나 null 이면 가로 × 세로 사각형 */
  shape?: ZoneShape | null;
  /** 도면 배경 — 도면 수령 후 채운다 */
  bgImageUrl: string | null;
  bgScale: number | null;
};

export type LayoutZone = {
  id: number;
  code: string;
  name: string;
  floor: string;
  purpose: ZonePurpose;
  purposeName: string;
  storage: StorageKind;
  /** 외곽(자유형이면 꼭짓점을 감싼 사각형)의 중심 */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** 중심 기준 회전(°) — 위에서 봐서 시계 방향. 안의 랙 좌표·방향에는 이미 반영되어 있다 */
  rotation: number;
  /** 자유형 외곽 — null 이면 가로 × 세로 사각형 */
  shape: ZoneShape | null;
  manager: string;
  temp: string;
  recentIn: string;
  recentOut: string;
  /* ---- 계산값 ---- */
  /** 구역 소속 로케이션 수 (미배치 포함) */
  locationCount: number;
  /** 배치된 슬롯의 파레트 자리 합 */
  positions: number;
  /** 점유 파레트 자리 합 */
  usedPositions: number;
  util: number;
  skuCount: number;
  onHand: number;
  /** 배치된 로케이션 코드 범위 (예: A-01 ~ A-32) */
  codeRange: string;
};

export type LayoutRack = {
  id: number;
  zoneId: number;
  code: string;
  /** 랙 중심 좌표(m) */
  x: number;
  z: number;
  /** 0 = 연(베이)이 +x 방향으로 늘어섬, 90 = +z 방향. 회전한 구역 안이면 그 각도가 더해져 있다 */
  rotation: number;
  bays: number;
  levels: number;
  bayWidth: number;
  depth: number;
  levelHeight: number;
  palletsPerSlot: number;
  /** 이 랙에 맞춰 설계된 파레트 규격(mm) — 예: 1100×1100 */
  palletSpec: string;
  /** 칸(연×단) 하나에 올릴 수 있는 최대 무게(kg) — 로케이션에 따로 정하지 않으면 이 값. null = 제한 없음 */
  maxLoadKg: number | null;
};

export type LayoutSlot = {
  locationId: number;
  code: string;
  zoneId: number;
  rackId: number;
  /** 1부터 */
  bay: number;
  /** 1부터 (1 = 바닥 단) */
  level: number;
  locationType: LocationType;
  status: string;
  active: boolean;
  /** 파레트 자리 수 */
  capacity: number;
  /** 적치 파레트(소수) — 높이 표현용 */
  pallets: number;
  /** 점유 파레트 자리(올림) */
  used: number;
  util: number;
  skuCount: number;
  onHand: number;
  /** 최근 90일 출고 횟수 */
  outFreq90: number;
  /** 칸에 올라간 무게(kg) = 품목 단위 무게 × 수량 */
  loadKg: number;
  /** 적용되는 최대 무게(kg) — 로케이션 지정값, 없으면 랙 기준. null = 제한 없음 */
  maxLoadKg: number | null;
};

export type LayoutObjectKind = "DOCK_IN" | "DOCK_OUT" | "PILLAR" | "WALL" | "AISLE";

export type LayoutObject = {
  id: number;
  floor: string;
  kind: LayoutObjectKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: RackRotation;
  label: string;
};

export type LayoutVehicle = {
  id: string;
  kind: "FORKLIFT" | "AGV";
  floor: string;
  /** [x, z] 경유점 — 순환 이동 */
  path: Array<[number, number]>;
  /** m/s */
  speed: number;
};

export type UnplacedLocation = {
  locationId: number;
  code: string;
  zoneId: number;
  zoneName: string;
  locationType: LocationType;
  stockCount: number;
};

export type WarehouseLayout = {
  warehouse: { id: number; code: string; name: string; type: string };
  floors: LayoutFloor[];
  zones: LayoutZone[];
  racks: LayoutRack[];
  slots: LayoutSlot[];
  objects: LayoutObject[];
  vehicles: LayoutVehicle[];
  unplaced: UnplacedLocation[];
};

/* ---------- 슬롯 상세 — GET /locations/{id}/detail ---------- */

export type SlotStock = {
  stockId: number;
  itemCode: string;
  itemName: string;
  lotNo: string;
  receivedDate: string;
  stockStatus: string;
  onHand: number;
  allocated: number;
  available: number;
  unit: string;
  unitsPerPallet: number;
  /** 단위당 무게(kg) — 품목 마스터 */
  unitWeightKg: number;
  warehouseType: string;
};

export type SlotDetail = {
  location: {
    id: number;
    code: string;
    locationType: LocationType;
    status: string;
    active: boolean;
    maxQty: number | null;
    /** 로케이션에 따로 정한 최대 무게(kg) — null 이면 랙 기준을 따른다 */
    maxWeightKg: number | null;
    warehouseName: string;
    warehouseType: string;
  };
  zone: { id: number; code: string; name: string; floor: string | null } | null;
  rack: { id: number; code: string; bays: number; levels: number; palletsPerSlot: number; palletSpec: string; maxLoadKg: number | null } | null;
  bay: number | null;
  level: number | null;
  capacity: number;
  pallets: number;
  used: number;
  util: number;
  outFreq90: number;
  loadKg: number;
  maxLoadKg: number | null;
  stocks: SlotStock[];
};

/* ---------- 슬롯 우클릭 메뉴 — GET /locations/{id}/context ---------- */

/** 보충 제안 — 파레트 구성 기준 (피킹 재고 % 파레트당 수량 ≠ 0) */
export type ReplenishSuggestion = {
  itemCode: string;
  itemName: string;
  unit: string;
  unitsPerPallet: number;
  unitWeightKg: number;
  pickingLocationCode: string;
  pickingQty: number;
  wholePallets: number;
  looseQty: number;
  shortQty: number;
  suggestQty: number;
  sourceStockId: number | null;
  sourceLocationCode: string | null;
  sourceLot: string | null;
  sourceReceivedDate: string | null;
  sourceAvail: number;
  targetLocationId: number | null;
  targetLocationCode: string;
};

export type SlotOrder = {
  outboundId: number;
  outboundNo: string;
  customerName: string;
  status: string;
  scheduledDate: string | null;
  lines: Array<{ itemCode: string; itemName: string; orderQty: number; pickedQty: number; unit: string }>;
};

export type SlotContext = SlotDetail & { replenishment: ReplenishSuggestion | null; orders: SlotOrder[] };

/* ---------- 맵 상태 ---------- */

export type MapSelection = { zoneId: number | null; locationId: number | null };

/** 카메라 이동 요청 — nonce 가 바뀔 때마다 한 번 수행 */
export type FocusRequest = { zoneId?: number | null; locationId?: number | null; nonce: number };

/* ---------- 맵 검색 — GET /warehouse/search?warehouseId=&q= ---------- */

export type MapSearchLocation = {
  locationId: number;
  code: string;
  zoneId: number;
  zoneName: string;
  floor: string | null;
  placed: boolean;
  locationType: LocationType;
};

export type MapSearchItem = {
  itemCode: string;
  itemName: string;
  unit: string;
  onHand: number;
  locations: MapSearchLocation[];
};

export type MapSearchResult = { locations: MapSearchLocation[]; items: MapSearchItem[] };

/** GET /warehouse/layout-summary */
export type LayoutSummaryRow = {
  warehouseId: number;
  name: string;
  type: string;
  floors: number;
  locations: number;
  placed: number;
};

/* ---------- 적치율 구간 — 3D 색상 · 범례 · 목록이 공유한다 ---------- */

export type UtilBucket = { key: "free" | "normal" | "busy" | "full"; label: string; color: number; token: string };

export const UTIL_BUCKETS: UtilBucket[] = [
  { key: "free", label: "여유", color: 0x22c55e, token: "var(--c-success)" },
  { key: "normal", label: "보통", color: 0x2f6bff, token: "var(--primary)" },
  { key: "busy", label: "혼잡", color: 0xf59e0b, token: "var(--c-warning)" },
  { key: "full", label: "가득참", color: 0xef4444, token: "var(--c-danger)" }
];

export const bucketOf = (util: number): UtilBucket => {
  if (util < 40) return UTIL_BUCKETS[0];
  if (util < 70) return UTIL_BUCKETS[1];
  if (util < 85) return UTIL_BUCKETS[2];
  return UTIL_BUCKETS[3];
};

/* ---------- 장소 유형 — 편집기 · 3D · 목록이 같이 쓴다 ---------- */

export type ZonePurposeMeta = {
  value: ZonePurpose;
  label: string;
  group: "보관 구역" | "작업장" | "지원 공간";
  /** 랙(과 랙 칸 로케이션)을 둘 수 있는가 — 입고장·출고장·사무실은 바닥 공간 */
  racks: boolean;
  /** 이 구역 랙 칸에 로케이션을 만들 때 기본 유형 */
  locationType: LocationType | null;
  color: number;
  token: string;
  hint: string;
};

export const ZONE_PURPOSES: ZonePurposeMeta[] = [
  { value: "PICKING", label: "피킹 구역", group: "보관 구역", racks: true, locationType: "PICKING", color: 0x2f6bff, token: "var(--primary)", hint: "피킹 랙 — 오더 피킹" },
  { value: "RESERVE", label: "보관 구역", group: "보관 구역", racks: true, locationType: "RESERVE", color: 0x8b5cf6, token: "var(--c-violet)", hint: "보관 랙 — 보충 출발지" },
  { value: "CROSS_DOCK", label: "직출 구역", group: "보관 구역", racks: true, locationType: "CROSS_DOCK", color: 0x14b8a6, token: "var(--c-teal)", hint: "입고 후 바로 출고" },
  { value: "RETURN", label: "반품·불량", group: "보관 구역", racks: true, locationType: "DEFECT", color: 0xef4444, token: "var(--c-danger)", hint: "반품 · 불량 · 파손 보관" },
  { value: "INBOUND", label: "입고장", group: "작업장", racks: false, locationType: null, color: 0x22d3ee, token: "var(--accent)", hint: "하차 · 검수 · 입고 대기" },
  { value: "OUTBOUND", label: "출고장", group: "작업장", racks: false, locationType: null, color: 0xf59e0b, token: "var(--c-warning)", hint: "출고 대기 · 상차" },
  { value: "OFFICE", label: "사무실", group: "지원 공간", racks: false, locationType: null, color: 0x94a3b8, token: "var(--ink-muted)", hint: "사무 · 회의 공간" },
  { value: "ETC", label: "기타 공간", group: "지원 공간", racks: false, locationType: null, color: 0x64748b, token: "var(--ink-faint)", hint: "휴게실 · 충전장 · 설비 등" }
];

export const purposeMeta = (purpose: ZonePurpose | string | null | undefined): ZonePurposeMeta =>
  ZONE_PURPOSES.find((item) => item.value === purpose) ?? ZONE_PURPOSES[1];

/** 랙 · 적치율이 의미 있는 구역인가 (보관 구역 4종) */
export const zoneHoldsRacks = (zone: { purpose: ZonePurpose | string }) => purposeMeta(zone.purpose).racks;

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  PICKING: "피킹",
  RESERVE: "보충",
  CROSS_DOCK: "직출",
  DEFECT: "불량",
  DAMAGED: "파손"
};

/* ---------- 색 기준 — 한 번에 한 가지 의미만 칠한다 ---------- */

export type ColorMode = "util" | "type" | "turnover";

export const COLOR_MODE_LABEL: Record<ColorMode, string> = {
  util: "적치율",
  type: "로케이션 유형",
  turnover: "출고 빈도"
};

export type LegendEntry = { key: string; label: string; color: number; token: string };

export const TYPE_LEGEND: Array<LegendEntry & { key: LocationType }> = [
  { key: "PICKING", label: "피킹", color: 0x2f6bff, token: "var(--primary)" },
  { key: "RESERVE", label: "보충", color: 0x8b5cf6, token: "var(--c-violet)" },
  { key: "CROSS_DOCK", label: "직출", color: 0x14b8a6, token: "var(--c-teal)" },
  { key: "DEFECT", label: "불량", color: 0xef4444, token: "var(--c-danger)" },
  { key: "DAMAGED", label: "파손", color: 0xf59e0b, token: "var(--c-warning)" }
];

/** 최근 90일 출고 횟수 구간 */
export const TURNOVER_LEGEND: Array<LegendEntry & { min: number }> = [
  { key: "none", label: "정체", min: 0, color: 0x64748b, token: "var(--ink-faint)" },
  { key: "low", label: "낮음", min: 1, color: 0x22d3ee, token: "var(--accent)" },
  { key: "mid", label: "보통", min: 20, color: 0x2f6bff, token: "var(--primary)" },
  { key: "high", label: "높음", min: 60, color: 0xf59e0b, token: "var(--c-warning)" },
  { key: "hot", label: "매우 높음", min: 120, color: 0xef4444, token: "var(--c-danger)" }
];

export const turnoverOf = (outFreq90: number) =>
  [...TURNOVER_LEGEND].reverse().find((entry) => outFreq90 >= entry.min) ?? TURNOVER_LEGEND[0];

export const legendFor = (mode: ColorMode): LegendEntry[] =>
  mode === "type" ? TYPE_LEGEND : mode === "turnover" ? TURNOVER_LEGEND : UTIL_BUCKETS;

/* ---------- 칸 하나의 숫자 — 랙 정면 격자 · 옆 패널 · 우클릭 메뉴가 같이 쓴다 ---------- */

/** 칸 채움(%) — 파레트 자리 기준. 1자리 칸에 0.38 파레트면 38% */
export const slotFillPct = (slot: Pick<LayoutSlot, "pallets" | "capacity">) =>
  slot.capacity > 0 ? Math.round((slot.pallets / slot.capacity) * 100) : 0;

export const isOverweight = (slot: Pick<LayoutSlot, "loadKg" | "maxLoadKg">) =>
  slot.maxLoadKg != null && slot.loadKg > slot.maxLoadKg + 1e-6;

/** kg 표기 — 100kg 이상은 정수, 그 아래는 소수 한 자리 (단위는 붙이지 않는다) */
export const formatKg = (kg: number) => (kg >= 100 ? Math.round(kg).toLocaleString() : String(Math.round(kg * 10) / 10));

/** 슬롯 한 칸의 색 — util 모드는 구역 적치율 색을 따른다(슬롯 1칸은 비었거나 찼거나라 구역 단위가 의미 있다) */
export const slotColorOf = (slot: Pick<LayoutSlot, "locationType" | "outFreq90">, zoneUtil: number, mode: ColorMode) => {
  if (mode === "type") return (TYPE_LEGEND.find((entry) => entry.key === slot.locationType) ?? TYPE_LEGEND[0]).color;
  if (mode === "turnover") return turnoverOf(slot.outFreq90).color;
  return bucketOf(zoneUtil).color;
};
