/* ============================================================
   레이아웃 좌표 계산 — 3D 렌더러와 2D 배치 편집기가 같이 쓴다
   좌표계: x = 오른쪽(+), z = 화면 아래/앞쪽(+), 층 중앙이 원점. 단위 m.
   회전: 도(°), 위에서 내려다볼 때 시계 방향이 + (0° 에서 +x 로 뻗은 변이 90° 에서 +z 로 향한다)
   ============================================================ */

import type { LayoutRack, LayoutZone, ZoneShape } from "./types";

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

/* ============================================================
   자유형 장소 — 다각형
   구역은 중심(x, z) · 회전 · 로컬 꼭짓점(shape)으로 둔다. shape 가 없으면 가로 × 세로 사각형.
   판정은 전부 바닥 좌표 꼭짓점으로 한다 — 맞닿기만 한 것은 겹침이 아니다.
   ============================================================ */

export type Pt = { x: number; z: number };

type ZoneOutline = { x: number; z: number; width: number; depth: number; rotation?: number; shape?: ZoneShape | null };

/** 구역 로컬 꼭짓점 — 위에서 봐서 시계 방향(사각형 기준) */
export const zoneLocalPoints = (zone: Pick<ZoneOutline, "width" | "depth" | "shape">): Pt[] => {
  if (zone.shape && zone.shape.length >= 3) return zone.shape.map(([x, z]) => ({ x, z }));
  const hw = zone.width / 2;
  const hd = zone.depth / 2;
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd }
  ];
};

/** 구역 외곽 꼭짓점 — 바닥 좌표 */
export const zoneWorldPoints = (zone: ZoneOutline): Pt[] =>
  zoneLocalPoints(zone).map((point) => localToWorld(zone.x, zone.z, zone.rotation ?? 0, point.x, point.z));

/** 층(건물) 외곽 꼭짓점 — 층 좌표 그대로. 자유형이 아니면 원점 중심 가로 × 세로 사각형 */
export const floorPoints = (floor: { width: number; depth: number; shape?: ZoneShape | null }): Pt[] => zoneLocalPoints(floor);

export const rectPoints = (rect: Rect): Pt[] => rectCorners(rect);

export const polygonArea = (points: Pt[]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
};

export const polygonBounds = (points: Pt[]) => {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};

/** 원점 기준 대칭으로 모든 점을 담는 가로 · 세로 — 층은 원점 중심 사각형을 가정하는 곳(3D 바닥판 · 화면 맞춤)이 많다 */
export const centeredExtent = (points: Pt[]) => {
  const box = polygonBounds(points);
  return { width: 2 * Math.max(Math.abs(box.minX), Math.abs(box.maxX)), depth: 2 * Math.max(Math.abs(box.minZ), Math.abs(box.maxZ)) };
};

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

export const distToSegment = (p: Pt, a: Pt, b: Pt) => {
  const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / len2));
  return distance(p, { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
};

/** 점이 다각형 안 / 경계 위 / 밖 — 경계는 tolerance(m) 안쪽 거리 */
export const classifyPoint = (p: Pt, polygon: Pt[], tolerance = 0.001): "inside" | "boundary" | "outside" => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (distToSegment(p, a, b) <= tolerance) return "boundary";
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside ? "inside" : "outside";
};

/** 두 선분이 서로를 가로지르는가 — 끝점이 닿거나 겹쳐 놓인 것은 가로지름이 아니다 */
const segmentsCross = (p1: Pt, p2: Pt, q1: Pt, q2: Pt, tolerance = 0.001) => {
  const lp = distance(p1, p2);
  const lq = distance(q1, q2);
  if (lp === 0 || lq === 0) return false;
  const d1 = cross(q1, q2, p1) / lq;
  const d2 = cross(q1, q2, p2) / lq;
  const d3 = cross(p1, p2, q1) / lp;
  const d4 = cross(p1, p2, q2) / lp;
  const opposite = (u: number, v: number) => (u > tolerance && v < -tolerance) || (u < -tolerance && v > tolerance);
  return opposite(d1, d2) && opposite(d3, d4);
};

const edgesOf = (points: Pt[]) => points.map((point, idx) => [point, points[(idx + 1) % points.length]] as const);

