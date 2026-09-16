/* ============================================================
   레이아웃 좌표 계산 — 3D 렌더러와 2D 배치 편집기가 같이 쓴다
   좌표계: x = 오른쪽(+), z = 화면 아래/앞쪽(+), 층 중앙이 원점. 단위 m.
   회전: 도(°), 위에서 내려다볼 때 시계 방향이 + (0° 에서 +x 로 뻗은 변이 90° 에서 +z 로 향한다)
   ============================================================ */

import type { LayoutRack, LayoutZone } from "./types";

/** 랙 기둥 간격(베이 사이) */
export const BAY_GAP = 0.45;
/** 구역 바닥 두께 */
export const BASE_H = 0.25;
/** 구역 테두리와 랙 사이 여백 */
export const ZONE_PAD = 1.6;
/** 랙 열 사이 작업 통로 */
export const AISLE = 3.4;

/** 파레트 규격(mm) — 국내 표준 T11 이 기본, T12·유럽형도 쓴다 */
export const PALLET_SPECS = ["1100×1100", "1200×1000", "1200×800"] as const;

/** 새 랙 기본값 — 칸당 허용 하중은 일반 파레트 랙 빔 기준 1,000kg */
export const RACK_DEFAULTS = { bayWidth: 2.4, depth: 1.6, levelHeight: 1.5, palletsPerSlot: 1, palletSpec: "1100×1100", maxLoadKg: 1000 } as const;

type RackShape = Pick<LayoutRack, "x" | "z" | "rotation" | "bays" | "levels" | "bayWidth" | "depth" | "levelHeight">;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 0 이상 360 미만으로 — 소수 셋째 자리까지 */
export const normalizeDeg = (deg: number) => {
  const value = Math.round((((deg % 360) + 360) % 360) * 1000) / 1000;
  return value >= 360 ? 0 : value;
};

/** 90° 배수인가 — 가로·세로만 바뀌고 변이 축과 나란하다 */
export const isAxisAligned = (deg = 0) => {
  const rest = normalizeDeg(deg) % 90;
  return rest < 1e-6 || 90 - rest < 1e-6;
};

export const isQuarterTurn = (deg: number) => {
  const value = normalizeDeg(deg);
  return Math.abs(value - 90) < 1e-6 || Math.abs(value - 270) < 1e-6;
};

/** 버튼·단축키 회전 — 지금 각도에서 다음 눈금(예: 45° 배수)으로. 37° 에서 + 면 45°, - 면 0° */
export const stepRotation = (current: number, direction: 1 | -1, step = 45) => {
  const ratio = normalizeDeg(current) / step;
  const index = direction > 0 ? Math.floor(ratio + 1e-6) + 1 : Math.ceil(ratio - 1e-6) - 1;
  return normalizeDeg(index * step);
};

/** 중심(cx, cz)이 rotation 만큼 돌아간 틀의 로컬 좌표 → 바닥 좌표 */
export const localToWorld = (cx: number, cz: number, rotation: number, lx: number, lz: number) => {
  const a = rad(rotation);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: cx + lx * cos - lz * sin, z: cz + lx * sin + lz * cos };
};

/** 바닥 좌표 → 중심(cx, cz)·rotation 틀의 로컬 좌표 */
export const worldToLocal = (cx: number, cz: number, rotation: number, x: number, z: number) => {
  const a = rad(rotation);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = x - cx;
  const dz = z - cz;
  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
};

/** 랙 길이(연 방향) */
export const rackLength = (rack: Pick<LayoutRack, "bays" | "bayWidth">) =>
  rack.bays * rack.bayWidth + Math.max(rack.bays - 1, 0) * BAY_GAP;

export const rackHeight = (rack: Pick<LayoutRack, "levels" | "levelHeight">) => rack.levels * rack.levelHeight;

/** 슬롯 중심 좌표 — bay/level 은 1부터 */
export const slotCenter = (rack: RackShape, bay: number, level: number) => {
  const along = -rackLength(rack) / 2 + rack.bayWidth / 2 + (bay - 1) * (rack.bayWidth + BAY_GAP);
  const angle = rad(rack.rotation);
  return {
    x: rack.x + along * Math.cos(angle),
    y: BASE_H + rack.levelHeight / 2 + (level - 1) * rack.levelHeight,
    z: rack.z + along * Math.sin(angle)
  };
};

