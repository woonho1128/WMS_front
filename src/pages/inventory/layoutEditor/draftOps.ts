/* ============================================================
   배치 초안 편집 연산 — 전부 순수 함수 (실행 취소가 쉬워진다)
   ============================================================ */

import {
  AISLE,
  RACK_DEFAULTS,
  ZONE_PAD,
  centeredExtent,
  classifyPoint,
  floorPoints,
  localToWorld,
  normalizeDeg,
  polygonBounds,
  polygonInside,
  rackLength,
  rackRect,
  rectPoints,
  rectsOverlap,
  snap,
  worldToLocal,
  zoneLocalPoints,
  type Pt
} from "../../../components/warehouse3d/geometry";
import { zonePolygon, type DraftNewLocation, type DraftObject, type DraftPlacement, type DraftRack, type DraftZone, type LayoutDraft } from "../../../components/warehouse3d/layoutRules";
import {
  ZONE_PURPOSES,
  purposeMeta,
  type LayoutObjectKind,
  type LayoutSlot,
  type LayoutZone,
  type LocationType,
  type WarehouseLayout,
  type ZonePurpose
} from "../../../components/warehouse3d/types";

export type EditorLocation = {
  id: number;
  code: string;
  zoneId: number;
  locationType: LocationType;
  active: boolean;
  hasStock: boolean;
  stockCount: number;
  pallets: number;
  loadKg: number;
  /** 로케이션에 따로 정한 최대 무게 — null 이면 랙 기준 */
  maxWeightKg: number | null;
};

export type DraftResponse = {
  draft: LayoutDraft;
  /** 지금 게시되어 있는 배치 — 게시 전 변경 요약에 쓴다 */
  publishedDraft: LayoutDraft;
  hasSavedDraft: boolean;
  savedAt: string | null;
  savedBy: string | null;
  published: { version: number; publishedAt: string | null; publishedBy: string | null };
  locations: EditorLocation[];
};

export type EditorSelection = { kind: "zone" | "rack" | "object"; id: number } | null;

/** zone = 사각형 장소 놓기, polygon = 꼭짓점을 찍어 자유형 장소 그리기 */
export type Tool = "select" | "zone" | "polygon" | "rack" | LayoutObjectKind;

/** 장소 유형 선택지 — 3D · 목록과 같은 정의(types.ts ZONE_PURPOSES) */
export const PURPOSE_OPTIONS = ZONE_PURPOSES;

