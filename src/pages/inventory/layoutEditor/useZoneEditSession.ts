import { useCallback, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../../services/http";
import { normalizeDeg, polygonInside, polygonsOverlap, rectPoints, stepRotation } from "../../../components/warehouse3d/geometry";
import { floorPolygon, objectRect, zonePolygon, type LayoutDraft } from "../../../components/warehouse3d/layoutRules";
import type { WarehouseLayout } from "../../../components/warehouse3d/types";
import type { WarehouseMapState } from "../../../components/warehouse3d/useWarehouseMap";
import { OBJECT_DEFAULTS, buildPreviewLayout, patchZone, summarizeChanges, type DraftResponse, type EditorLocation } from "./draftOps";

/* ============================================================
   3D 맵 위에서 바로 하는 구역 배치 편집 — 옮기기 · 돌리기
   · 지금 게시된 배치에서 출발한다 (배치 탭의 저장된 초안과 섞지 않는다)
   · 바꾼 결과는 이 세션에만 쌓이고 [저장]하면 게시된다
   ============================================================ */

type Notice = { tone: "success" | "danger" | "info" | "warning"; text: string } | null;

/** 버튼·단축키 한 번에 돌리는 각도 */
export const ZONE_ROTATE_STEP = 45;

export const useZoneEditSession = (map: WarehouseMapState, operator: string) => {
  const [active, setActive] = useState(false);
  const [entering, setEntering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState<LayoutDraft | null>(null);
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [past, setPast] = useState<LayoutDraft[]>([]);
  const [locations, setLocations] = useState<EditorLocation[]>([]);
  const [otherDraftExists, setOtherDraftExists] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const enter = useCallback(async () => {
    if (!map.layout || entering) return;
    setEntering(true);
    try {
      const res = await apiGet<DraftResponse>(`/warehouse/layout/draft?warehouseId=${map.warehouseId}`);
      setBase(res.publishedDraft);
      setDraft(res.publishedDraft);
      setPast([]);
      setLocations(res.locations);
      setOtherDraftExists(res.hasSavedDraft);
      setSelectedZoneId(map.selection.zoneId);
      setActive(true);
      setNotice(null);
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "배치 정보를 불러오지 못했습니다" });
    } finally {
      setEntering(false);
    }
  }, [map.layout, map.warehouseId, map.selection.zoneId, entering]);

  const exit = useCallback(() => {
    setActive(false);
    setBase(null);
    setDraft(null);
    setPast([]);
    setSelectedZoneId(null);
  }, []);

  /** 놓을 수 없으면 사유 — 층 외곽 · 다른 장소 · 도크/기둥/벽과 겹침 (돌린 모양 · 자유형 외곽 그대로 판정) */
  const check = useCallback(
    (zoneId: number, x: number, z: number, rotation?: number): string | null => {
      if (!draft) return "편집 정보가 없습니다";
      const zone = draft.zones.find((item) => item.id === zoneId);
      const floor = zone ? draft.floors.find((item) => item.code === zone.floor) : undefined;
      if (!zone || !floor) return "구역을 찾을 수 없습니다";
      const outline = zonePolygon({ ...zone, x, z, rotation: rotation ?? zone.rotation ?? 0 });
      if (!polygonInside(outline, floorPolygon(floor))) return `${floor.code} 외곽을 벗어납니다`;
      const other = draft.zones.find((item) => item.id !== zoneId && item.floor === zone.floor && polygonsOverlap(outline, zonePolygon(item)));
      if (other) return `${other.name}과(와) 겹칩니다`;
      const object = draft.objects.find(
        (item) => item.floor === zone.floor && item.kind !== "AISLE" && polygonsOverlap(outline, rectPoints(objectRect(item)))
      );
      if (object) return `${object.label || OBJECT_DEFAULTS[object.kind].name}과(와) 겹칩니다`;
      return null;
    },
    [draft]
  );

  /** 구역 자리·각도를 바꾼다 — 안의 랙은 patchZone 이 같이 옮기고 돌린다 */
  const placeZone = useCallback(
    (zoneId: number, target: { x?: number; z?: number; rotation?: number }) => {
      if (!draft) return false;
      const zone = draft.zones.find((item) => item.id === zoneId);
      if (!zone) return false;
      const next = {
        x: target.x ?? zone.x,
        z: target.z ?? zone.z,
        rotation: normalizeDeg(target.rotation ?? zone.rotation ?? 0)
      };
      if (next.x === zone.x && next.z === zone.z && next.rotation === (zone.rotation ?? 0)) {
        setSelectedZoneId(zoneId);
        return true;
      }
      const reason = check(zoneId, next.x, next.z, next.rotation);
      if (reason) {
        setNotice({ tone: "danger", text: reason });
        return false;
      }
      setPast((prev) => [...prev, draft].slice(-50));
      setDraft(patchZone(draft, zoneId, next));
      setSelectedZoneId(zoneId);
      return true;
    },
    [draft, check]
  );

  const moveZone = useCallback((zoneId: number, x: number, z: number) => placeZone(zoneId, { x, z }), [placeZone]);

  const rotateZone = useCallback((zoneId: number, rotation: number) => placeZone(zoneId, { rotation }), [placeZone]);

  const nudge = useCallback(
    (dx: number, dz: number) => {
      if (!draft || selectedZoneId == null) return;
      const zone = draft.zones.find((item) => item.id === selectedZoneId);
      if (!zone) return;
      moveZone(selectedZoneId, Math.round((zone.x + dx) * 10) / 10, Math.round((zone.z + dz) * 10) / 10);
    },
    [draft, selectedZoneId, moveZone]
  );

  /** 선택한 구역을 다음 45° 눈금으로 — direction 1 = 시계 방향 */
  const rotateBy = useCallback(
    (direction: 1 | -1) => {
      if (!draft || selectedZoneId == null) return;
      const zone = draft.zones.find((item) => item.id === selectedZoneId);
      if (!zone) return;
      rotateZone(selectedZoneId, stepRotation(zone.rotation ?? 0, direction, ZONE_ROTATE_STEP));
    },
    [draft, selectedZoneId, rotateZone]
  );

  const resetZone = useCallback(
    (zoneId: number) => {
      const original = base?.zones.find((item) => item.id === zoneId);
      if (original) placeZone(zoneId, { x: original.x, z: original.z, rotation: original.rotation ?? 0 });
    },
    [base, placeZone]
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    setDraft(past[past.length - 1]);
    setPast(past.slice(0, -1));
  }, [past]);

  const changes = useMemo(() => (base && draft ? summarizeChanges(base, draft) : []), [base, draft]);

  /** 게시본과 비교해 옮겼거나 돌린 구역 */
  const { changedZoneIds, rotatedZoneIds } = useMemo(() => {
    const changed = new Set<number>();
    const rotated = new Set<number>();
    if (base && draft) {
      draft.zones.forEach((zone) => {
        const original = base.zones.find((item) => item.id === zone.id);
        if (!original) return;
        const turned = (original.rotation ?? 0) !== (zone.rotation ?? 0);
        if (turned) rotated.add(zone.id);
        if (turned || original.x !== zone.x || original.z !== zone.z) changed.add(zone.id);
      });
    }
    return { changedZoneIds: changed, rotatedZoneIds: rotated };
  }, [base, draft]);

  /** 편집 중에는 초안을 3D 형태로 바꿔 보여준다 */
  const layout: WarehouseLayout | null = useMemo(() => {
    if (!active || !draft || !map.layout) return map.layout;
    return buildPreviewLayout(draft, map.layout.warehouse, locations, map.layout);
  }, [active, draft, map.layout, locations]);

  const save = useCallback(async () => {
    if (!draft || !changedZoneIds.size) return false;
    setSaving(true);
    try {
      const res = await apiPost<{ published: { version: number } }>("/warehouse/layout/publish", { draft, operator });
      const count = changedZoneIds.size;
      exit();
      await map.refresh();
      setNotice({ tone: "success", text: `구역 ${count}곳 배치를 저장했습니다 (배치 v${res.published.version}) — 랙·로케이션·재고가 함께 옮겨졌습니다` });
      return true;
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof Error ? err.message : "저장 실패" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, changedZoneIds, operator, exit, map]);

  return {
    active,
    entering,
    saving,
    draft,
    base,
    layout,
    selectedZoneId,
    setSelectedZoneId,
    otherDraftExists,
    notice,
    setNotice,
    changes,
    changedZoneIds,
    rotatedZoneIds,
    canUndo: past.length > 0,
    enter,
    exit,
    check,
    moveZone,
    rotateZone,
    rotateBy,
    nudge,
    resetZone,
    undo,
    save
  };
};

export type ZoneEditSession = ReturnType<typeof useZoneEditSession>;