/** three.js rotation.y — +x 를 +z 쪽으로 돌리려면 음수 각이다 */
export const rackYaw = (rotation: number) => -rad(rotation);

/** 회전한 사각형 — width 는 로컬 x(회전 전 가로), depth 는 로컬 z */
export type Rect = { x: number; z: number; width: number; depth: number; rotation?: number };

export const rectOf = (item: { x: number; z: number; width: number; depth: number; rotation?: number }): Rect => ({
  x: item.x,
  z: item.z,
  width: item.width,
  depth: item.depth,
  rotation: item.rotation ?? 0
});

export const rectCorners = (rect: Rect) => {
  const hw = rect.width / 2;
  const hd = rect.depth / 2;
  const rotation = rect.rotation ?? 0;
  return [
    localToWorld(rect.x, rect.z, rotation, -hw, -hd),
    localToWorld(rect.x, rect.z, rotation, hw, -hd),
    localToWorld(rect.x, rect.z, rotation, hw, hd),
    localToWorld(rect.x, rect.z, rotation, -hw, hd)
  ];
};

/** 위에서 본 외접 사각형(축 정렬) 크기 — 90° 배수면 가로·세로를 정확히 바꾼다 */
export const boundsOf = (rect: Pick<Rect, "width" | "depth" | "rotation">) => {
  const rotation = rect.rotation ?? 0;
  if (isAxisAligned(rotation)) {
    return isQuarterTurn(rotation) ? { width: rect.depth, depth: rect.width } : { width: rect.width, depth: rect.depth };
  }
  const a = rad(rotation);
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  return { width: rect.width * cos + rect.depth * sin, depth: rect.width * sin + rect.depth * cos };
};

/** 위에서 본 랙 외곽(축 정렬) */
export const rackFootprint = (rack: RackShape) => boundsOf({ width: rackLength(rack), depth: rack.depth, rotation: rack.rotation });

export const rackRect = (rack: RackShape): Rect => ({ x: rack.x, z: rack.z, width: rackLength(rack), depth: rack.depth, rotation: rack.rotation });

/** 두 사각형이 겹치는가 — 맞닿기만 한 것은 겹침이 아니다. 회전했으면 분리축으로 판정 */
export const rectsOverlap = (a: Rect, b: Rect, tolerance = 0.001) => {
  if (isAxisAligned(a.rotation) && isAxisAligned(b.rotation)) {
    const sa = boundsOf(a);
    const sb = boundsOf(b);
    return Math.abs(a.x - b.x) * 2 < sa.width + sb.width - tolerance && Math.abs(a.z - b.z) * 2 < sa.depth + sb.depth - tolerance;
  }
  // 분리축 정리 — 두 사각형의 변 방향 4개 축에 투영해 한 축이라도 떨어져 있으면 겹치지 않는다
  const ca = rectCorners(a);
  const cb = rectCorners(b);
  const axes = [rad(a.rotation ?? 0), rad(a.rotation ?? 0) + Math.PI / 2, rad(b.rotation ?? 0), rad(b.rotation ?? 0) + Math.PI / 2];
  return axes.every((angle) => {
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    const pa = ca.map((point) => point.x * ux + point.z * uz);
    const pb = cb.map((point) => point.x * ux + point.z * uz);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > tolerance;
  });
};

/** a 가 b 안에 완전히 들어가는가 — a 의 네 꼭짓점을 b 의 로컬 좌표로 옮겨 본다 */
export const rectInside = (a: Rect, b: Rect, tolerance = 0.001) => {
  const hw = b.width / 2 + tolerance;
  const hd = b.depth / 2 + tolerance;
  return rectCorners(a).every((point) => {
    const local = worldToLocal(b.x, b.z, b.rotation ?? 0, point.x, point.z);
    return Math.abs(local.x) <= hw && Math.abs(local.z) <= hd;
  });
};

/** 구역 높이 — 구역 안에서 가장 높은 랙 기준 */
export const zoneHeight = (zone: Pick<LayoutZone, "id">, racks: Array<Pick<LayoutRack, "zoneId" | "levels" | "levelHeight">>) => {
  const tallest = racks
    .filter((rack) => rack.zoneId === zone.id)
    .reduce((max, rack) => Math.max(max, rackHeight(rack)), 0);
  return BASE_H + Math.max(tallest, 1.5);
};

export const snap = (value: number, step = 0.5) => Math.round(value / step) * step;
