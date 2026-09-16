/* ============================================================
   배치 초안 편집 연산 — 전부 순수 함수 (실행 취소가 쉬워진다)
   ============================================================ */

import {
  AISLE,
  RACK_DEFAULTS,
  ZONE_PAD,
  localToWorld,
  normalizeDeg,
  rackLength,
  rackRect,
  rectInside,
  rectsOverlap,
  snap,
  worldToLocal
} from "../../../components/warehouse3d/geometry";
import { zoneRect, type DraftNewLocation, type DraftObject, type DraftPlacement, type DraftRack, type DraftZone, type LayoutDraft } from "../../../components/warehouse3d/layoutRules";
import type {
  LayoutObjectKind,
  LayoutSlot,
  LayoutZone,
  LocationType,
  WarehouseLayout,
  ZonePurpose
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

export type Tool = "select" | "zone" | "rack" | LayoutObjectKind;

export const PURPOSE_OPTIONS: Array<{ value: ZonePurpose; label: string; locationType: LocationType }> = [
  { value: "PICKING", label: "피킹 구역", locationType: "PICKING" },
  { value: "RESERVE", label: "보관 구역", locationType: "RESERVE" },
  { value: "CROSS_DOCK", label: "직출 구역", locationType: "CROSS_DOCK" },
  { value: "RETURN", label: "반품·불량", locationType: "DEFECT" }
];

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
  next.floors.push({ code, width: base?.width ?? 60, depth: base?.depth ?? 40, bgImageUrl: null, bgScale: null });
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
    floor.width = Math.max(4, snap(width, 1));
    floor.depth = Math.max(4, snap(depth, 1));
  }
  return next;
};

/* ---------------- 구역 ---------------- */

export const addZone = (draft: LayoutDraft, floorCode: string, x: number, z: number) => {
  const next = clone(draft);
  const floor = next.floors.find((item) => item.code === floorCode);
  const used = new Set(next.zones.map((zone) => letterOf(zone.code).toUpperCase()));
  const letter = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("").find((ch) => !used.has(ch)) ?? `Z${next.zones.length + 1}`;
  const prefix = next.zones.find((zone) => zone.code.includes("-"))?.code.split("-")[0];
  const width = 14;
  const depth = 10;
  const zone: DraftZone = {
    id: tempId(next),
    code: prefix ? `${prefix}-${letter}` : letter,
    name: `${letter} 구역`,
    floor: floorCode,
    purpose: "RESERVE",
    purposeName: "보관 구역",
    storage: "RACK",
    x: floor ? clampInside(snap(x), width / 2, -floor.width / 2, floor.width / 2) : snap(x),
    z: floor ? clampInside(snap(z), depth / 2, -floor.depth / 2, floor.depth / 2) : snap(z),
    width,
    depth,
    rotation: 0,
    manager: "-"
  };
  next.zones.push(zone);
  return { draft: next, id: zone.id };
};

/** 배치에서 빠져 있던 구역을 층 가운데에 놓는다 */
export const placeZone = (draft: LayoutDraft, zoneId: number, floorCode: string) => {
  const next = clone(draft);
  const zone = next.zones.find((item) => item.id === zoneId);
  if (zone) {
    zone.floor = floorCode;
    zone.x = 0;
    zone.z = 0;
    zone.width = Math.max(zone.width, 12);
    zone.depth = Math.max(zone.depth, 8);
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
  Object.assign(zone, patch, { rotation: toRotation });
  if (patch.purpose) zone.purposeName = PURPOSE_OPTIONS.find((option) => option.value === patch.purpose)?.label ?? zone.purposeName;
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
  const fits = (lx: number, lz: number) => {
    const point = worldAt(lx, lz);
    return !others.some((other) => rectsOverlap({ x: point.x, z: point.z, width: length, depth: rack.depth, rotation }, rackRect(other)));
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
    return prev && (prev.width !== floor.width || prev.depth !== floor.depth);
  });
  if (floorsAdded.length) lines.push(`층 추가: ${floorsAdded.join(", ")}`);
  if (floorsRemoved.length) lines.push(`층 삭제: ${floorsRemoved.join(", ")}`);
  if (floorsResized.length) lines.push(`층 크기 변경: ${floorsResized.map((floor) => `${floor.code} ${floor.width}×${floor.depth}m`).join(", ")}`);

  const beforeZones = new Map(before.zones.map((zone) => [zone.id, zone]));
  // 회전은 따로 알린다 — "몇 도에서 몇 도로"가 게시 확인에 더 읽기 쉽다
  const zoneShape = (zone: DraftZone) => sig([zone.code, zone.name, zone.floor, zone.purpose, zone.x, zone.z, zone.width, zone.depth, zone.manager]);
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
  if (zonesNew.length) lines.push(`새 구역 ${zonesNew.length}개: ${zonesNew.map((zone) => zone.name).join(", ")}`);
  if (zonesPlaced.length) lines.push(`구역 배치: ${zonesPlaced.map((zone) => zone.name).join(", ")}`);
  if (zonesPulled.length) lines.push(`배치에서 뺀 구역: ${zonesPulled.map((zone) => zone.name).join(", ")}`);
  if (zonesChanged.length) lines.push(`위치·크기·속성이 바뀐 구역 ${zonesChanged.length}개: ${zonesChanged.map((zone) => zone.name).join(", ")}`);
  if (zonesTurned.length) {
    lines.push(
      `회전한 구역 ${zonesTurned.length}개: ${zonesTurned.map((zone) => `${zone.name} ${beforeZones.get(zone.id)?.rotation ?? 0}° → ${zone.rotation ?? 0}°`).join(", ")}`
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

/** 랙이 구역 안에 온전히 있는가 — 캔버스 경고 표시에 쓴다 */
export const rackOutsideZone = (draft: LayoutDraft, rack: DraftRack) => {
  const zone = draft.zones.find((item) => item.id === rack.zoneId);
  return !zone || !rectInside(rackRect(rack), zoneRect(zone));
};
