/* ============================================================
   배치 초안 — 형상 편집 단위와 검증 규칙
   편집기(화면)와 게시 API(목 서버)가 같은 규칙을 쓴다.
   ============================================================ */

import {
  floorPoints,
  polygonArea,
  polygonInside,
  polygonIsSimple,
  polygonsOverlap,
  rackRect,
  rectPoints,
  rectsOverlap,
  zoneWorldPoints,
  type Pt,
  type Rect
} from "./geometry";
import { purposeMeta, type LayoutObjectKind, type LocationType, type RackRotation, type StorageKind, type ZonePurpose, type ZoneShape } from "./types";

export type DraftFloor = {
  code: string;
  /** 원점 중심 외곽 — 자유형이면 모든 꼭짓점을 담는 대칭 크기 */
  width: number;
  depth: number;
  /** 건물 모양 꼭짓점(층 좌표) — 없거나 null 이면 가로 × 세로 사각형 */
  shape?: ZoneShape | null;
  /** [사각형]으로 바꾸기 직전의 자유형 — [자유형]을 다시 누르면 이 모양으로 돌아간다. 사각형일 때만 있고, 게시하지 않는 초안 전용 값 */
  lastShape?: ZoneShape | null;
  bgImageUrl: string | null;
  bgScale: number | null;
};

export type DraftZone = {
  /** 음수 = 초안에서 새로 만든 구역 */
  id: number;
  code: string;
  name: string;
  /** null = 배치에서 뺀 구역 (마스터에는 남아 있음) */
  floor: string | null;
  purpose: ZonePurpose;
  purposeName: string;
  storage: StorageKind;
  /** 외곽(자유형이면 꼭짓점을 감싼 사각형)의 중심 */
  x: number;
  z: number;
  /** 외곽 가로 · 세로 — 자유형이면 꼭짓점을 감싼 사각형 크기 */
  width: number;
  depth: number;
  /** 중심 기준 회전(°), 시계 방향 — 없던 초안은 0 */
  rotation: number;
  /** 자유형 꼭짓점(로컬) — 없거나 null 이면 가로 × 세로 사각형 */
  shape?: ZoneShape | null;
  /** [사각형]으로 바꾸기 직전의 자유형(로컬) — [자유형]을 다시 누르면 돌아간다. 사각형일 때만 있는 초안 전용 값 */
  lastShape?: ZoneShape | null;
  manager: string;
};

export type DraftRack = {
  id: number;
  zoneId: number;
  code: string;
  x: number;
  z: number;
  /** 임의 각도(°) — 구역을 돌리면 같이 돈다 */
  rotation: number;
  bays: number;
  levels: number;
  bayWidth: number;
  depth: number;
  levelHeight: number;
  palletsPerSlot: number;
  palletSpec: string;
  /** 칸당 허용 하중(kg) — null = 제한 없음 */
  maxLoadKg: number | null;
};

