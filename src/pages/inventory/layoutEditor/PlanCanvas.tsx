import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BAY_GAP,
  boundsOf,
  floorPoints,
  isQuarterTurn,
  localToWorld,
  polygonArea,
  polygonBounds,
  rackFootprint,
  rackLength,
  snap,
  worldToLocal,
  zoneLocalPoints,
  zoneWorldPoints,
  type Pt
} from "../../../components/warehouse3d/geometry";
import type { DraftObject, DraftRack, DraftZone, LayoutDraft } from "../../../components/warehouse3d/layoutRules";
import { purposeMeta, type ZonePurpose } from "../../../components/warehouse3d/types";
import {
  OBJECT_DEFAULTS,
  insertFloorVertex,
  insertZoneVertex,
  moveSelection,
  patchObject,
  patchZone,
  positionOf,
  rackOutsideZone,
  removeFloorVertex,
  removeZoneVertex,
  setFloorShape,
  setZoneShape,
  toFloorFreeform,
  toFreeform,
  zoneDefaultSize,
  type EditorSelection,
  type Tool
} from "./draftOps";

/* ============================================================
   2D 탑뷰 배치 캔버스 — 단위는 m, SVG viewBox 로 확대/이동
   · 선택 도구: 클릭 선택, 끌어서 이동(0.5m 스냅), 모서리 핸들로 크기
   · 층(건물) 외곽: 아무것도 고르지 않았을 때 테두리의 꼭짓점·변을 끌어 건물 모양대로 맞춘다
   · 장소 · 층 모양 공통: 꼭짓점·변 끌기(Shift 직각), 변 가운데 + 끌기 = 꼭짓점 추가(사각형이면 자유형이 된다), 꼭짓점 더블클릭 = 삭제
   · 자유형 도구: 클릭으로 꼭짓점을 찍고 첫 점 · 더블클릭 · Enter 로 닫는다 (Shift = 직각)
   · 추가 도구: 클릭한 자리에 만든다
   · 빈 곳 끌기 = 화면 이동, Ctrl+휠 = 확대
   · 구역·랙은 임의 각도로 돌아가 있을 수 있다 — 로컬 좌표로 그리고 SVG rotate 로 돌린다
   ============================================================ */

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const pointsAttr = (points: Pt[]) => points.map((point) => `${point.x},${point.z}`).join(" ");
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/* ---------- 모양 편집 대상 — 장소(로컬 좌표, 회전) 또는 층(층 좌표 그대로) ---------- */

type ShapeTarget = { kind: "zone"; zoneId: number } | { kind: "floor"; code: string };

const zoneOf = (draft: LayoutDraft, target: ShapeTarget) => (target.kind === "zone" ? draft.zones.find((item) => item.id === target.zoneId) : undefined);
const floorOf = (draft: LayoutDraft, target: ShapeTarget) => (target.kind === "floor" ? draft.floors.find((item) => item.code === target.code) : undefined);

/** 편집 좌표계의 꼭짓점 — 장소는 로컬, 층은 층 좌표 */
const targetPoints = (draft: LayoutDraft, target: ShapeTarget): Pt[] | null => {
  const zone = zoneOf(draft, target);
  if (zone) return zoneLocalPoints(zone);
  const floor = floorOf(draft, target);
  return floor ? floorPoints(floor) : null;
};

const toTargetFrame = (draft: LayoutDraft, target: ShapeTarget, world: Pt): Pt => {
  const zone = zoneOf(draft, target);
  return zone ? worldToLocal(zone.x, zone.z, zone.rotation ?? 0, world.x, world.z) : world;
};

const targetIsFree = (draft: LayoutDraft, target: ShapeTarget) => Boolean(zoneOf(draft, target)?.shape ?? floorOf(draft, target)?.shape);

const targetToFreeform = (draft: LayoutDraft, target: ShapeTarget) =>
  target.kind === "zone" ? toFreeform(draft, target.zoneId) : toFloorFreeform(draft, target.code);

const applyTargetShape = (draft: LayoutDraft, target: ShapeTarget, points: Pt[]) =>
  target.kind === "zone" ? setZoneShape(draft, target.zoneId, points) : setFloorShape(draft, target.code, points);

const insertTargetVertex = (draft: LayoutDraft, target: ShapeTarget, edge: number, point: Pt) =>
  target.kind === "zone" ? insertZoneVertex(draft, target.zoneId, edge, point) : insertFloorVertex(draft, target.code, edge, point);

const removeTargetVertex = (draft: LayoutDraft, target: ShapeTarget, index: number) =>
  target.kind === "zone" ? removeZoneVertex(draft, target.zoneId, index) : removeFloorVertex(draft, target.code, index);

type Props = {
  draft: LayoutDraft;
  floor: string;
  selection: EditorSelection;
  tool: Tool;
  readOnly: boolean;
  snapOn: boolean;
  errorKeys: Set<string>;
  /** 장소 도구로 새로 만들 유형 — 미리보기 색 */
  newPurpose: ZonePurpose;
  onSelect: (selection: EditorSelection) => void;
  onCreate: (tool: Tool, x: number, z: number) => void;
  /** 자유형 도구로 다 그린 꼭짓점(바닥 좌표) */
  onCreatePolygon: (points: Pt[]) => void;
  /** 한 번에 끝나는 편집(꼭짓점 삭제 등) */
  onCommit: (next: LayoutDraft) => void;
  onDragStart: () => void;
  onDrag: (next: LayoutDraft) => void;
  onDragEnd: () => void;
  /** 부모가 "화면 맞춤"을 요청할 때 바꾸는 값 */
  fitKey: number;
  zoomRequest: { factor: number; nonce: number } | null;
};