export const OBJECT_DEFAULTS: Record<LayoutObjectKind, { width: number; depth: number; label: string; name: string }> = {
  DOCK_IN: { width: 7, depth: 3, label: "입고 도크", name: "입고 도크" },
  DOCK_OUT: { width: 7, depth: 3, label: "출고 도크", name: "출고 도크" },
  PILLAR: { width: 0.8, depth: 0.8, label: "", name: "기둥" },
  WALL: { width: 10, depth: 0.3, label: "", name: "벽" },
  AISLE: { width: 12, depth: 3.5, label: "통로", name: "통로 표시" }
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const tempId = (draft: LayoutDraft) =>
  Math.min(
    0,
    ...draft.zones.map((zone) => zone.id),
    ...draft.racks.map((rack) => rack.id),
    ...draft.objects.map((object) => object.id),
    ...draft.newLocations.map((loc) => loc.id)
  ) - 1;

const letterOf = (zoneCode: string) => zoneCode.split("-").pop() ?? zoneCode;

const clampInside = (value: number, half: number, min: number, max: number) =>
  Math.min(Math.max(value, min + half), max - half);

/** 회전 계산 뒤 좌표 — 부동소수 찌꺼기만 지운다 (0.5m 스냅 좌표는 그대로 남는다) */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/* ---------------- 층 ---------------- */

export const addFloor = (draft: LayoutDraft): { draft: LayoutDraft; code: string } => {
  const next = clone(draft);
  const numbers = next.floors.map((floor) => Number.parseInt(floor.code, 10)).filter(Number.isFinite);
  const code = `${(numbers.length ? Math.max(...numbers) : 0) + 1}F`;
  const base = next.floors[next.floors.length - 1];
  // 위층은 보통 같은 건물 모양 — 아래층 외곽(자유형 포함)을 그대로 이어받는다
  next.floors.push({ code, width: base?.width ?? 60, depth: base?.depth ?? 40, shape: base?.shape ? clone(base.shape) : null, bgImageUrl: null, bgScale: null });
  return { draft: next, code };
};

export const floorIsEmpty = (draft: LayoutDraft, code: string) =>
  !draft.zones.some((zone) => zone.floor === code) && !draft.objects.some((object) => object.floor === code);

export const removeFloor = (draft: LayoutDraft, code: string) => {
  const next = clone(draft);
  next.floors = next.floors.filter((floor) => floor.code !== code);
  return next;
};

export const setFloorSize = (draft: LayoutDraft, code: string, width: number, depth: number) => {
  const next = clone(draft);
  const floor = next.floors.find((item) => item.code === code);
  if (floor) {
    const nextWidth = Math.max(4, snap(width, 1));
    const nextDepth = Math.max(4, snap(depth, 1));
    // 자유형 건물이면 모양을 같은 비율로 늘이거나 줄인다 (원점 기준)
    if (floor.shape && floor.width > 0 && floor.depth > 0) {
      const sx = nextWidth / floor.width;
      const sz = nextDepth / floor.depth;
      floor.shape = floor.shape.map(([x, z]): [number, number] => [Math.round(x * sx * 1000) / 1000, Math.round(z * sz * 1000) / 1000]);
    }
    floor.width = nextWidth;
    floor.depth = nextDepth;
  }
  return next;
};

/* ---- 층(건물) 외곽 모양 — 건물이 네모가 아닐 때 ---- */

/** 층 외곽 꼭짓점(층 좌표)을 바꾼다 — 원점은 그대로 두고, 가로 · 세로는 모든 꼭짓점을 담는 원점 대칭 크기로 */
export const setFloorShape = (draft: LayoutDraft, code: string, points: Pt[]) => {
  const next = clone(draft);
  const floor = next.floors.find((item) => item.code === code);
  if (floor && points.length >= 3) {
    const rounded = points.map((point): [number, number] => [Math.round(point.x * 1000) / 1000, Math.round(point.z * 1000) / 1000]);
    const extent = centeredExtent(rounded.map(([x, z]) => ({ x, z })));
    floor.shape = rounded;
    floor.width = Math.round(extent.width * 1000) / 1000;
    floor.depth = Math.round(extent.depth * 1000) / 1000;
    // 다시 자유형이 됐으니 기억해 둔 모양은 버린다 — 기억은 사각형일 때만 쓴다
    delete floor.lastShape;
  }
  return next;
};

/** 사각형 → 자유형: 네 모서리가 꼭짓점이 된다 (캔버스에서 사각형 테두리를 바로 끌 때) */
export const toFloorFreeform = (draft: LayoutDraft, code: string) => {
  const floor = draft.floors.find((item) => item.code === code);
  return floor ? setFloorShape(draft, code, floorPoints({ width: floor.width, depth: floor.depth })) : draft;
};

/** [자유형] 버튼 — [사각형]으로 바꾸기 전에 그린 모양이 있으면 그 모양으로, 없으면 네 모서리부터 */
export const restoreFloorFreeform = (draft: LayoutDraft, code: string) => {
  const memo = draft.floors.find((item) => item.code === code)?.lastShape;
  return memo && memo.length >= 3 ? setFloorShape(draft, code, memo.map(([x, z]) => ({ x, z }))) : toFloorFreeform(draft, code);
};

/** 자유형 → 사각형: 모든 꼭짓점을 담는 원점 중심 사각형 (안의 장소는 그대로 안에 남는다). 그린 모양은 기억해 둔다 */
export const toFloorRectangle = (draft: LayoutDraft, code: string) => {
  const next = clone(draft);
  const floor = next.floors.find((item) => item.code === code);
  if (floor?.shape) {
    floor.lastShape = floor.shape;
    floor.shape = null;
  }
  return next;
};

export const insertFloorVertex = (draft: LayoutDraft, code: string, index: number, point: Pt) => {
  const floor = draft.floors.find((item) => item.code === code);
  if (!floor) return { draft, index: -1 };
  const points = floorPoints(floor);
  points.splice(index + 1, 0, point);
  return { draft: setFloorShape(draft, code, points), index: index + 1 };
};

export const removeFloorVertex = (draft: LayoutDraft, code: string, index: number) => {
  const floor = draft.floors.find((item) => item.code === code);
  if (!floor) return draft;
  const points = floorPoints(floor);
  if (points.length <= 3) return draft;
  points.splice(index, 1);
  return setFloorShape(draft, code, points);
};

/* ---------------- 구역(장소) ---------------- */

/** 사각형 장소 기본 크기 — 보관 구역은 랙 두 줄, 작업장·사무실은 조금 작게 */
export const zoneDefaultSize = (purpose: ZonePurpose) => (purposeMeta(purpose).racks ? { width: 14, depth: 10 } : { width: 10, depth: 6 });

/** 새 장소의 코드 · 이름 — 보관 구역은 "A 구역", 나머지는 "입고장 2" 처럼 유형 이름 */
const newZoneIdentity = (draft: LayoutDraft, purpose: ZonePurpose) => {
  const used = new Set(draft.zones.map((zone) => letterOf(zone.code).toUpperCase()));
  const letter = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("").find((ch) => !used.has(ch)) ?? `Z${draft.zones.length + 1}`;
  const prefix = draft.zones.find((zone) => zone.code.includes("-"))?.code.split("-")[0];
  const meta = purposeMeta(purpose);
  const sameKind = draft.zones.filter((zone) => zone.purpose === purpose && zone.floor).length;
  return {
    code: prefix ? `${prefix}-${letter}` : letter,
    name: meta.racks ? `${letter} 구역` : `${meta.label}${sameKind ? ` ${sameKind + 1}` : ""}`,
    purposeName: meta.label,
    storage: (meta.racks ? "RACK" : "FLOOR") as DraftZone["storage"]
  };
};

export const addZone = (draft: LayoutDraft, floorCode: string, x: number, z: number, purpose: ZonePurpose = "RESERVE") => {
  const next = clone(draft);
  const floor = next.floors.find((item) => item.code === floorCode);
  const { width, depth } = zoneDefaultSize(purpose);
  const zone: DraftZone = {
    id: tempId(next),
    ...newZoneIdentity(next, purpose),
    floor: floorCode,
    purpose,
    x: floor ? clampInside(snap(x), width / 2, -floor.width / 2, floor.width / 2) : snap(x),
    z: floor ? clampInside(snap(z), depth / 2, -floor.depth / 2, floor.depth / 2) : snap(z),
    width,
    depth,
    rotation: 0,
    shape: null,
    manager: "-"
  };
  next.zones.push(zone);
  return { draft: next, id: zone.id };
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** 꼭짓점(로컬) 목록을 구역에 넣는다 — 꼭짓점을 감싼 사각형의 중심이 구역 중심이 되도록 다시 맞춘다.
    바닥에서의 모양은 그대로이고, 안의 랙도 움직이지 않는다 */
const applyShape = (zone: DraftZone, local: Pt[]) => {
  const box = polygonBounds(local);
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const center = localToWorld(zone.x, zone.z, zone.rotation ?? 0, cx, cz);
  zone.x = round3(center.x);
  zone.z = round3(center.z);
  zone.width = round3(box.maxX - box.minX);
  zone.depth = round3(box.maxZ - box.minZ);
  zone.shape = local.map((point): [number, number] => [round3(point.x - cx), round3(point.z - cz)]);
  // 다시 자유형이 됐으니 기억해 둔 모양은 버린다 — 기억은 사각형일 때만 쓴다
  delete zone.lastShape;
};

/** 꼭짓점을 찍어 그린 자유형 장소 — points 는 바닥 좌표 */
export const addPolygonZone = (draft: LayoutDraft, floorCode: string, points: Pt[], purpose: ZonePurpose = "RESERVE") => {
  const next = clone(draft);
  const box = polygonBounds(points);
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const zone: DraftZone = {
    id: tempId(next),
    ...newZoneIdentity(next, purpose),
    floor: floorCode,
    purpose,
    x: cx,
    z: cz,
    width: 0,
    depth: 0,
    rotation: 0,
    shape: null,
    manager: "-"
  };
  applyShape(zone, points.map((point) => ({ x: point.x - cx, z: point.z - cz })));
  next.zones.push(zone);
  return { draft: next, id: zone.id };
};

/** 구역의 로컬 꼭짓점을 바꾼다 — 캔버스 꼭짓점 · 변 끌기가 매 프레임 base 초안에서 부른다 */
export const setZoneShape = (draft: LayoutDraft, zoneId: number, local: Pt[]) => {
  const next = clone(draft);
  const zone = next.zones.find((item) => item.id === zoneId);
  if (zone && local.length >= 3) applyShape(zone, local);
  return next;
};

/** 사각형 → 자유형: 네 모서리가 꼭짓점이 된다 (캔버스에서 사각형을 바로 끌 때) */
export const toFreeform = (draft: LayoutDraft, zoneId: number) => {
  const zone = draft.zones.find((item) => item.id === zoneId);
  return zone ? setZoneShape(draft, zoneId, zoneLocalPoints({ width: zone.width, depth: zone.depth })) : draft;
};

/** [자유형] 버튼 — [사각형]으로 바꾸기 전에 그린 모양이 있으면 그 모양으로(지금 중심 · 각도 기준), 없으면 네 모서리부터 */
export const restoreFreeform = (draft: LayoutDraft, zoneId: number) => {
  const memo = draft.zones.find((item) => item.id === zoneId)?.lastShape;
  return memo && memo.length >= 3 ? setZoneShape(draft, zoneId, memo.map(([x, z]) => ({ x, z }))) : toFreeform(draft, zoneId);
};

/** 자유형 → 사각형: 꼭짓점을 감싼 사각형(지금 외곽 크기)으로. 그린 모양은 기억해 둔다 */
export const toRectangle = (draft: LayoutDraft, zoneId: number) => {
  const next = clone(draft);
  const zone = next.zones.find((item) => item.id === zoneId);
  if (zone?.shape) {
    zone.lastShape = zone.shape;
    zone.shape = null;
  }
  return next;
};

/** index 뒤(변 index → index+1 사이)에 꼭짓점을 넣는다 */
export const insertZoneVertex = (draft: LayoutDraft, zoneId: number, index: number, point: Pt) => {
  const zone = draft.zones.find((item) => item.id === zoneId);
  if (!zone) return { draft, index: -1 };
  const local = zoneLocalPoints(zone);
  local.splice(index + 1, 0, point);
  return { draft: setZoneShape(draft, zoneId, local), index: index + 1 };
};

/** 꼭짓점을 지운다 — 세 개는 남아야 한다 */
export const removeZoneVertex = (draft: LayoutDraft, zoneId: number, index: number) => {
  const zone = draft.zones.find((item) => item.id === zoneId);
  if (!zone) return draft;
  const local = zoneLocalPoints(zone);
  if (local.length <= 3) return draft;
  local.splice(index, 1);
  return setZoneShape(draft, zoneId, local);
};

/** 바닥 좌표가 들어 있는 장소 (그 층) — 랙 도구 · 클릭 판정 */
export const zoneAt = (draft: LayoutDraft, floorCode: string, x: number, z: number) =>
  draft.zones.find((zone) => zone.floor === floorCode && classifyPoint({ x, z }, zonePolygon(zone)) !== "outside");

/** 배치에서 빠져 있던 구역을 층 가운데에 놓는다 */
export const placeZone = (draft: LayoutDraft, zoneId: number, floorCode: string) => {
  const next = clone(draft);
  const zone = next.zones.find((item) => item.id === zoneId);
  if (zone) {
    zone.floor = floorCode;
    zone.x = 0;
    zone.z = 0;
    if (!zone.shape) {
      zone.width = Math.max(zone.width, 12);
      zone.depth = Math.max(zone.depth, 8);
    }
  }
  return next;
};

export const patchZone = (draft: LayoutDraft, id: number, patch: Partial<DraftZone>) => {
  const next = clone(draft);
  const zone = next.zones.find((item) => item.id === id);
  if (!zone) return next;
  // 구역을 옮기거나 돌리면 안의 랙도 같이 — 구역 중심을 축으로 돌린 뒤 옮긴다 (구역 안에서의 자리는 그대로)
  const fromX = zone.x;
  const fromZ = zone.z;
  const fromRotation = zone.rotation ?? 0;
  const toRotation = patch.rotation != null ? normalizeDeg(patch.rotation) : fromRotation;
  const turn = toRotation - fromRotation;
  const dx = patch.x != null ? patch.x - fromX : 0;
  const dz = patch.z != null ? patch.z - fromZ : 0;
  // 자유형의 외곽 크기를 숫자로 바꾸면 꼭짓점을 같은 비율로 늘이거나 줄인다
  if (zone.shape && ((patch.width != null && patch.width !== zone.width) || (patch.depth != null && patch.depth !== zone.depth))) {
    const sx = patch.width != null && zone.width > 0 ? patch.width / zone.width : 1;
    const sz = patch.depth != null && zone.depth > 0 ? patch.depth / zone.depth : 1;
    zone.shape = zone.shape.map(([px, pz]): [number, number] => [round3(px * sx), round3(pz * sz)]);
  }
  Object.assign(zone, patch, { rotation: toRotation });
  if (patch.purpose) {
    const meta = purposeMeta(patch.purpose);
    zone.purposeName = meta.label;
    zone.storage = meta.racks ? "RACK" : "FLOOR";
  }
  if (dx || dz || turn) {
    next.racks.forEach((rack) => {
      if (rack.zoneId !== id) return;
      const turned = turn ? localToWorld(fromX, fromZ, turn, rack.x - fromX, rack.z - fromZ) : { x: rack.x, z: rack.z };
      rack.x = round6(turned.x + dx);
      rack.z = round6(turned.z + dz);
      if (turn) rack.rotation = normalizeDeg((rack.rotation ?? 0) + turn);
    });
  }
  return next;
};

/* ---------------- 랙 ---------------- */

const rackCodeFor = (draft: LayoutDraft, zone: DraftZone) => {
  const letter = letterOf(zone.code);
  const numbers = draft.racks
    .filter((rack) => rack.code.startsWith(`${letter}-R`))
    .map((rack) => Number.parseInt(rack.code.slice(letter.length + 2), 10))
    .filter(Number.isFinite);
  return `${letter}-R${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, "0")}`;
};

/** 구역 안 빈 자리를 찾아 랙을 놓는다 — 없으면 요청 좌표에 놓고 검증에 맡긴다.
    회전한 구역이면 구역 좌표계에서 자리를 찾고 랙도 구역 방향으로 놓는다 */
export const addRack = (draft: LayoutDraft, zoneId: number, x?: number, z?: number) => {
  const next = clone(draft);
  const zone = next.zones.find((item) => item.id === zoneId);
  if (!zone) return { draft: next, id: null as number | null };
  const rotation = normalizeDeg(zone.rotation ?? 0);
  const rack: DraftRack = {
    id: tempId(next),
    zoneId,
    code: rackCodeFor(next, zone),
    x: 0,
    z: 0,
    rotation,
    bays: 4,
    levels: 4,
    ...RACK_DEFAULTS
  };
  const length = rackLength(rack);
  // 구역 로컬 좌표(구역 중심 원점, 회전 전) 기준 범위
  const minX = -zone.width / 2 + ZONE_PAD + length / 2;
  const maxX = zone.width / 2 - ZONE_PAD - length / 2;
  const minZ = -zone.depth / 2 + ZONE_PAD + rack.depth / 2;
  const maxZ = zone.depth / 2 - ZONE_PAD - rack.depth / 2;
  const others = next.racks.filter((item) => item.zoneId === zoneId);
  const worldAt = (lx: number, lz: number) => localToWorld(zone.x, zone.z, rotation, lx, lz);
  const outline = zonePolygon(zone);
  const fits = (lx: number, lz: number) => {
    const point = worldAt(lx, lz);
    const footprint = { x: point.x, z: point.z, width: length, depth: rack.depth, rotation };
    // 자유형 장소면 외곽 사각형 안이라도 파인 곳이 있다 — 꼭짓점 외곽 안인지도 본다
    if (zone.shape && !polygonInside(rectPoints(footprint), outline)) return false;
    return !others.some((other) => rectsOverlap(footprint, rackRect(other)));
  };
  const put = (lx: number, lz: number) => {
    const point = worldAt(lx, lz);
    rack.x = round6(point.x);
    rack.z = round6(point.z);
  };

  let placed = false;
  if (x != null && z != null) {
    const local = worldToLocal(zone.x, zone.z, rotation, x, z);
    const lx = snap(Math.min(Math.max(local.x, minX), Math.max(minX, maxX)));
    const lz = snap(Math.min(Math.max(local.z, minZ), Math.max(minZ, maxZ)));
    if (fits(lx, lz)) {
      put(lx, lz);
      placed = true;
    }
  }
  for (let lz = minZ; lz <= maxZ + 0.001 && !placed; lz += rack.depth + AISLE) {
    for (let lx = minX; lx <= maxX + 0.001 && !placed; lx += 0.5) {
      if (fits(snap(lx), snap(lz))) {
        put(snap(lx), snap(lz));
        placed = true;
      }
    }
  }
  if (!placed) {
    if (x != null && z != null) {
      rack.x = snap(x);
      rack.z = snap(z);
    } else {
      rack.x = zone.x;
      rack.z = zone.z;
    }
  }
  next.racks.push(rack);
  return { draft: next, id: rack.id };
};

export const patchRack = (draft: LayoutDraft, id: number, patch: Partial<DraftRack>) => {
  const next = clone(draft);
  const rack = next.racks.find((item) => item.id === id);
  if (rack) Object.assign(rack, patch);
  return next;
};

export const rotateRack = (draft: LayoutDraft, id: number) => {
  const rack = draft.racks.find((item) => item.id === id);
  if (!rack) return draft;
  return patchRack(draft, id, { rotation: normalizeDeg(rack.rotation + 90) });
};

/** 연·단을 줄이면 잘리는 칸의 로케이션 — 재고가 있으면 막고, 없으면 미배치로 돌린다 */
export const resizeRack = (
  draft: LayoutDraft,
  id: number,
  bays: number,
  levels: number,
  locationById: Map<number, EditorLocation>
): { draft: LayoutDraft; blocked: string | null; released: string[] } => {
  const cut = Object.entries(draft.bindings).filter(
    ([, placement]) => placement && placement.rackId === id && (placement.bay > bays || placement.level > levels)
  );
  const stocked = cut.filter(([key]) => locationById.get(Number(key))?.hasStock);
  if (stocked.length) {
    const codes = stocked.map(([key]) => locationById.get(Number(key))?.code ?? key);
    return { draft, blocked: `재고가 있는 로케이션이 잘립니다: ${codes.slice(0, 4).join(", ")}${codes.length > 4 ? ` 외 ${codes.length - 4}` : ""}`, released: [] };
  }
  const next = patchRack(draft, id, { bays: Math.max(1, bays), levels: Math.max(1, levels) });
  const released: string[] = [];
  cut.forEach(([key]) => {
    next.bindings[key] = null;
    released.push(locationById.get(Number(key))?.code ?? next.newLocations.find((loc) => loc.id === Number(key))?.code ?? key);
  });
  return { draft: next, blocked: null, released };
};

/* ---------------- 시설물 ---------------- */

export const addObject = (draft: LayoutDraft, floorCode: string, kind: LayoutObjectKind, x: number, z: number) => {
  const next = clone(draft);
  const defaults = OBJECT_DEFAULTS[kind];
  const sameKind = next.objects.filter((object) => object.kind === kind && object.floor === floorCode).length;
  const object: DraftObject = {
    id: tempId(next),
    floor: floorCode,
    kind,
    x: snap(x),
    z: snap(z),
    width: defaults.width,
    depth: defaults.depth,
    rotation: 0,
    label: defaults.label ? `${defaults.label}${kind.startsWith("DOCK") ? ` ${sameKind + 1}` : ""}` : ""
  };
  next.objects.push(object);
  return { draft: next, id: object.id };
};

export const patchObject = (draft: LayoutDraft, id: number, patch: Partial<DraftObject>) => {
  const next = clone(draft);
  const object = next.objects.find((item) => item.id === id);
  if (object) Object.assign(object, patch);
  return next;
};

/* ---------------- 이동 · 삭제 ---------------- */

export const moveSelection = (draft: LayoutDraft, selection: EditorSelection, x: number, z: number) => {
  if (!selection) return draft;
  if (selection.kind === "zone") return patchZone(draft, selection.id, { x, z });
  if (selection.kind === "rack") return patchRack(draft, selection.id, { x, z });
  return patchObject(draft, selection.id, { x, z });
};

export const positionOf = (draft: LayoutDraft, selection: EditorSelection) => {
  if (!selection) return null;
  const list = selection.kind === "zone" ? draft.zones : selection.kind === "rack" ? draft.racks : draft.objects;
  const item = (list as Array<{ id: number; x: number; z: number }>).find((entry) => entry.id === selection.id);
  return item ? { x: item.x, z: item.z } : null;
};

const unbindRack = (draft: LayoutDraft, rackId: number) => {
  Object.keys(draft.bindings).forEach((key) => {
    if (draft.bindings[key]?.rackId === rackId) draft.bindings[key] = null;
  });
};

/** 구역: 새 구역은 지우고, 기존 구역은 배치에서만 뺀다(마스터 유지). 랙: 지우고 로케이션은 미배치로 */
export const deleteSelection = (draft: LayoutDraft, selection: EditorSelection) => {
  if (!selection) return draft;
  const next = clone(draft);
  if (selection.kind === "object") {
    next.objects = next.objects.filter((object) => object.id !== selection.id);
  } else if (selection.kind === "rack") {
    unbindRack(next, selection.id);
    next.racks = next.racks.filter((rack) => rack.id !== selection.id);
  } else {
    next.racks.filter((rack) => rack.zoneId === selection.id).forEach((rack) => unbindRack(next, rack.id));
    next.racks = next.racks.filter((rack) => rack.zoneId !== selection.id);
    if (selection.id < 0 && !next.newLocations.some((loc) => loc.zoneId === selection.id)) {
      next.zones = next.zones.filter((zone) => zone.id !== selection.id);
    } else {
      const zone = next.zones.find((item) => item.id === selection.id);
      if (zone) zone.floor = null;
    }
  }
  return next;
};

/* ---------------- 로케이션 배정 ---------------- */

/** 칸에 로케이션을 놓는다 — 그 칸에 있던 로케이션은 미배치로 돌아간다 */
export const bindLocation = (draft: LayoutDraft, locationId: number, placement: DraftPlacement | null) => {
  const next = clone(draft);
  if (placement) {
    Object.keys(next.bindings).forEach((key) => {
      const other = next.bindings[key];
      if (other && other.rackId === placement.rackId && other.bay === placement.bay && other.level === placement.level) {
        next.bindings[key] = null;
      }
    });
  }
  next.bindings[String(locationId)] = placement;
  return next;
};

export const cellOccupant = (draft: LayoutDraft, rackId: number, bay: number, level: number) => {
  const entry = Object.entries(draft.bindings).find(
    ([, placement]) => placement && placement.rackId === rackId && placement.bay === bay && placement.level === level
  );
  return entry ? Number(entry[0]) : null;
};

/** 빈 칸마다 새 로케이션을 만든다. 패턴 토큰: {zone} {rack} {bay} {level} {seq} */
export const generateLocations = (
  draft: LayoutDraft,
  rackId: number,
  pattern: string,
  locationType: LocationType,
  existingCodes: Set<string>
): { draft: LayoutDraft; created: string[]; error: string | null } => {
  const rack = draft.racks.find((item) => item.id === rackId);
  const zone = rack ? draft.zones.find((item) => item.id === rack.zoneId) : undefined;
  if (!rack || !zone) return { draft, created: [], error: "랙을 찾을 수 없습니다" };
  if (!pattern.includes("{seq}") && !(pattern.includes("{bay}") && pattern.includes("{level}"))) {
    return { draft, created: [], error: "패턴에 {seq} 또는 {bay}와 {level}이 있어야 코드가 겹치지 않습니다" };
  }

  const next = clone(draft);
  const letter = letterOf(zone.code);
  const taken = new Set([...existingCodes, ...next.newLocations.map((loc) => loc.code)].map((code) => code.toUpperCase()));
  const seqPrefix = pattern.split("{seq}")[0].replace("{zone}", letter).replace("{rack}", rack.code);
  let seq = 0;
  taken.forEach((code) => {
    if (seqPrefix && code.startsWith(seqPrefix.toUpperCase())) {
      const tail = Number.parseInt(code.slice(seqPrefix.length), 10);
      if (Number.isFinite(tail)) seq = Math.max(seq, tail);
    }
  });

  const created: string[] = [];
  for (let bay = 1; bay <= rack.bays; bay += 1) {
    for (let level = 1; level <= rack.levels; level += 1) {
      if (cellOccupant(next, rackId, bay, level) != null) continue;
      seq += 1;
      const code = pattern
        .replace("{zone}", letter)
        .replace("{rack}", rack.code)
        .replace("{bay}", String(bay).padStart(2, "0"))
        .replace("{level}", String(level))
        .replace("{seq}", String(seq).padStart(2, "0"));
      if (taken.has(code.toUpperCase())) {
        return { draft, created: [], error: `이미 있는 코드가 만들어집니다: ${code}` };
      }
      taken.add(code.toUpperCase());
      const loc: DraftNewLocation = { id: tempId(next), code, zoneId: zone.id, locationType };
      next.newLocations.push(loc);
      next.bindings[String(loc.id)] = { rackId, bay, level };
      created.push(code);
    }
  }
  return { draft: next, created, error: created.length ? null : "빈 칸이 없습니다" };
};

/* ---------------- 3D 미리보기 ---------------- */

/** 초안을 3D 맵이 읽는 레이아웃 형태로 바꾼다 — 적치량은 게시본 로케이션 기준 */
export const buildPreviewLayout = (
  draft: LayoutDraft,
  warehouse: WarehouseLayout["warehouse"],
  locations: EditorLocation[],
  published: WarehouseLayout | null
): WarehouseLayout => {
  const locById = new Map(locations.map((loc) => [loc.id, loc]));
  const newById = new Map(draft.newLocations.map((loc) => [loc.id, loc]));
  const rackById = new Map(draft.racks.map((rack) => [rack.id, rack]));
  const zoneById = new Map(draft.zones.map((zone) => [zone.id, zone]));
  const outFreq = new Map((published?.slots ?? []).map((slot) => [slot.locationId, slot.outFreq90]));

  const slots: LayoutSlot[] = [];
  Object.entries(draft.bindings).forEach(([key, placement]) => {
    if (!placement) return;
    const rack = rackById.get(placement.rackId);
    const zone = rack ? zoneById.get(rack.zoneId) : undefined;
    if (!rack || !zone?.floor || placement.bay > rack.bays || placement.level > rack.levels) return;
    const id = Number(key);
    const existing = locById.get(id);
    const created = newById.get(id);
    if (!existing && !created) return;
    const pallets = existing?.pallets ?? 0;
    const capacity = rack.palletsPerSlot || 1;
    const used = pallets > 0 ? Math.ceil(pallets - 1e-9) : 0;
    slots.push({
      locationId: id,
      code: existing?.code ?? created!.code,
      zoneId: zone.id,
      rackId: rack.id,
      bay: placement.bay,
      level: placement.level,
      locationType: existing?.locationType ?? created!.locationType,
      status: "가용",
      active: existing?.active ?? true,
      capacity,
      pallets,
      used,
      util: Math.round((used / capacity) * 100),
      skuCount: existing?.hasStock ? 1 : 0,
      onHand: 0,
      outFreq90: outFreq.get(id) ?? 0,
      loadKg: existing?.loadKg ?? 0,
      maxLoadKg: existing?.maxWeightKg ?? rack.maxLoadKg ?? null
    });
  });

  const zones: LayoutZone[] = draft.zones
    .filter((zone) => zone.floor)
    .map((zone) => {
      const zoneSlots = slots.filter((slot) => slot.zoneId === zone.id);
      const positions = zoneSlots.reduce((sum, slot) => sum + slot.capacity, 0);
      const usedPositions = zoneSlots.reduce((sum, slot) => sum + slot.used, 0);
      const codes = zoneSlots.map((slot) => slot.code).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
      return {
        id: zone.id,
        code: zone.code,
        name: zone.name,
        floor: zone.floor!,
        purpose: zone.purpose,
        purposeName: zone.purposeName,
        storage: zone.storage,
        x: zone.x,
        z: zone.z,
        width: zone.width,
        depth: zone.depth,
        rotation: zone.rotation ?? 0,
        shape: zone.shape ?? null,
        manager: zone.manager,
        temp: "상온",
        recentIn: "—",
        recentOut: "—",
        locationCount: zoneSlots.length,
        positions,
        usedPositions,
        util: positions ? Math.round((usedPositions / positions) * 100) : 0,
        skuCount: 0,
        onHand: 0,
        codeRange: codes.length ? (codes.length > 1 ? `${codes[0]} ~ ${codes[codes.length - 1]}` : codes[0]) : "로케이션 없음"
      };
    });

  const placedIds = new Set(slots.map((slot) => slot.locationId));
  return {
    warehouse,
    floors: draft.floors,
    zones,
    racks: draft.racks.filter((rack) => zoneById.get(rack.zoneId)?.floor),
    slots,
    objects: draft.objects,
    vehicles: [],
    unplaced: [
      ...locations.filter((loc) => !placedIds.has(loc.id)).map((loc) => ({
        locationId: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        zoneName: zoneById.get(loc.zoneId)?.name ?? "-",
        locationType: loc.locationType,
        stockCount: loc.stockCount
      })),
      ...draft.newLocations.filter((loc) => !placedIds.has(loc.id)).map((loc) => ({
        locationId: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        zoneName: zoneById.get(loc.zoneId)?.name ?? "-",
        locationType: loc.locationType,
        stockCount: 0
      }))
    ]
  };
};

/** 게시 전 확인용 — 게시본 대비 무엇이 바뀌는지 사람이 읽을 문장으로 */
export const summarizeChanges = (before: LayoutDraft, after: LayoutDraft): string[] => {
  const lines: string[] = [];
  const sig = (value: unknown) => JSON.stringify(value);

  const beforeFloors = new Map(before.floors.map((floor) => [floor.code, floor]));
  const afterFloors = new Map(after.floors.map((floor) => [floor.code, floor]));
  const floorsAdded = after.floors.filter((floor) => !beforeFloors.has(floor.code)).map((floor) => floor.code);
  const floorsRemoved = before.floors.filter((floor) => !afterFloors.has(floor.code)).map((floor) => floor.code);
  const floorsResized = after.floors.filter((floor) => {
    const prev = beforeFloors.get(floor.code);
    return prev && (prev.width !== floor.width || prev.depth !== floor.depth || sig(prev.shape ?? null) !== sig(floor.shape ?? null));
  });
  if (floorsAdded.length) lines.push(`층 추가: ${floorsAdded.join(", ")}`);
  if (floorsRemoved.length) lines.push(`층 삭제: ${floorsRemoved.join(", ")}`);
  if (floorsResized.length) {
    lines.push(
      `층 외곽 변경: ${floorsResized
        .map((floor) => (floor.shape ? `${floor.code} 건물 모양 꼭짓점 ${floor.shape.length}개` : `${floor.code} ${floor.width}×${floor.depth}m`))
        .join(", ")}`
    );
  }

  const beforeZones = new Map(before.zones.map((zone) => [zone.id, zone]));
  // 회전은 따로 알린다 — "몇 도에서 몇 도로"가 게시 확인에 더 읽기 쉽다
  const zoneShape = (zone: DraftZone) =>
    sig([zone.code, zone.name, zone.floor, zone.purpose, zone.x, zone.z, zone.width, zone.depth, zone.shape ?? null, zone.manager]);
  const zonesTurned = after.zones.filter((zone) => {
    const prev = beforeZones.get(zone.id);
    return zone.id > 0 && zone.floor && prev?.floor && (prev.rotation ?? 0) !== (zone.rotation ?? 0);
  });
  const zonesNew = after.zones.filter((zone) => zone.id < 0 && zone.floor);
  const zonesPlaced = after.zones.filter((zone) => zone.id > 0 && zone.floor && !beforeZones.get(zone.id)?.floor);
  const zonesPulled = after.zones.filter((zone) => zone.id > 0 && !zone.floor && beforeZones.get(zone.id)?.floor);
  const zonesChanged = after.zones.filter((zone) => {
    const prev = beforeZones.get(zone.id);
    return zone.id > 0 && zone.floor && prev?.floor && zoneShape(prev) !== zoneShape(zone);
  });
  // 장소 = 보관 구역 + 입고장 · 출고장 · 사무실 등. 유형 이름을 붙여 무엇이 바뀌는지 읽히게 한다
  const named = (zone: DraftZone) => (purposeMeta(zone.purpose).racks ? zone.name : `${zone.name}(${purposeMeta(zone.purpose).label})`);
  if (zonesNew.length) lines.push(`새 장소 ${zonesNew.length}개: ${zonesNew.map(named).join(", ")}`);
  if (zonesPlaced.length) lines.push(`장소 배치: ${zonesPlaced.map(named).join(", ")}`);
  if (zonesPulled.length) lines.push(`배치에서 뺀 장소: ${zonesPulled.map(named).join(", ")}`);
  if (zonesChanged.length) lines.push(`위치·모양·속성이 바뀐 장소 ${zonesChanged.length}개: ${zonesChanged.map(named).join(", ")}`);
  if (zonesTurned.length) {
    lines.push(
      `회전한 장소 ${zonesTurned.length}개: ${zonesTurned.map((zone) => `${zone.name} ${beforeZones.get(zone.id)?.rotation ?? 0}° → ${zone.rotation ?? 0}°`).join(", ")}`
    );
  }

  const beforeRacks = new Map(before.racks.map((rack) => [rack.id, rack]));
  const afterRackIds = new Set(after.racks.map((rack) => rack.id));
  const racksNew = after.racks.filter((rack) => !beforeRacks.has(rack.id));
  const racksRemoved = before.racks.filter((rack) => !afterRackIds.has(rack.id));
  const racksChanged = after.racks.filter((rack) => {
    const prev = beforeRacks.get(rack.id);
    return prev && sig(prev) !== sig(rack);
  });
  if (racksNew.length) lines.push(`새 랙 ${racksNew.length}개: ${racksNew.map((rack) => rack.code).join(", ")}`);
  if (racksRemoved.length) lines.push(`삭제한 랙 ${racksRemoved.length}개: ${racksRemoved.map((rack) => rack.code).join(", ")}`);
  if (racksChanged.length) lines.push(`옮기거나 바꾼 랙 ${racksChanged.length}개: ${racksChanged.slice(0, 8).map((rack) => rack.code).join(", ")}${racksChanged.length > 8 ? " …" : ""}`);

  const objectSig = (object: DraftObject) => sig([object.floor, object.kind, object.x, object.z, object.width, object.depth, object.rotation, object.label]);
  const beforeObjects = before.objects.map(objectSig);
  const afterObjects = after.objects.map(objectSig);
  const objectsAdded = afterObjects.filter((value) => !beforeObjects.includes(value)).length;
  const objectsRemoved = beforeObjects.filter((value) => !afterObjects.includes(value)).length;
  if (objectsAdded || objectsRemoved) lines.push(`시설물 변경: 추가·수정 ${objectsAdded}건 / 제거·수정 전 ${objectsRemoved}건`);

  if (after.newLocations.length) lines.push(`새 로케이션 ${after.newLocations.length}개 — 로케이션 마스터에 생성됩니다`);

  const keys = new Set([...Object.keys(before.bindings), ...Object.keys(after.bindings)]);
  let moved = 0;
  let placed = 0;
  let released = 0;
  keys.forEach((key) => {
    if (Number(key) < 0) return;
    const prev = before.bindings[key] ?? null;
    const next = after.bindings[key] ?? null;
    if (sig(prev) === sig(next)) return;
    if (!prev && next) placed += 1;
    else if (prev && !next) released += 1;
    else moved += 1;
  });
  if (placed) lines.push(`미배치 → 랙 칸 배정 ${placed}개`);
  if (moved) lines.push(`다른 칸으로 옮긴 로케이션 ${moved}개 (재고 트랜잭션 없음)`);
  if (released) lines.push(`미배치로 돌린 로케이션 ${released}개`);

  return lines;
};

/** 랙이 구역 안에 온전히 있는가 — 캔버스 경고 표시에 쓴다 (자유형이면 꼭짓점 외곽 기준) */
export const rackOutsideZone = (draft: LayoutDraft, rack: DraftRack) => {
  const zone = draft.zones.find((item) => item.id === rack.zoneId);
  return !zone || !polygonInside(rectPoints(rackRect(rack)), zonePolygon(zone));
};