export type DraftObject = {
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

export type DraftPlacement = { rackId: number; bay: number; level: number };

export type DraftNewLocation = {
  /** 음수 임시 ID */
  id: number;
  code: string;
  zoneId: number;
  locationType: LocationType;
};

export type LayoutDraft = {
  warehouseId: number;
  /** 이 초안이 출발한 게시 버전 */
  basedOn: number;
  floors: DraftFloor[];
  zones: DraftZone[];
  racks: DraftRack[];
  objects: DraftObject[];
  /** locationId → 배치 (null = 미배치). 기존 로케이션과 새 로케이션(음수 ID) 모두 */
  bindings: Record<string, DraftPlacement | null>;
  newLocations: DraftNewLocation[];
};

/** 검증에 필요한 로케이션 정보 — 기존 마스터 + 초안의 새 로케이션 */
export type DraftLocationInfo = {
  id: number;
  code: string;
  zoneId: number;
  hasStock: boolean;
  pallets?: number;
  /** 지금 올라간 무게(kg) */
  loadKg?: number;
  /** 로케이션에 따로 정한 최대 무게(kg) — 있으면 랙 기준보다 우선 */
  maxWeightKg?: number | null;
};

export type RuleIssue = {
  level: "error" | "warning";
  message: string;
  /** 문제 대상 — 편집기에서 클릭하면 선택된다 */
  target?: { kind: "zone" | "rack" | "object" | "floor"; id: number | string };
};

export const zoneRect = (zone: Pick<DraftZone, "x" | "z" | "width" | "depth"> & { rotation?: number }): Rect => ({
  x: zone.x,
  z: zone.z,
  width: zone.width,
  depth: zone.depth,
  rotation: zone.rotation ?? 0
});
/** 구역 외곽 꼭짓점(바닥 좌표) — 겹침 · 경계 판정은 전부 이것으로 */
export const zonePolygon = (zone: Pick<DraftZone, "x" | "z" | "width" | "depth"> & { rotation?: number; shape?: ZoneShape | null }): Pt[] =>
  zoneWorldPoints(zone);
export const floorRect = (floor: Pick<DraftFloor, "width" | "depth">): Rect => ({ x: 0, z: 0, width: floor.width, depth: floor.depth });
/** 층(건물) 외곽 꼭짓점 — 자유형이면 그 모양, 아니면 원점 중심 사각형 */
export const floorPolygon = (floor: Pick<DraftFloor, "width" | "depth"> & { shape?: ZoneShape | null }): Pt[] => floorPoints(floor);
export const objectRect = (object: DraftObject): Rect => {
  const quarter = object.rotation === 90 || object.rotation === 270;
  return { x: object.x, z: object.z, width: quarter ? object.depth : object.width, depth: quarter ? object.width : object.depth };
};

export const validateDraft = (draft: LayoutDraft, locations: DraftLocationInfo[]): RuleIssue[] => {
  const issues: RuleIssue[] = [];
  const error = (message: string, target?: RuleIssue["target"]) => issues.push({ level: "error", message, target });
  const warning = (message: string, target?: RuleIssue["target"]) => issues.push({ level: "warning", message, target });

  const floorByCode = new Map(draft.floors.map((floor) => [floor.code, floor]));
  // 외곽선이 꼬인 층은 그 안의 경계 판정을 믿을 수 없어 건너뛴다
  const brokenFloors = new Set<string>();
  draft.floors.forEach((floor) => {
    if (!(floor.width > 0 && floor.depth > 0)) error(`${floor.code} 층 크기가 올바르지 않습니다`, { kind: "floor", id: floor.code });
    if (floor.shape) {
      const outline = floorPolygon(floor);
      if (floor.shape.length < 3 || !polygonIsSimple(outline)) {
        error(`${floor.code} 층 외곽선이 서로 꼬였습니다 — 꼭짓점을 옮기거나 지우세요`, { kind: "floor", id: floor.code });
        brokenFloors.add(floor.code);
      } else if (polygonArea(outline) < 4) {
        error(`${floor.code} 층 외곽이 너무 작습니다`, { kind: "floor", id: floor.code });
      }
    }
  });

  /* ---- 구역 ---- */
  const placedZones = draft.zones.filter((zone) => zone.floor);
  const codes = new Map<string, number>();
  draft.zones.forEach((zone) => {
    const key = zone.code.trim().toUpperCase();
    if (!key) error("코드가 비어 있는 구역이 있습니다", { kind: "zone", id: zone.id });
    else codes.set(key, (codes.get(key) ?? 0) + 1);
  });
  codes.forEach((count, code) => {
    if (count > 1) error(`구역 코드 ${code} 가 ${count}번 쓰였습니다`);
  });

  // 외곽선이 꼬인 자유형은 겹침 판정을 믿을 수 없으니 거기서 멈춘다
  const brokenZones = new Set<number>();
  placedZones.forEach((zone) => {
    const floor = floorByCode.get(zone.floor!);
    if (!floor) {
      error(`${zone.name} 의 층(${zone.floor})이 없습니다`, { kind: "zone", id: zone.id });
      return;
    }
    const outline = zonePolygon(zone);
    if (zone.shape && (zone.shape.length < 3 || !polygonIsSimple(outline))) {
      error(`${zone.name} 외곽선이 서로 꼬였습니다 — 꼭짓점을 옮기거나 지우세요`, { kind: "zone", id: zone.id });
      brokenZones.add(zone.id);
      return;
    }
    if (zone.width < 1 || zone.depth < 1 || polygonArea(outline) < 1) error(`${zone.name} 크기가 너무 작습니다`, { kind: "zone", id: zone.id });
    if (!brokenFloors.has(floor.code) && !polygonInside(outline, floorPolygon(floor))) {
      error(`${zone.name} 이(가) ${floor.code} 외곽을 벗어났습니다`, { kind: "zone", id: zone.id });
    }
  });
  for (let i = 0; i < placedZones.length; i += 1) {
    for (let j = i + 1; j < placedZones.length; j += 1) {
      const a = placedZones[i];
      const b = placedZones[j];
      if (a.floor !== b.floor || brokenZones.has(a.id) || brokenZones.has(b.id)) continue;
      if (polygonsOverlap(zonePolygon(a), zonePolygon(b))) {
        error(`${a.name} 과(와) ${b.name} 이(가) 겹칩니다`, { kind: "zone", id: b.id });
      }
    }
  }

  /* ---- 랙 ---- */
  const zoneById = new Map(draft.zones.map((zone) => [zone.id, zone]));
  const rackCodes = new Map<string, number>();
  draft.racks.forEach((rack) => {
    const zone = zoneById.get(rack.zoneId);
    rackCodes.set(rack.code.trim().toUpperCase(), (rackCodes.get(rack.code.trim().toUpperCase()) ?? 0) + 1);
    if (!zone || !zone.floor) {
      error(`${rack.code} 의 구역이 배치되어 있지 않습니다`, { kind: "rack", id: rack.id });
      return;
    }
    if (rack.bays < 1 || rack.levels < 1) error(`${rack.code} 의 연·단은 1 이상이어야 합니다`, { kind: "rack", id: rack.id });
    if (rack.maxLoadKg != null && !(rack.maxLoadKg > 0)) error(`${rack.code} 의 칸당 허용 하중은 0보다 커야 합니다`, { kind: "rack", id: rack.id });
    const meta = purposeMeta(zone.purpose);
    if (!meta.racks) {
      error(`${zone.name} 은(는) ${meta.label}이라 랙을 둘 수 없습니다 — ${rack.code} 를 옮기거나 유형을 보관 구역으로 바꾸세요`, { kind: "rack", id: rack.id });
    } else if (!brokenZones.has(zone.id) && !polygonInside(rectPoints(rackRect(rack)), zonePolygon(zone))) {
      error(`${rack.code} 이(가) ${zone.name} 밖으로 나갔습니다`, { kind: "rack", id: rack.id });
    }
  });
  rackCodes.forEach((count, code) => {
    if (count > 1) error(`랙 코드 ${code} 가 ${count}번 쓰였습니다`);
  });
  for (let i = 0; i < draft.racks.length; i += 1) {
    for (let j = i + 1; j < draft.racks.length; j += 1) {
      const a = draft.racks[i];
      const b = draft.racks[j];
      if (zoneById.get(a.zoneId)?.floor !== zoneById.get(b.zoneId)?.floor) continue;
      if (rectsOverlap(rackRect(a), rackRect(b))) error(`${a.code} 과(와) ${b.code} 이(가) 겹칩니다`, { kind: "rack", id: b.id });
    }
  }

  /* ---- 시설물 ---- */
  draft.objects.forEach((object) => {
    const floor = floorByCode.get(object.floor);
    if (!floor) error(`${object.label || object.kind} 의 층이 없습니다`, { kind: "object", id: object.id });
    else if (!brokenFloors.has(floor.code) && !polygonInside(rectPoints(objectRect(object)), floorPolygon(floor))) {
      error(`${object.label || "시설물"} 이(가) 층 외곽을 벗어났습니다`, { kind: "object", id: object.id });
    }
  });

  /* ---- 로케이션 배정 ---- */
  const rackById = new Map(draft.racks.map((rack) => [rack.id, rack]));
  const taken = new Map<string, number>();
  const infoById = new Map(locations.map((loc) => [loc.id, loc]));
  Object.entries(draft.bindings).forEach(([key, placement]) => {
    if (!placement) return;
    const id = Number(key);
    const code = infoById.get(id)?.code ?? `#${id}`;
    const rack = rackById.get(placement.rackId);
    if (!rack) {
      error(`${code} 이(가) 없는 랙에 배정되어 있습니다`);
      return;
    }
    if (placement.bay > rack.bays || placement.level > rack.levels) {
      error(`${code} 이(가) ${rack.code} 범위(${rack.bays}연 × ${rack.levels}단)를 벗어났습니다`, { kind: "rack", id: rack.id });
    }
    const cell = `${rack.id}:${placement.bay}:${placement.level}`;
    const other = taken.get(cell);
    if (other != null) error(`${rack.code} ${placement.bay}연 ${placement.level}단에 ${infoById.get(other)?.code ?? other} 와 ${code} 가 겹칩니다`, { kind: "rack", id: rack.id });
    else taken.set(cell, id);

    // 막지는 않는다 — 실물이 이미 그만큼 있으니 알려서 칸당 파레트 수나 위치를 다시 보게 한다
    const info = infoById.get(id);
    const pallets = info?.pallets ?? 0;
    if (pallets > (rack.palletsPerSlot || 1) + 1e-6) {
      warning(`${code} 재고 ${Math.round(pallets * 100) / 100} 파레트가 ${rack.code} 칸 용량(${rack.palletsPerSlot} 파레트)을 넘습니다`, { kind: "rack", id: rack.id });
    }
    // 무게도 같은 이유로 경고만 — 가벼운 랙으로 옮기면 여기서 걸린다
    const limit = info?.maxWeightKg ?? rack.maxLoadKg;
    if (limit != null && (info?.loadKg ?? 0) > limit + 1e-6) {
      warning(`${code} 무게 ${Math.round(info!.loadKg!)}kg 이 허용 하중(${limit}kg)을 넘습니다 — ${rack.code}`, { kind: "rack", id: rack.id });
    }
  });

  const newCodes = new Set<string>();
  const existingCodes = new Set(locations.filter((loc) => loc.id > 0).map((loc) => loc.code.toUpperCase()));
  draft.newLocations.forEach((loc) => {
    const code = loc.code.trim().toUpperCase();
    if (!code) error("코드가 비어 있는 새 로케이션이 있습니다");
    else if (existingCodes.has(code) || newCodes.has(code)) error(`로케이션 코드 ${loc.code} 가 이미 있습니다`);
    newCodes.add(code);
  });

  const strandedWithStock = locations.filter((loc) => loc.hasStock && !draft.bindings[String(loc.id)]).length;
  if (strandedWithStock) warning(`재고가 있는 로케이션 ${strandedWithStock}개가 미배치 상태입니다 — 3D에서 보이지 않습니다`);

  return issues;
};

export const hasErrors = (issues: RuleIssue[]) => issues.some((issue) => issue.level === "error");
