import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BAY_GAP,
  boundsOf,
  isQuarterTurn,
  localToWorld,
  rackFootprint,
  rackLength,
  snap,
  worldToLocal
} from "../../../components/warehouse3d/geometry";
import type { DraftObject, DraftRack, DraftZone, LayoutDraft } from "../../../components/warehouse3d/layoutRules";
import {
  OBJECT_DEFAULTS,
  moveSelection,
  patchObject,
  patchZone,
  positionOf,
  rackOutsideZone,
  type EditorSelection,
  type Tool
} from "./draftOps";

/* ============================================================
   2D 탑뷰 배치 캔버스 — 단위는 m, SVG viewBox 로 확대/이동
   · 선택 도구: 클릭 선택, 끌어서 이동(0.5m 스냅), 모서리 핸들로 크기
   · 추가 도구: 클릭한 자리에 만든다
   · 빈 곳 끌기 = 화면 이동, Ctrl+휠 = 확대
   · 구역·랙은 임의 각도로 돌아가 있을 수 있다 — 로컬 좌표로 그리고 SVG rotate 로 돌린다
   ============================================================ */

const round3 = (value: number) => Math.round(value * 1000) / 1000;

type Props = {
  draft: LayoutDraft;
  floor: string;
  selection: EditorSelection;
  tool: Tool;
  readOnly: boolean;
  snapOn: boolean;
  errorKeys: Set<string>;
  onSelect: (selection: EditorSelection) => void;
  onCreate: (tool: Tool, x: number, z: number) => void;
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
  | { kind: "pan"; startPx: number; startPz: number; cx: number; cz: number };

type Corner = "nw" | "ne" | "sw" | "se";

const MIN_SIZE: Record<string, number> = { zone: 4, DOCK_IN: 2, DOCK_OUT: 2, PILLAR: 0.3, WALL: 0.2, AISLE: 1 };

const zoneKey = (id: number) => `zone:${id}`;
const rackKey = (id: number) => `rack:${id}`;
const objectKey = (id: number) => `object:${id}`;

const objectFootprint = (object: DraftObject) => {
  const quarter = isQuarterTurn(object.rotation);
  return { width: quarter ? object.depth : object.width, depth: quarter ? object.width : object.depth, quarter };
};

export const PlanCanvas = ({
  draft,
  floor,
  selection,
  tool,
  readOnly,
  snapOn,
  errorKeys,
  onSelect,
  onCreate,
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);

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

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: view.cx + (clientX - rect.left - size.w / 2) / view.scale,
      z: view.cz + (clientY - rect.top - size.h / 2) / view.scale
    };
  };

  const step = snapOn ? 0.5 : 0.1;

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

  const onBackgroundDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    const world = toWorld(event.clientX, event.clientY);
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
    if (tool !== "select") setGhost({ x: snap(world.x, step), z: snap(world.z, step) });
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
    const px = snap(world.x, step);
    const pz = snap(world.z, step);
    const width = Math.max(Math.abs(px - drag.fixedX), min);
    const depth = Math.max(Math.abs(pz - drag.fixedZ), min);
    const cx = drag.fixedX + (drag.corner.includes("w") ? -width / 2 : width / 2);
    const cz = drag.fixedZ + (drag.corner.startsWith("n") ? -depth / 2 : depth / 2);
    onDrag(
      patchObject(drag.base, drag.selection.id, drag.quarter ? { width: depth, depth: width, x: cx, z: cz } : { width, depth, x: cx, z: cz })
    );
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!drag) return;
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    if (drag.kind === "resize" || (drag.kind === "move" && drag.moved)) onDragEnd();
    setDrag(null);
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
  const px = (pixels: number) => pixels / view.scale;
  const showRackText = view.scale >= 9;

  /** 선택한 것의 모양 — width·depth 는 돌리기 전 치수, rotation 으로 돌린다 (시설물은 90° 단위라 치수를 바꿔 0°로) */
  const selectedFootprint = (() => {
    if (!selection) return null;
    if (selection.kind === "zone") {
      const zone = zones.find((item) => item.id === selection.id);
      return zone ? { x: zone.x, z: zone.z, width: zone.width, depth: zone.depth, rotation: zone.rotation ?? 0, resizable: true } : null;
    }
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
    if (tool === "select" || !ghost) return null;
    if (tool === "zone") return { width: 14, depth: 10 };
    if (tool === "rack") return rackFootprint({ x: 0, z: 0, rotation: 0, bays: 4, levels: 4, bayWidth: 2.4, depth: 1.6, levelHeight: 1.5 });
    return { width: OBJECT_DEFAULTS[tool].width, depth: OBJECT_DEFAULTS[tool].depth };
  })();

  const cursor = drag?.kind === "pan" ? "grabbing" : tool !== "select" ? "crosshair" : "default";

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

        {floorInfo ? (
          <g>
            <rect
              x={-floorInfo.width / 2}
              y={-floorInfo.depth / 2}
              width={floorInfo.width}
              height={floorInfo.depth}
              className={`pc-floor${errorKeys.has(`floor:${floor}`) ? " is-error" : ""}`}
              vectorEffect="non-scaling-stroke"
            />
            <rect x={-floorInfo.width / 2} y={-floorInfo.depth / 2} width={floorInfo.width} height={floorInfo.depth} fill="url(#pc-grid-5)" pointerEvents="none" />
            <text x={-floorInfo.width / 2} y={-floorInfo.depth / 2 - px(8)} className="pc-dim" fontSize={px(11)}>
              {floor} · {floorInfo.width} × {floorInfo.depth} m
            </text>
          </g>
        ) : null}

        {/* 구역 — 중심으로 옮긴 뒤 돌린 로컬 좌표로 그린다 */}
        {zones.map((zone: DraftZone) => {
          const bounds = boundsOf(zone);
          return (
            <g key={zone.id} onPointerDown={(event) => startMove(event, { kind: "zone", id: zone.id })}>
              <rect
                x={-zone.width / 2}
                y={-zone.depth / 2}
                width={zone.width}
                height={zone.depth}
                transform={`translate(${zone.x} ${zone.z}) rotate(${zone.rotation ?? 0})`}
                className={`pc-zone is-${zone.purpose}${errorKeys.has(zoneKey(zone.id)) ? " is-error" : ""}`}
                vectorEffect="non-scaling-stroke"
              />
              {/* 이름은 구역(돌렸으면 외접 사각형) 바로 위 — 안에 두면 첫 랙과 겹친다 */}
              <text x={zone.x - bounds.width / 2 + px(2)} y={zone.z - bounds.depth / 2 - px(5)} className="pc-zone-label" fontSize={px(12)}>
                {zone.name}
                <tspan className="pc-zone-code" fontSize={px(10)} dx={px(6)}>
                  {zone.code}
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
                <text x={rack.x} y={rack.z + px(4)} className="pc-rack-code" fontSize={px(10)} textAnchor="middle">
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

        {/* 선택 표시 · 치수 · 핸들 */}
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
              const tagW = px(label.length * 6.1 + 14);
              const tagH = px(19);
              const tagY = selectedFootprint.z + bounds.depth / 2 + px(8);
              return (
                <g>
                  <rect x={selectedFootprint.x - tagW / 2} y={tagY} width={tagW} height={tagH} rx={px(4)} className="pc-tag" />
                  <text x={selectedFootprint.x} y={tagY + tagH / 2 + px(4)} className="pc-dim is-strong" fontSize={px(11)} textAnchor="middle">
                    {label}
                  </text>
                </g>
              );
            })()}
          </g>
        ) : null}
        {selectedFootprint?.resizable && !readOnly && tool === "select"
          ? (["nw", "ne", "sw", "se"] as Corner[]).map((corner) => {
              // 돌린 구역이면 핸들도 돌린 꼭짓점에
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

        {/* 추가 도구 미리보기 */}
        {ghost && ghostSize ? (
          <rect
            x={ghost.x - ghostSize.width / 2}
            y={ghost.z - ghostSize.depth / 2}
            width={ghostSize.width}
            height={ghostSize.depth}
            className="pc-ghost"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
      </svg>

      <div className="pc-scale">
        <i style={{ width: 5 * view.scale }} />
        <span>5 m</span>
      </div>
    </div>
  );
};
