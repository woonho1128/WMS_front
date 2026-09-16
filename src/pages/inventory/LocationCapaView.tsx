import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useUiStore } from "../../app/store/uiStore";
import { Icon } from "../../components/ui/Icon";
import { MapSearch } from "../../components/warehouse3d/MapSearch";
import { MapSidePanel } from "../../components/warehouse3d/MapSidePanel";
import { useWarehouseMap } from "../../components/warehouse3d/useWarehouseMap";
import { bucketOf, type MapSearchItem, type MapSearchLocation } from "../../components/warehouse3d/types";
import { LocationLabelDialog, type LabelTarget } from "./LocationLabels";
import { RackBoard } from "./RackBoard";
import "./LocationPage.css";

const Warehouse3D = lazy(() =>
  import("../../components/warehouse3d/Warehouse3D").then((m) => ({ default: m.Warehouse3D }))
);

/* ============================================================
   로케이션 관리 › CAPA — 점유%·가용% (요청사항 시트2 #17)
   [3D] 조회 모드 / [랙 정면] 칸마다 채움 % 격자 + 구역별 CAPA 표.
   목록의 [3D에서 보기]가 여기로 온다.
   ============================================================ */

type CapaView = "3d" | "rack";
const VIEW_KEY = "wms.capa.view";

const readView = (): CapaView => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "rack" ? "rack" : "3d";
  } catch {
    return "3d";
  }
};

type Props = {
  warehouseId: number;
  onWarehouseChange: (id: number) => void;
  focusRequest: { locationId: number; warehouseId: number; nonce: number } | null;
  onEditLayout: () => void;
  reloadKey: number;
};

