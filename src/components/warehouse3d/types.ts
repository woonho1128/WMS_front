/** 3D 창고 맵 데이터 계약 (mock: GET /warehouse/layout) */

export type ZoneType = "PICKING" | "RESERVE" | "CROSS_DOCK" | "RETURN";

export type WarehouseZone = {
  id: string;
  floor: string;
  name: string;
  /** 로케이션 코드 범위 (예: A-01 ~ A-50) */
  code: string;
  type: ZoneType;
  typeName: string;
  /** 창고 중앙(0,0) 기준 좌표(m) */
  x: number;
  z: number;
  /** 랙 배치 */
  cols: number;
  rows: number;
  levels: number;
  /** 파레트 기준 수용/사용 */
  capacity: number;
  used: number;
  sku: number;
  manager: string;
  temp: string;
  recentIn: string;
  recentOut: string;
};

export type WarehouseDock = {
  id: string;
  kind: "IN" | "OUT";
  floor: string;
  x: number;
  z: number;
  label: string;
};

export type WarehouseVehicle = {
  id: string;
  kind: "FORKLIFT" | "AGV";
  floor: string;
  /** [x, z] 경유점 — 순환 이동 */
  path: Array<[number, number]>;
  /** m/s */
  speed: number;
};

export type WarehouseLayout = {
  warehouse: { code: string; name: string; floors: string[]; width: number; depth: number };
  zones: WarehouseZone[];
  docks: WarehouseDock[];
  vehicles: WarehouseVehicle[];
};

/** 적재율 구간 — 3D 색상과 범례가 공유한다 */
export type UtilBucket = { key: "free" | "normal" | "busy" | "full"; label: string; color: number; token: string };

export const UTIL_BUCKETS: UtilBucket[] = [
  { key: "free", label: "여유", color: 0x22c55e, token: "var(--c-success)" },
  { key: "normal", label: "보통", color: 0x2f6bff, token: "var(--primary)" },
  { key: "busy", label: "혼잡", color: 0xf59e0b, token: "var(--c-warning)" },
  { key: "full", label: "가득참", color: 0xef4444, token: "var(--c-danger)" }
];

export const utilOf = (zone: Pick<WarehouseZone, "used" | "capacity">) =>
  zone.capacity > 0 ? Math.round((zone.used / zone.capacity) * 100) : 0;

export const bucketOf = (util: number): UtilBucket => {
  if (util < 40) return UTIL_BUCKETS[0];
  if (util < 70) return UTIL_BUCKETS[1];
  if (util < 85) return UTIL_BUCKETS[2];
  return UTIL_BUCKETS[3];
};
