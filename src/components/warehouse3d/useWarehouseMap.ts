import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../../services/http";
import type {
  ColorMode,
  FocusRequest,
  LayoutSummaryRow,
  MapSelection,
  SlotDetail,
  WarehouseLayout
} from "./types";

/* ============================================================
   3D 맵을 쓰는 화면(대시보드 · 재고 이동 · 로케이션 관리)이 공유하는 상태
   레이아웃 로딩 · 층 · 선택 · 카메라 포커스 · 색 기준 · 검색 강조 · 슬롯 상세
   ============================================================ */

const COLOR_KEY = "wms.map.colorMode";

const readColorMode = (): ColorMode => {
  try {
    const saved = window.localStorage.getItem(COLOR_KEY);
    return saved === "type" || saved === "turnover" ? saved : "util";
  } catch {
    return "util";
  }
};

export type MapHighlight = { label: string; ids: number[] };

type Options = {
  warehouseId?: number;
  /** 층을 바꾸면 그 층의 첫 구역을 선택 상태로 둔다 */
  autoSelectZone?: boolean;
};

export const useWarehouseMap = (options: Options = {}) => {
  const autoSelectZone = options.autoSelectZone ?? true;
  const [warehouseId, setWarehouseIdState] = useState(options.warehouseId ?? 4);
  const [summary, setSummary] = useState<LayoutSummaryRow[]>([]);
  const [layout, setLayout] = useState<WarehouseLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [floor, setFloorState] = useState("1F");
  const [selection, setSelection] = useState<MapSelection>({ zoneId: null, locationId: null });
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [colorMode, setColorModeState] = useState<ColorMode>(readColorMode);
  const [highlight, setHighlight] = useState<MapHighlight | null>(null);
  const [detail, setDetail] = useState<SlotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const nonce = useRef(0);
  const detailSeq = useRef(0);

  const loadSummary = useCallback(() => {
    apiGet<LayoutSummaryRow[]>("/warehouse/layout-summary")
      .then(setSummary)
      .catch(() => setSummary([]));
  }, []);

  const loadLayout = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<WarehouseLayout>(`/warehouse/layout?warehouseId=${id}`);
      setLayout(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "레이아웃 조회 실패");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (locationId: number | null) => {
    detailSeq.current += 1;
    const seq = detailSeq.current;
    if (locationId == null) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await apiGet<SlotDetail>(`/locations/${locationId}/detail`);
      if (seq === detailSeq.current) setDetail(data);
    } catch {
      if (seq === detailSeq.current) setDetail(null);
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  }, []);

  useEffect(loadSummary, [loadSummary]);

  useEffect(() => {
    void loadLayout(warehouseId);
  }, [warehouseId, loadLayout]);

  // 층이 레이아웃에 없으면 첫 층으로
  useEffect(() => {
    if (!layout) return;
    const codes = layout.floors.map((item) => item.code);
    if (codes.length && !codes.includes(floor)) setFloorState(codes[0]);
  }, [layout, floor]);

  // 선택이 사라진 데이터를 가리키지 않게 맞춘다
  useEffect(() => {
    if (!layout) return;
    setSelection((prev) => {
      const zoneOnFloor = prev.zoneId != null && layout.zones.some((zone) => zone.id === prev.zoneId && zone.floor === floor);
      if (zoneOnFloor) {
        if (prev.locationId == null) return prev;
        const exists =
          layout.slots.some((slot) => slot.locationId === prev.locationId) ||
          layout.unplaced.some((loc) => loc.locationId === prev.locationId);
        return exists ? prev : { zoneId: prev.zoneId, locationId: null };
      }
      const first = autoSelectZone ? layout.zones.find((zone) => zone.floor === floor) : undefined;
      const next = { zoneId: first?.id ?? null, locationId: null };
      return prev.zoneId === next.zoneId && prev.locationId === null ? prev : next;
    });
  }, [layout, floor, autoSelectZone]);

  useEffect(() => {
    void loadDetail(selection.locationId);
  }, [selection.locationId, loadDetail]);

  const requestFocus = useCallback((target: { zoneId?: number | null; locationId?: number | null }) => {
    nonce.current += 1;
    setFocus({ ...target, nonce: nonce.current });
  }, []);

  const setFloor = useCallback((code: string) => setFloorState(code), []);

  const setWarehouseId = useCallback((id: number) => {
    setWarehouseIdState(id);
    setSelection({ zoneId: null, locationId: null });
    setHighlight(null);
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    try {
      window.localStorage.setItem(COLOR_KEY, mode);
    } catch {
      /* 저장 실패는 무시 — 이번 화면에서만 유지 */
    }
  }, []);

  const selectZone = useCallback(
    (zoneId: number, opts: { focus?: boolean } = {}) => {
      const zone = layout?.zones.find((item) => item.id === zoneId);
      if (!zone) return;
      if (zone.floor !== floor) setFloorState(zone.floor);
      setSelection({ zoneId, locationId: null });
      if (opts.focus ?? true) requestFocus({ zoneId });
    },
    [layout, floor, requestFocus]
  );

  const selectLocation = useCallback(
    (locationId: number, opts: { focus?: boolean } = {}) => {
      if (!layout) return;
      const slot = layout.slots.find((item) => item.locationId === locationId);
      const unplaced = layout.unplaced.find((item) => item.locationId === locationId);
      const zoneId = slot?.zoneId ?? unplaced?.zoneId;
      if (zoneId == null) return;
      const zone = layout.zones.find((item) => item.id === zoneId);
      if (zone && zone.floor !== floor) setFloorState(zone.floor);
      setSelection({ zoneId, locationId });
      if ((opts.focus ?? true) && slot) requestFocus({ locationId });
    },
    [layout, floor, requestFocus]
  );

  const backToZone = useCallback(() => {
    setSelection((prev) => ({ zoneId: prev.zoneId, locationId: null }));
    if (selection.zoneId != null) requestFocus({ zoneId: selection.zoneId });
  }, [selection.zoneId, requestFocus]);

  /** 저장 후 다시 읽기 — 선택은 유지한다 */
  const refresh = useCallback(async () => {
    const data = await loadLayout(warehouseId);
    loadSummary();
    await loadDetail(selection.locationId);
    return data;
  }, [loadLayout, loadSummary, loadDetail, warehouseId, selection.locationId]);

  const floorZones = useMemo(() => (layout?.zones ?? []).filter((zone) => zone.floor === floor), [layout, floor]);
  const selectedZone = useMemo(
    () => (selection.zoneId == null ? null : layout?.zones.find((zone) => zone.id === selection.zoneId) ?? null),
    [layout, selection.zoneId]
  );
  const warehouse = summary.find((row) => row.warehouseId === warehouseId) ?? null;

  return {
    warehouseId,
    setWarehouseId,
    warehouse,
    summary,
    layout,
    loading,
    error,
    floor,
    setFloor,
    floorZones,
    selection,
    setSelection,
    selectedZone,
    selectZone,
    selectLocation,
    backToZone,
    focus,
    requestFocus,
    colorMode,
    setColorMode,
    highlight,
    setHighlight,
    detail,
    detailLoading,
    refresh
  };
};

export type WarehouseMapState = ReturnType<typeof useWarehouseMap>;