type Drag =
  | { kind: "move"; selection: NonNullable<EditorSelection>; startX: number; startZ: number; originX: number; originZ: number; base: LayoutDraft; moved: boolean }
  | { kind: "resize"; selection: NonNullable<EditorSelection>; corner: Corner; fixedX: number; fixedZ: number; base: LayoutDraft; quarter: boolean; rotation: number }
  | { kind: "pan"; startPx: number; startPz: number; cx: number; cz: number }
  /** 꼭짓점 끌기 — insertAt 이 있으면 처음 움직일 때 그 변에 꼭짓점을 새로 넣고 끈다 */
  | { kind: "vertex"; target: ShapeTarget; index: number; base: LayoutDraft; started: boolean; downX: number; downY: number; insertAt?: { edge: number; point: Pt } }
  /** 변 끌기 — 변과 직각 방향으로만 움직인다 */
  | { kind: "edge"; target: ShapeTarget; index: number; base: LayoutDraft; started: boolean; startLocal: Pt; normal: Pt; downX: number; downY: number };

type Corner = "nw" | "ne" | "sw" | "se";

const MIN_SIZE: Record<string, number> = { zone: 4, DOCK_IN: 2, DOCK_OUT: 2, PILLAR: 0.3, WALL: 0.2, AISLE: 1 };

const zoneKey = (id: number) => `zone:${id}`;
const rackKey = (id: number) => `rack:${id}`;
const objectKey = (id: number) => `object:${id}`;

const objectFootprint = (object: DraftObject) => {
  const quarter = isQuarterTurn(object.rotation);
  return { width: quarter ? object.depth : object.width, depth: quarter ? object.width : object.depth, quarter };
};

/** Shift — 끄는 꼭짓점의 양옆 변이 직각(구역 축과 나란)이 되는 자리 중 가까운 쪽 */
const orthoVertex = (point: Pt, prev: Pt, next: Pt) => {
  const a = { x: prev.x, z: next.z };
  const b = { x: next.x, z: prev.z };
  return dist(point, a) <= dist(point, b) ? a : b;
};

/** Shift — 그리는 중인 점을 직전 점과 가로 · 세로로 맞춘다 */
const orthoFrom = (point: Pt, last: Pt) => (Math.abs(point.x - last.x) >= Math.abs(point.z - last.z) ? { x: point.x, z: last.z } : { x: last.x, z: point.z });