/** 외곽선이 꼬이지 않은 다각형인가 — 이웃하지 않은 변끼리 가로지르거나 닿으면 안 된다 */
export const polygonIsSimple = (points: Pt[], tolerance = 0.001) => {
  const n = points.length;
  if (n < 3) return false;
  const edges = edgesOf(points);
  for (let i = 0; i < n; i += 1) {
    if (distance(edges[i][0], edges[i][1]) <= tolerance) return false;
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const [a1, a2] = edges[i];
      const [b1, b2] = edges[j];
      if (segmentsCross(a1, a2, b1, b2, tolerance)) return false;
      if (distToSegment(b1, a1, a2) <= tolerance || distToSegment(b2, a1, a2) <= tolerance) return false;
      if (distToSegment(a1, b1, b2) <= tolerance || distToSegment(a2, b1, b2) <= tolerance) return false;
    }
  }
  return polygonArea(points) > tolerance;
};

/** inner 가 outer 안에 온전히 들어가는가 — 경계에 닿는 것은 괜찮다 (오목한 outer 도 판정) */
export const polygonInside = (inner: Pt[], outer: Pt[], tolerance = 0.001) => {
  if (inner.some((point) => classifyPoint(point, outer, tolerance) === "outside")) return false;
  const innerEdges = edgesOf(inner);
  const outerEdges = edgesOf(outer);
  for (const [a1, a2] of innerEdges) {
    for (const [b1, b2] of outerEdges) {
      if (segmentsCross(a1, a2, b1, b2, tolerance)) return false;
    }
    // 오목한 모서리를 스치며 바깥으로 나가는 변 — 변 위 몇 점을 더 본다
    for (const t of [0.25, 0.5, 0.75]) {
      const probe = { x: a1.x + (a2.x - a1.x) * t, z: a1.z + (a2.z - a1.z) * t };
      if (classifyPoint(probe, outer, tolerance) === "outside") return false;
    }
  }
  return true;
};

/** 두 다각형의 안쪽이 겹치는가 — 변끼리 맞닿기만 한 것은 겹침이 아니다 */
export const polygonsOverlap = (a: Pt[], b: Pt[], tolerance = 0.001) => {
  const ea = edgesOf(a);
  const eb = edgesOf(b);
  for (const [a1, a2] of ea) {
    for (const [b1, b2] of eb) {
      if (segmentsCross(a1, a2, b1, b2, tolerance)) return true;
    }
  }
  if (a.some((point) => classifyPoint(point, b, tolerance) === "inside")) return true;
  if (b.some((point) => classifyPoint(point, a, tolerance) === "inside")) return true;
  // 꼭짓점이 모두 서로의 경계에 놓인 경우(같은 모양이 포개짐 등) — 변 가운데에서 안쪽으로 조금 들어간 점으로 본다
  const probeInside = (from: Pt[], other: Pt[]) =>
    edgesOf(from).some(([p1, p2]) => {
      const len = distance(p1, p2);
      if (len <= tolerance) return false;
      const mid = { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 };
      const nx = -(p2.z - p1.z) / len;
      const nz = (p2.x - p1.x) / len;
      const step = Math.min(0.05, len / 4);
      return [1, -1].some((sign) => {
        const probe = { x: mid.x + nx * step * sign, z: mid.z + nz * step * sign };
        return classifyPoint(probe, from, tolerance) === "inside" && classifyPoint(probe, other, tolerance) === "inside";
      });
    });
  return probeInside(a, b) || probeInside(b, a);
};

/** 다각형 안쪽의 한 점 — 라벨 자리. 무게중심이 밖이면(ㄱ자 등) 경계에서 가장 먼 격자점 */
export const interiorPoint = (points: Pt[]): Pt => {
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const f = a.x * b.z - b.x * a.z;
    area += f;
    cx += (a.x + b.x) * f;
    cz += (a.z + b.z) * f;
  }
  if (Math.abs(area) > 1e-9) {
    const centroid = { x: cx / (3 * area), z: cz / (3 * area) };
    if (classifyPoint(centroid, points) === "inside") return centroid;
  }
  const box = polygonBounds(points);
  let best: Pt | null = null;
  let bestDist = -1;
  const steps = 18;
  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; j < steps; j += 1) {
      const probe = { x: box.minX + ((box.maxX - box.minX) * i) / steps, z: box.minZ + ((box.maxZ - box.minZ) * j) / steps };
      if (classifyPoint(probe, points) !== "inside") continue;
      const nearest = Math.min(...edgesOf(points).map(([p1, p2]) => distToSegment(probe, p1, p2)));
      if (nearest > bestDist) {
        bestDist = nearest;
        best = probe;
      }
    }
  }
  return best ?? points[0];
};