export const LocationCapaView = ({ warehouseId, onWarehouseChange, focusRequest, onEditLayout, reloadKey }: Props) => {
  const theme = useUiStore((state) => state.theme);
  const map = useWarehouseMap({ warehouseId });
  const handledNonce = useRef<number | null>(null);
  const { setWarehouseId, refresh, layout, selectLocation } = map;
  const [view, setView] = useState<CapaView>(readView);
  const [labelJob, setLabelJob] = useState<{ targets: LabelTarget[]; title: string } | null>(null);

  const switchView = (next: CapaView) => {
    if (next === view) return;
    // 3D 로 돌아가면 랙 정면에서 고른 칸(또는 구역)으로 카메라를 보낸다
    if (next === "3d") {
      if (map.selection.locationId != null) map.requestFocus({ locationId: map.selection.locationId });
      else if (map.selection.zoneId != null) map.requestFocus({ zoneId: map.selection.zoneId });
    }
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* 저장 실패는 무시 */
    }
  };

  useEffect(() => {
    if (map.warehouseId !== warehouseId) setWarehouseId(warehouseId);
  }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reloadKey) void refresh();
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 목록 탭의 [3D에서 보기] — 해당 창고 레이아웃이 올라온 뒤에 선택한다
  useEffect(() => {
    if (!focusRequest || handledNonce.current === focusRequest.nonce) return;
    if (!layout || layout.warehouse.id !== focusRequest.warehouseId) return;
    handledNonce.current = focusRequest.nonce;
    setView("3d"); // [3D] 버튼으로 왔으니 랙 정면 보기였어도 3D 로
    selectLocation(focusRequest.locationId);
  }, [focusRequest, layout, selectLocation]);

  const capaRows = useMemo(() => {
    if (!layout) return [];
    return [...layout.zones]
      .sort((a, b) => a.floor.localeCompare(b.floor) || a.code.localeCompare(b.code))
      .map((zone) => {
        const free = Math.max(zone.positions - zone.usedPositions, 0);
        return {
          zone,
          free,
          freePct: zone.positions ? Math.round((free / zone.positions) * 100) : 0,
          emptySlots: layout.slots.filter((slot) => slot.zoneId === zone.id && slot.pallets <= 0).length
        };
      });
  }, [layout]);

  const totals = useMemo(() => {
    const positions = capaRows.reduce((sum, row) => sum + row.zone.positions, 0);
    const used = capaRows.reduce((sum, row) => sum + row.zone.usedPositions, 0);
    return { positions, used, util: positions ? Math.round((used / positions) * 100) : 0 };
  }, [capaRows]);

  const pickLocation = (location: MapSearchLocation) => {
    map.setHighlight(null);
    map.selectLocation(location.locationId);
  };
  const pickItem = (item: MapSearchItem) => {
    const placed = item.locations.filter((location) => location.placed);
    map.setHighlight({ label: `${item.itemName} · ${placed.length}곳`, ids: placed.map((location) => location.locationId) });
    if (placed[0]) map.selectZone(placed[0].zoneId);
  };

  const noLayout = layout && layout.floors.length === 0;

  return (
    <div className="lp-capa">
      <div className="lp-capa-main">
        <section className="card lp-map">
          <div className="lp-map-head">
            <div className="nx-sect">
              <span className="nx-eyebrow">CAPA</span>
              <span className="nx-sect-title">{layout?.warehouse.name ?? "창고"} 적치 현황</span>
            </div>
            <div className="lp-map-tools">
              <div className="lp-seg" role="tablist" aria-label="CAPA 보기">
                <button type="button" role="tab" aria-selected={view === "3d"} className={view === "3d" ? "is-on" : ""} onClick={() => switchView("3d")}>
                  <Icon name="cube3d" size={13} />
                  3D
                </button>
                <button type="button" role="tab" aria-selected={view === "rack"} className={view === "rack" ? "is-on" : ""} onClick={() => switchView("rack")}>
                  <Icon name="grid" size={13} />
                  랙 정면
                </button>
              </div>
              <select
                className="lp-select"
                value={warehouseId}
                onChange={(event) => onWarehouseChange(Number(event.target.value))}
                aria-label="창고 선택"
              >
                {map.summary.map((row) => (
                  <option key={row.warehouseId} value={row.warehouseId}>
                    {row.name}
                    {row.floors === 0 ? " · 레이아웃 미등록" : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary lp-btn" onClick={onEditLayout}>
                <Icon name="edit" size={14} />
                배치 편집
              </button>
            </div>
          </div>
          <div className="lp-map-stage">
            {layout && view === "rack" ? (
              <RackBoard map={map} onPrint={(targets, title) => setLabelJob({ targets, title })} />
            ) : layout ? (
              <Suspense fallback={<div className="lp-loading">3D 맵을 준비하는 중…</div>}>
                <Warehouse3D
                  layout={layout}
                  floor={map.floor}
                  onFloorChange={map.setFloor}
                  theme={theme}
                  selection={map.selection}
                  onSelectionChange={map.setSelection}
                  colorMode={map.colorMode}
                  onColorModeChange={map.setColorMode}
                  highlightIds={map.highlight?.ids ?? null}
                  focus={map.focus}
                  overlay={
                    layout.floors.length ? (
                      <MapSearch
                        warehouseId={map.warehouseId}
                        onPickLocation={pickLocation}
                        onPickItem={pickItem}
                        highlightLabel={map.highlight?.label ?? null}
                        onClearHighlight={() => map.setHighlight(null)}
                      />
                    ) : null
                  }
                />
              </Suspense>
            ) : (
              <div className="lp-loading">{map.error ? `레이아웃 조회 실패: ${map.error}` : "레이아웃을 불러오는 중…"}</div>
            )}
          </div>
        </section>

        <MapSidePanel map={map} title="구역 CAPA" />
      </div>

      <section className="card lp-capa-table">
        <div className="lp-map-head">
          <div className="nx-sect">
            <span className="nx-sect-title">구역별 점유 · 가용</span>
            <span className="nx-sect-sub">파레트 자리 기준 · 슬롯 1칸 = 랙의 칸당 파레트 수</span>
          </div>
          {totals.positions ? (
            <div className="lp-capa-total">
              전체 <b>{totals.used.toLocaleString()}</b> / {totals.positions.toLocaleString()} 파레트 · 점유 <b>{totals.util}%</b> · 가용 <b>{100 - totals.util}%</b>
            </div>
          ) : null}
        </div>
        {noLayout ? (
          <div className="nx-empty">이 창고는 레이아웃이 없어 CAPA를 계산할 수 없습니다. [배치 편집]에서 층·구역·랙을 먼저 만드세요.</div>
        ) : (
          <div className="lp-table-wrap">
            <table className="data-table lp-table">
              <thead>
                <tr>
                  <th>층</th>
                  <th>구역</th>
                  <th>용도</th>
                  <th className="num">로케이션</th>
                  <th className="num">파레트 자리</th>
                  <th className="num">점유</th>
                  <th className="num">가용</th>
                  <th className="num">빈 슬롯</th>
                  <th style={{ width: "26%" }}>점유율</th>
                </tr>
              </thead>
              <tbody>
                {capaRows.map(({ zone, free, freePct, emptySlots }) => {
                  const bucket = bucketOf(zone.util);
                  const tone = bucket.key === "free" ? "is-ok" : bucket.key === "normal" ? "is-info" : bucket.key === "busy" ? "is-warn" : "is-danger";
                  return (
                    <tr
                      key={zone.id}
                      className={map.selection.zoneId === zone.id ? "is-selected" : ""}
                      onClick={() => map.selectZone(zone.id)}
                    >
                      <td>{zone.floor}</td>
                      <td>
                        <b>{zone.name}</b> <span className="lp-muted">{zone.codeRange}</span>
                      </td>
                      <td>{zone.purposeName}</td>
                      <td className="num">{zone.locationCount}</td>
                      <td className="num">{zone.positions}</td>
                      <td className="num">{zone.usedPositions}</td>
                      <td className="num">
                        {free} <span className="lp-muted">({freePct}%)</span>
                      </td>
                      <td className="num">{emptySlots}</td>
                      <td>
                        <div className="lp-util">
                          <div className={`nx-bar ${tone}`}>
                            <i style={{ width: `${Math.min(zone.util, 100)}%` }} />
                          </div>
                          <b style={{ color: bucket.token }}>{zone.util}%</b>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LocationLabelDialog targets={labelJob?.targets ?? null} title={labelJob?.title} onClose={() => setLabelJob(null)} />
    </div>
  );
};