export const PlanCanvas = ({
  draft,
  floor,
  selection,
  tool,
  readOnly,
  snapOn,
  errorKeys,
  newPurpose,
  onSelect,
  onCreate,
  onCreatePolygon,
  onCommit,
  onDragStart,
  onDrag,
  onDragEnd,
  fitKey,
  zoomRequest
}: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [view, setView] = useState({ cx: 0, cz: 0, scale: 12 });
  // 포인터 이벤트가 렌더보다 먼저 연달아 올 수 있다 — 끄는 상태는 ref 로 바로 읽고, 화면용으로만 state 에 둔다
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  /** 자유형 도구로 찍은 꼭짓점 (바닥 좌표) */
  const [drawing, setDrawing] = useState<Pt[]>([]);

  const floorInfo = draft.floors.find((item) => item.code === floor) ?? null;
  const zones = useMemo(() => draft.zones.filter((zone) => zone.floor === floor), [draft.zones, floor]);
  const zoneIds = useMemo(() => new Set(zones.map((zone) => zone.id)), [zones]);
  const racks = useMemo(() => draft.racks.filter((rack) => zoneIds.has(rack.zoneId)), [draft.racks, zoneIds]);
  const objects = useMemo(() => draft.objects.filter((object) => object.floor === floor), [draft.objects, floor]);

  // 랙별 · 연별 배정된 단 수 (연 칸의 채움 농도로 보여준다)
  const boundByBay = useMemo(() => {
    const map = new Map<number, number[]>();
    Object.values(draft.bindings).forEach((placement) => {
      if (!placement) return;
      const list = map.get(placement.rackId) ?? [];
      list[placement.bay] = (list[placement.bay] ?? 0) + 1;
      map.set(placement.rackId, list);
    });
    return map;
  }, [draft.bindings]);

  /* ---------- 크기 · 화면 맞춤 ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: Math.max(el.clientWidth, 200), h: Math.max(el.clientHeight, 200) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!floorInfo) return;
    const scale = Math.min(size.w / (floorInfo.width + 6), size.h / (floorInfo.depth + 6));
    setView({ cx: 0, cz: 0, scale: Math.max(scale, 2) });
  }, [floorInfo, size.w, size.h]);

  useEffect(fit, [fitKey, floor, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!zoomRequest) return;
    setView((prev) => ({ ...prev, scale: Math.min(Math.max(prev.scale * zoomRequest.factor, 2), 80) }));
  }, [zoomRequest?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // 도구를 바꾸거나 층을 옮기면 그리던 선은 버린다
  useEffect(() => setDrawing([]), [tool, floor]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: view.cx + (clientX - rect.left - size.w / 2) / view.scale,
      z: view.cz + (clientY - rect.top - size.h / 2) / view.scale
    };
  };

  const step = snapOn ? 0.5 : 0.1;
  const px = (pixels: number) => pixels / view.scale;

  /* ---------- 자유형 그리기 ---------- */
  const finishDrawing = useCallback(
    (points: Pt[]) => {
      if (points.length < 3) return;
      setDrawing([]);
      onCreatePolygon(points);
    },
    [onCreatePolygon]
  );

  const drawPoint = (world: Pt, shift: boolean) => {
    const snapped = { x: snap(world.x, step), z: snap(world.z, step) };
    const last = drawing[drawing.length - 1];
    return shift && last ? orthoFrom(snapped, last) : snapped;
  };

  useEffect(() => {
    if (tool !== "polygon" || !drawing.length) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        finishDrawing(drawing);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setDrawing((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, drawing, finishDrawing]);

  /* ---------- 포인터 ---------- */
  const startMove = (event: React.PointerEvent, next: NonNullable<EditorSelection>) => {
    // 추가 도구일 때는 배경 처리로 넘겨 그 자리에 만든다 (구역 안에 랙 추가 등)
    if (tool !== "select") return;
    event.stopPropagation();
    onSelect(next);
    if (readOnly) return;
    const origin = positionOf(draft, next);
    if (!origin) return;
    const world = toWorld(event.clientX, event.clientY);
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({ kind: "move", selection: next, startX: world.x, startZ: world.z, originX: origin.x, originZ: origin.z, base: draft, moved: false });
  };

  const startResize = (event: React.PointerEvent, corner: Corner) => {
    event.stopPropagation();
    if (readOnly || !selection || selection.kind === "rack") return;
    const item = selection.kind === "zone"
      ? draft.zones.find((zone) => zone.id === selection.id)
      : draft.objects.find((object) => object.id === selection.id);
    if (!item) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    onDragStart();
    if (selection.kind === "zone") {
      // 구역은 돌아가 있을 수 있다 — 누른 핸들의 반대 꼭짓점을 구역 좌표계에서 구해 고정한다
      const zone = item as DraftZone;
      const rotation = zone.rotation ?? 0;
      const sx = corner.includes("w") ? -1 : 1;
      const sz = corner.startsWith("n") ? -1 : 1;
      const fixed = localToWorld(zone.x, zone.z, rotation, (-sx * zone.width) / 2, (-sz * zone.depth) / 2);
      setDrag({ kind: "resize", selection, corner, fixedX: fixed.x, fixedZ: fixed.z, base: draft, quarter: false, rotation });
      return;
    }
    const quarter = objectFootprint(item as DraftObject).quarter;
    const width = quarter ? (item as DraftObject).depth : item.width;
    const depth = quarter ? item.width : item.depth;
    const fixedX = corner.includes("w") ? item.x + width / 2 : item.x - width / 2;
    const fixedZ = corner.startsWith("n") ? item.z + depth / 2 : item.z - depth / 2;
    setDrag({ kind: "resize", selection, corner, fixedX, fixedZ, base: draft, quarter, rotation: 0 });
  };

  const startVertex = (event: React.PointerEvent, target: ShapeTarget, index: number, insertAt?: { edge: number; point: Pt }) => {
    event.stopPropagation();
    if (readOnly) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({ kind: "vertex", target, index, base: draft, started: false, downX: event.clientX, downY: event.clientY, insertAt });
  };

  const startEdge = (event: React.PointerEvent, target: ShapeTarget, index: number) => {
    event.stopPropagation();
    if (readOnly) return;
    const local = targetPoints(draft, target);
    if (!local) return;
    const a = local[index];
    const b = local[(index + 1) % local.length];
    const len = dist(a, b);
    if (len < 1e-6) return;
    const world = toWorld(event.clientX, event.clientY);
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({
      kind: "edge",
      target,
      index,
      base: draft,
      started: false,
      startLocal: toTargetFrame(draft, target, world),
      normal: { x: -(b.z - a.z) / len, z: (b.x - a.x) / len },
      downX: event.clientX,
      downY: event.clientY
    });
  };

  const onBackgroundDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    const world = toWorld(event.clientX, event.clientY);
    if (tool === "polygon" && event.button === 0) {
      if (readOnly) return;
      const point = drawPoint(world, event.shiftKey);
      // 첫 점 가까이를 누르면 닫는다
      if (drawing.length >= 3 && dist(point, drawing[0]) <= Math.max(px(10), step)) {
        finishDrawing(drawing);
        return;
      }
      const last = drawing[drawing.length - 1];
      if (!last || dist(point, last) > 1e-6) setDrawing([...drawing, point]);
      return;
    }
    if (tool !== "select" && event.button === 0) {
      if (!readOnly) onCreate(tool, snap(world.x, step), snap(world.z, step));
      return;
    }
    onSelect(null);
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({ kind: "pan", startPx: event.clientX, startPz: event.clientY, cx: view.cx, cz: view.cz });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const world = toWorld(event.clientX, event.clientY);
    if (tool === "polygon") setGhost(drawPoint(world, event.shiftKey));
    else if (tool !== "select") setGhost({ x: snap(world.x, step), z: snap(world.z, step) });
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === "pan") {
      setView((prev) => ({
        ...prev,
        cx: drag.cx - (event.clientX - drag.startPx) / prev.scale,
        cz: drag.cz - (event.clientY - drag.startPz) / prev.scale
      }));
      return;
    }

    if (drag.kind === "move") {
      const x = snap(drag.originX + (world.x - drag.startX), step);
      const z = snap(drag.originZ + (world.z - drag.startZ), step);
      if (!drag.moved) {
        if (Math.abs(x - drag.originX) < step / 2 && Math.abs(z - drag.originZ) < step / 2) return;
        onDragStart();
        setDrag({ ...drag, moved: true });
      }
      onDrag(moveSelection(drag.base, drag.selection, x, z));
      return;
    }

    if (drag.kind === "vertex") {
      let current = drag;
      if (!drag.started) {
        if (Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) < 3) return;
        onDragStart();
        // 사각형이면 먼저 자유형으로 — 네 모서리가 꼭짓점이 된다
        let base = targetIsFree(drag.base, drag.target) ? drag.base : targetToFreeform(drag.base, drag.target);
        let index = drag.index;
        if (drag.insertAt) {
          const inserted = insertTargetVertex(base, drag.target, drag.insertAt.edge, drag.insertAt.point);
          base = inserted.draft;
          index = inserted.index;
        }
        current = { ...drag, base, index, started: true, insertAt: undefined };
        setDrag(current);
      }
      const local = targetPoints(current.base, current.target);
      if (!local) return;
      const snapped = { x: snap(world.x, step), z: snap(world.z, step) };
      let point = toTargetFrame(current.base, current.target, snapped);
      if (event.shiftKey) {
        const n = local.length;
        point = orthoVertex(point, local[(current.index - 1 + n) % n], local[(current.index + 1) % n]);
      }
      local[current.index] = { x: round3(point.x), z: round3(point.z) };
      onDrag(applyTargetShape(current.base, current.target, local));
      return;
    }

    if (drag.kind === "edge") {
      let current = drag;
      if (!drag.started) {
        if (Math.hypot(event.clientX - drag.downX, event.clientY - drag.downY) < 3) return;
        onDragStart();
        const base = targetIsFree(drag.base, drag.target) ? drag.base : targetToFreeform(drag.base, drag.target);
        current = { ...drag, base, started: true };
        setDrag(current);
      }
      const local = targetPoints(current.base, current.target);
      if (!local) return;
      // 자유형으로 바꿔도 중심 · 원점이 같으니 startLocal 을 그대로 쓴다
      const now = toTargetFrame(current.base, current.target, world);
      const amount = snap((now.x - current.startLocal.x) * current.normal.x + (now.z - current.startLocal.z) * current.normal.z, step);
      const i = current.index;
      const j = (i + 1) % local.length;
      local[i] = { x: round3(local[i].x + current.normal.x * amount), z: round3(local[i].z + current.normal.z * amount) };
      local[j] = { x: round3(local[j].x + current.normal.x * amount), z: round3(local[j].z + current.normal.z * amount) };
      onDrag(applyTargetShape(current.base, current.target, local));
      return;
    }

    // 크기 조절 — 반대편 모서리를 고정한다
    const minKey = drag.selection.kind === "zone" ? "zone" : draft.objects.find((object) => object.id === drag.selection.id)?.kind ?? "WALL";
    const min = MIN_SIZE[minKey] ?? 0.5;
    if (drag.selection.kind === "zone") {
      // 커서를 구역 좌표계(고정 꼭짓점 원점, 회전 전)로 옮겨 가로·세로를 잰다
      const sx = drag.corner.includes("w") ? -1 : 1;
      const sz = drag.corner.startsWith("n") ? -1 : 1;
      const local = worldToLocal(drag.fixedX, drag.fixedZ, drag.rotation, world.x, world.z);
      const width = Math.max(snap(local.x * sx, step), min);
      const depth = Math.max(snap(local.z * sz, step), min);
      const center = localToWorld(drag.fixedX, drag.fixedZ, drag.rotation, (sx * width) / 2, (sz * depth) / 2);
      // 크기만 바꾸고 안의 랙은 제자리에 둔다 — patchZone 에 x/z 를 넘기면 랙까지 따라 움직인다
      const resized = patchZone(drag.base, drag.selection.id, { width, depth });
      const zone = resized.zones.find((item) => item.id === drag.selection.id);
      if (zone) {
        zone.x = round3(center.x);
        zone.z = round3(center.z);
      }
      onDrag(resized);
      return;
    }
    const pxv = snap(world.x, step);
    const pzv = snap(world.z, step);
    const width = Math.max(Math.abs(pxv - drag.fixedX), min);
    const depth = Math.max(Math.abs(pzv - drag.fixedZ), min);
    const cx = drag.fixedX + (drag.corner.includes("w") ? -width / 2 : width / 2);
    const cz = drag.fixedZ + (drag.corner.startsWith("n") ? -depth / 2 : depth / 2);
    onDrag(
      patchObject(drag.base, drag.selection.id, drag.quarter ? { width: depth, depth: width, x: cx, z: cz } : { width, depth, x: cx, z: cz })
    );
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    if (drag.kind === "resize" || (drag.kind === "move" && drag.moved) || ((drag.kind === "vertex" || drag.kind === "edge") && drag.started)) onDragEnd();
    setDrag(null);
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (tool === "polygon" && drawing.length >= 3) {
      event.preventDefault();
      finishDrawing(drawing);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const world = toWorld(event.clientX, event.clientY);
    setView((prev) => {
      const scale = Math.min(Math.max(prev.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), 2), 80);
      // 포인터 아래 지점이 제자리에 있도록 중심을 옮긴다
      return {
        scale,
        cx: world.x - (world.x - prev.cx) * (prev.scale / scale),
        cz: world.z - (world.z - prev.cz) * (prev.scale / scale)
      };
    });
  };

  // React 의 onWheel 은 passive 라 preventDefault 가 안 먹는다 — 직접 붙인다
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const block = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    svg.addEventListener("wheel", block, { passive: false });
    return () => svg.removeEventListener("wheel", block);
  }, []);

  /* ---------- 그리기 ---------- */
  const vbW = size.w / view.scale;
  const vbH = size.h / view.scale;
  const viewBox = `${view.cx - vbW / 2} ${view.cz - vbH / 2} ${vbW} ${vbH}`;
  const showRackText = view.scale >= 9;

  const selectedZone = selection?.kind === "zone" ? zones.find((item) => item.id === selection.id) ?? null : null;
  const floorOutline = floorInfo ? floorPoints(floorInfo) : null;
  const floorTarget: ShapeTarget | null = floorInfo ? { kind: "floor", code: floorInfo.code } : null;
  // 되돌리기로 사라진 대상을 가리키는 선택은 없는 것으로 본다
  const hasSelection = Boolean(
    selection &&
      (selection.kind === "zone"
        ? zones.some((item) => item.id === selection.id)
        : selection.kind === "rack"
          ? racks.some((item) => item.id === selection.id)
          : objects.some((item) => item.id === selection.id))
  );
  /** 아무것도 고르지 않았으면 층(건물) 테두리를 편집할 수 있다 */
  const floorEditable = Boolean(floorOutline && floorTarget && !readOnly && tool === "select" && !hasSelection);

  /** 선택한 랙 · 시설물의 모양 — width·depth 는 돌리기 전 치수, rotation 으로 돌린다 (시설물은 90° 단위라 치수를 바꿔 0°로) */
  const selectedFootprint = (() => {
    if (!selection || selection.kind === "zone") return null;
    if (selection.kind === "rack") {
      const rack = racks.find((item) => item.id === selection.id);
      return rack ? { x: rack.x, z: rack.z, width: rackLength(rack), depth: rack.depth, rotation: rack.rotation ?? 0, resizable: false } : null;
    }
    const object = objects.find((item) => item.id === selection.id);
    return object
      ? { x: object.x, z: object.z, width: objectFootprint(object).width, depth: objectFootprint(object).depth, rotation: 0, resizable: true }
      : null;
  })();

  const ghostSize = (() => {
    if (tool === "select" || tool === "polygon" || !ghost) return null;
    if (tool === "zone") return zoneDefaultSize(newPurpose);
    if (tool === "rack") return rackFootprint({ x: 0, z: 0, rotation: 0, bays: 4, levels: 4, bayWidth: 2.4, depth: 1.6, levelHeight: 1.5 });
    return { width: OBJECT_DEFAULTS[tool].width, depth: OBJECT_DEFAULTS[tool].depth };
  })();

  const cursor = drag?.kind === "pan" ? "grabbing" : tool !== "select" ? "crosshair" : "default";

  const tag = (x: number, y: number, label: string) => {
    const tagW = px(label.length * 6.1 + 14);
    const tagH = px(19);
    return (
      <g pointerEvents="none">
        <rect x={x - tagW / 2} y={y} width={tagW} height={tagH} rx={px(4)} className="pc-tag" />
        <text x={x} y={y + tagH / 2 + px(4)} className="pc-dim is-strong" fontSize={px(11)} textAnchor="middle">
          {label}
        </text>
      </g>
    );
  };

  /** 모양 편집 핸들 — 변(끌기) · 변 가운데 +(꼭짓점 추가) · 꼭짓점(끌기 · 더블클릭 삭제). world 는 화면에 그릴 바닥 좌표 */
  const edgeHandles = (target: ShapeTarget, world: Pt[], keyPrefix: string, hint: string) =>
    world.map((a, idx) => {
      const b = world[(idx + 1) % world.length];
      return (
        <line
          key={`${keyPrefix}-edge-${idx}`}
          x1={a.x}
          y1={a.z}
          x2={b.x}
          y2={b.z}
          className="pc-edge-hit"
          strokeWidth={px(10)}
          onPointerDown={(event) => startEdge(event, target, idx)}
        >
          <title>{hint}</title>
        </line>
      );
    });

  const pointHandles = (target: ShapeTarget, world: Pt[], local: Pt[], free: boolean, keyPrefix: string, what: string) => (
    <>
      {world.map((a, idx) => {
        const b = world[(idx + 1) % world.length];
        if (dist(a, b) < px(34)) return null;
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const localMid = { x: (local[idx].x + local[(idx + 1) % local.length].x) / 2, z: (local[idx].z + local[(idx + 1) % local.length].z) / 2 };
        const r = px(6);
        return (
          <g key={`${keyPrefix}-mid-${idx}`} className="pc-mid" onPointerDown={(event) => startVertex(event, target, idx + 1, { edge: idx, point: localMid })}>
            <circle cx={mid.x} cy={mid.z} r={r} vectorEffect="non-scaling-stroke" />
            <path d={`M ${mid.x - r * 0.5} ${mid.z} L ${mid.x + r * 0.5} ${mid.z} M ${mid.x} ${mid.z - r * 0.5} L ${mid.x} ${mid.z + r * 0.5}`} vectorEffect="non-scaling-stroke" />
            <title>끌어서 {what} 꼭짓점 추가{free ? "" : " — 자유형으로 바뀝니다"}</title>
          </g>
        );
      })}
      {world.map((point, idx) => (
        <circle
          key={`${keyPrefix}-vertex-${idx}`}
          cx={point.x}
          cy={point.z}
          r={px(5.5)}
          className={`pc-vertex${target.kind === "floor" ? " is-floor" : ""}`}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => startVertex(event, target, idx)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (free && world.length > 3) onCommit(removeTargetVertex(draft, target, idx));
          }}
        >
          <title>
            끌어서 {what} 꼭짓점 옮기기 · Shift 직각{free ? ` · 더블클릭 삭제${world.length <= 3 ? " (꼭짓점은 3개 이상)" : ""}` : " — 자유형으로 바뀝니다"}
          </title>
        </circle>
      ))}
    </>
  );

  const nearFirst = tool === "polygon" && drawing.length >= 3 && ghost != null && dist(ghost, drawing[0]) <= Math.max(px(10), step);

  return (
    <div className="pc-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="pc-svg"
        width={size.w}
        height={size.h}
        viewBox={viewBox}
        style={{ cursor }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onPointerLeave={() => setGhost(null)}
        onWheel={onWheel}
        role="application"
        aria-label={`${floor} 배치 평면도`}
      >
        <defs>
          <pattern id="pc-grid-1" width="1" height="1" patternUnits="userSpaceOnUse" x="0" y="0">
            <path d="M 1 0 L 0 0 0 1" className="pc-grid-minor" vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="pc-grid-5" width="5" height="5" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect width="5" height="5" fill={view.scale >= 6 ? "url(#pc-grid-1)" : "none"} />
            <path d="M 5 0 L 0 0 0 5" className="pc-grid-major" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>

        {/* 층(건물) — 자유형이면 꼭짓점 모양 그대로 */}
        {floorInfo && floorOutline ? (
          (() => {
            const box = polygonBounds(floorOutline);
            const free = Boolean(floorInfo.shape);
            const label = free
              ? `${floor} · 건물 외곽 ${round3(box.maxX - box.minX)} × ${round3(box.maxZ - box.minZ)} m · 면적 ${Math.round(polygonArea(floorOutline)).toLocaleString()} m² · 꼭짓점 ${floorOutline.length}`
              : `${floor} · ${floorInfo.width} × ${floorInfo.depth} m`;
            return (
              <g>
                <polygon
                  points={pointsAttr(floorOutline)}
                  className={`pc-floor${errorKeys.has(`floor:${floor}`) ? " is-error" : ""}${floorEditable ? " is-editable" : ""}`}
                  vectorEffect="non-scaling-stroke"
                />
                <polygon points={pointsAttr(floorOutline)} fill="url(#pc-grid-5)" pointerEvents="none" />
                <text x={box.minX} y={box.minZ - px(8)} className="pc-dim" fontSize={px(11)}>
                  {label}
                </text>
                {/* 층 테두리 변 — 장소보다 아래에 깔아 장소 선택을 가리지 않는다 */}
                {floorEditable && floorTarget ? edgeHandles(floorTarget, floorOutline, "floor", "끌어서 건물 외곽의 이 변을 안팎으로 옮기기") : null}
              </g>
            );
          })()
        ) : null}

        {/* 장소 — 중심으로 옮긴 뒤 돌린 로컬 좌표로 그린다. 자유형은 꼭짓점 그대로 */}
        {zones.map((zone: DraftZone) => {
          const box = polygonBounds(zoneWorldPoints(zone));
          const meta = purposeMeta(zone.purpose);
          return (
            <g key={zone.id} onPointerDown={(event) => startMove(event, { kind: "zone", id: zone.id })}>
              <polygon
                points={pointsAttr(zoneLocalPoints(zone))}
                transform={`translate(${zone.x} ${zone.z}) rotate(${zone.rotation ?? 0})`}
                className={`pc-zone is-${zone.purpose}${errorKeys.has(zoneKey(zone.id)) ? " is-error" : ""}`}
                vectorEffect="non-scaling-stroke"
              />
              {/* 이름은 장소(외곽) 바로 위 — 안에 두면 첫 랙과 겹친다 */}
              <text x={box.minX + px(2)} y={box.minZ - px(5)} className="pc-zone-label" fontSize={px(12)}>
                {zone.name}
                <tspan className="pc-zone-code" fontSize={px(10)} dx={px(6)}>
                  {zone.code}
                  {meta.racks ? "" : ` · ${meta.label}`}
                  {zone.rotation ? ` · ${zone.rotation}°` : ""}
                </tspan>
              </text>
            </g>
          );
        })}

        {/* 랙 — 연은 로컬 +x 로 늘어선다 */}
        {racks.map((rack: DraftRack) => {
          const length = rackLength(rack);
          const outside = rackOutsideZone(draft, rack);
          const bound = boundByBay.get(rack.id) ?? [];
          const firstAlong = -length / 2 + rack.bayWidth / 2;
          return (
            <g key={rack.id} onPointerDown={(event) => startMove(event, { kind: "rack", id: rack.id })}>
              <g transform={`translate(${rack.x} ${rack.z}) rotate(${rack.rotation ?? 0})`}>
                <rect
                  x={-length / 2}
                  y={-rack.depth / 2}
                  width={length}
                  height={rack.depth}
                  className={`pc-rack${errorKeys.has(rackKey(rack.id)) || outside ? " is-error" : ""}`}
                  vectorEffect="non-scaling-stroke"
                />
                {Array.from({ length: rack.bays }, (_, idx) => {
                  const along = firstAlong + idx * (rack.bayWidth + BAY_GAP);
                  const ratio = Math.min((bound[idx + 1] ?? 0) / rack.levels, 1);
                  return (
                    <rect
                      key={idx}
                      x={along - rack.bayWidth / 2 + 0.08}
                      y={-rack.depth / 2 + 0.08}
                      width={Math.max(rack.bayWidth - 0.16, 0.05)}
                      height={Math.max(rack.depth - 0.16, 0.05)}
                      className="pc-bay"
                      style={{ fillOpacity: 0.12 + ratio * 0.6 }}
                    />
                  );
                })}
                {/* 1연 쪽 표시 — 연 번호가 어느 끝에서 시작하는지 */}
                <circle cx={firstAlong} cy={0} r={Math.min(rack.depth, rack.bayWidth) * 0.18} className="pc-rack-start" />
              </g>
              {showRackText ? (
                <text x={rack.x} y={rack.z + px(4)} className="pc-rack-code" fontSize={px(10)} strokeWidth={px(3)} textAnchor="middle">
                  {rack.code}
                </text>
              ) : null}
              <title>
                {rack.code} · {rack.bays}연 × {rack.levels}단 · 연 사이 {BAY_GAP}m
              </title>
            </g>
          );
        })}

        {/* 시설물 */}
        {objects.map((object) => {
          const foot = objectFootprint(object);
          return (
            <g key={object.id} onPointerDown={(event) => startMove(event, { kind: "object", id: object.id })}>
              <rect
                x={object.x - foot.width / 2}
                y={object.z - foot.depth / 2}
                width={foot.width}
                height={foot.depth}
                className={`pc-object is-${object.kind}${errorKeys.has(objectKey(object.id)) ? " is-error" : ""}`}
                vectorEffect="non-scaling-stroke"
              />
              {object.label && view.scale >= 6 ? (
                <text x={object.x} y={object.z + px(4)} className="pc-object-label" fontSize={px(10)} textAnchor="middle">
                  {object.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* 층 테두리 꼭짓점 · 변 가운데 + — 아무것도 고르지 않았을 때 */}
        {floorEditable && floorTarget && floorOutline && floorInfo
          ? pointHandles(floorTarget, floorOutline, floorOutline, Boolean(floorInfo.shape), "floor", "건물 외곽")
          : null}

        {/* 선택한 장소 — 외곽 · 치수 · 모양 핸들 */}
        {selectedZone
          ? (() => {
              const zone = selectedZone;
              const world = zoneWorldPoints(zone);
              const box = polygonBounds(world);
              const area = Math.round(polygonArea(world) * 10) / 10;
              const free = Boolean(zone.shape);
              const target: ShapeTarget = { kind: "zone", zoneId: zone.id };
              const label = free
                ? `외곽 ${round3(zone.width)} × ${round3(zone.depth)} m · 면적 ${area} m² · 꼭짓점 ${world.length}`
                : `${round3(zone.width)} × ${round3(zone.depth)} m · 면적 ${area} m² · 중심 (${Math.round(zone.x * 100) / 100}, ${Math.round(zone.z * 100) / 100})${zone.rotation ? ` · ${zone.rotation}°` : ""}`;
              const editable = !readOnly && tool === "select";
              return (
                <g>
                  <polygon points={pointsAttr(world)} className="pc-select" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  {tag((box.minX + box.maxX) / 2, box.maxZ + px(8), label)}
                  {editable && free ? edgeHandles(target, world, "zone", "끌어서 이 변을 안팎으로 옮기기") : null}
                  {editable && free ? pointHandles(target, world, zoneLocalPoints(zone), true, "zone", "장소") : null}
                  {editable && !free ? (
                    <>
                      {/* 사각형 — 모서리는 크기 조절, 변 가운데 + 는 자유형으로 */}
                      {world.map((a, idx) => {
                        const b = world[(idx + 1) % world.length];
                        if (dist(a, b) < px(34)) return null;
                        const local = zoneLocalPoints(zone);
                        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
                        const localMid = { x: (local[idx].x + local[(idx + 1) % 4].x) / 2, z: (local[idx].z + local[(idx + 1) % 4].z) / 2 };
                        const r = px(6);
                        return (
                          <g key={`zone-mid-${idx}`} className="pc-mid" onPointerDown={(event) => startVertex(event, target, idx + 1, { edge: idx, point: localMid })}>
                            <circle cx={mid.x} cy={mid.z} r={r} vectorEffect="non-scaling-stroke" />
                            <path d={`M ${mid.x - r * 0.5} ${mid.z} L ${mid.x + r * 0.5} ${mid.z} M ${mid.x} ${mid.z - r * 0.5} L ${mid.x} ${mid.z + r * 0.5}`} vectorEffect="non-scaling-stroke" />
                            <title>끌어서 꼭짓점 추가 — 자유형으로 바뀝니다</title>
                          </g>
                        );
                      })}
                      {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => {
                        // 돌린 구역이면 핸들도 돌린 꼭짓점에
                        const handle = localToWorld(
                          zone.x,
                          zone.z,
                          zone.rotation ?? 0,
                          ((corner.includes("w") ? -1 : 1) * zone.width) / 2,
                          ((corner.startsWith("n") ? -1 : 1) * zone.depth) / 2
                        );
                        return (
                          <rect
                            key={corner}
                            x={handle.x - px(5)}
                            y={handle.z - px(5)}
                            width={px(10)}
                            height={px(10)}
                            className={`pc-handle is-${corner}`}
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) => startResize(event, corner)}
                          />
                        );
                      })}
                    </>
                  ) : null}
                </g>
              );
            })()
          : null}

        {/* 선택한 랙 · 시설물 — 치수 · 핸들 */}
        {selectedFootprint ? (
          <g pointerEvents="none">
            <rect
              x={-selectedFootprint.width / 2 - px(3)}
              y={-selectedFootprint.depth / 2 - px(3)}
              width={selectedFootprint.width + px(6)}
              height={selectedFootprint.depth + px(6)}
              transform={`translate(${selectedFootprint.x} ${selectedFootprint.z}) rotate(${selectedFootprint.rotation})`}
              className="pc-select"
              vectorEffect="non-scaling-stroke"
            />
            {(() => {
              // 치수 태그 — 배경을 깔아 아래 도형과 겹쳐도 읽히게 한다. 돌렸으면 외접 사각형 아래에
              const bounds = boundsOf(selectedFootprint);
              const label = `${Math.round(selectedFootprint.width * 100) / 100} × ${Math.round(selectedFootprint.depth * 100) / 100} m · 중심 (${Math.round(selectedFootprint.x * 100) / 100}, ${Math.round(selectedFootprint.z * 100) / 100})${selectedFootprint.rotation ? ` · ${selectedFootprint.rotation}°` : ""}`;
              return tag(selectedFootprint.x, selectedFootprint.z + bounds.depth / 2 + px(8), label);
            })()}
          </g>
        ) : null}
        {selectedFootprint?.resizable && !readOnly && tool === "select"
          ? (["nw", "ne", "sw", "se"] as Corner[]).map((corner) => {
              const handle = localToWorld(
                selectedFootprint.x,
                selectedFootprint.z,
                selectedFootprint.rotation,
                ((corner.includes("w") ? -1 : 1) * selectedFootprint.width) / 2,
                ((corner.startsWith("n") ? -1 : 1) * selectedFootprint.depth) / 2
              );
              return (
                <rect
                  key={corner}
                  x={handle.x - px(5)}
                  y={handle.z - px(5)}
                  width={px(10)}
                  height={px(10)}
                  className={`pc-handle is-${corner}`}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(event) => startResize(event, corner)}
                />
              );
            })
          : null}

        {/* 자유형 그리기 미리보기 */}
        {tool === "polygon" && drawing.length ? (
          <g pointerEvents="none">
            {drawing.length >= 2 ? (
              <polygon points={pointsAttr(ghost && !nearFirst ? [...drawing, ghost] : drawing)} className={`pc-draw-fill is-${newPurpose}`} />
            ) : null}
            <polyline points={pointsAttr(ghost && !nearFirst ? [...drawing, ghost] : drawing)} className="pc-draw-line" vectorEffect="non-scaling-stroke" />
            {drawing.map((point, idx) => (
              <circle
                key={idx}
                cx={point.x}
                cy={point.z}
                r={px(idx === 0 ? (nearFirst ? 8 : 6) : 4)}
                className={`pc-draw-point${idx === 0 ? " is-first" : ""}${idx === 0 && nearFirst ? " is-near" : ""}`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {ghost && drawing.length
              ? tag(
                  ghost.x,
                  ghost.z + px(12),
                  nearFirst
                    ? `닫기 · 면적 ${Math.round(polygonArea(drawing) * 10) / 10} m²`
                    : `${Math.round(dist(drawing[drawing.length - 1], ghost) * 100) / 100} m · 꼭짓점 ${drawing.length}`
                )
              : null}
          </g>
        ) : null}

        {/* 추가 도구 미리보기 */}
        {ghost && ghostSize ? (
          <rect
            x={ghost.x - ghostSize.width / 2}
            y={ghost.z - ghostSize.depth / 2}
            width={ghostSize.width}
            height={ghostSize.depth}
            className={`pc-ghost${tool === "zone" ? ` is-${newPurpose}` : ""}`}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
        {ghost && tool === "polygon" && !drawing.length ? (
          <circle cx={ghost.x} cy={ghost.z} r={px(4)} className="pc-draw-point is-first" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ) : null}
      </svg>

      <div className="pc-scale">
        <i style={{ width: 5 * view.scale }} />
        <span>5 m</span>
      </div>
    </div>
  );
};
