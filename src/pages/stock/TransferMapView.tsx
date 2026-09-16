import { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../services/http";
import { useUiStore } from "../../app/store/uiStore";
import { MapSearch } from "../../components/warehouse3d/MapSearch";
import { MapSidePanel } from "../../components/warehouse3d/MapSidePanel";
import { SlotContextMenu } from "../../components/warehouse3d/SlotContextMenu";
import { movableQty, useStockActions } from "../../components/warehouse3d/stockActions";
import { useWarehouseMap } from "../../components/warehouse3d/useWarehouseMap";
import type {
  LayoutSlot,
  MapSearchItem,
  MapSearchLocation,
  MapSearchResult,
  SlotStock
} from "../../components/warehouse3d/types";
import "./TransferMapView.css";

const Warehouse3D = lazy(() =>
  import("../../components/warehouse3d/Warehouse3D").then((m) => ({ default: m.Warehouse3D }))
);

/* ============================================================
   재고 이동 — 3D 작업 모드
   · 재고가 있는 슬롯을 끌어 다른 슬롯에 놓기 (PC)
   · [이동] → 도착 슬롯 클릭 (태블릿 · 정밀 선택)
   · [조정] → 실제 재고 조정, 사유 필수 · 우클릭 메뉴(보충 포함)
   선반(랙) 배치는 여기서 바꾸지 않는다 — 로케이션 관리 › 배치 탭의 몫.
   이동·조정·보충 창과 규칙은 components/warehouse3d/stockActions 를 대시보드와 같이 쓴다.
   ============================================================ */

export const TransferMapView = ({ onChanged }: { onChanged?: () => void }) => {
  const navigate = useNavigate();
  const theme = useUiStore((state) => state.theme);
  const map = useWarehouseMap();
  const { layout } = map;
  const actions = useStockActions(map, { onChanged });
  const [menu, setMenu] = useState<{ slot: LayoutSlot; point: { x: number; y: number } } | null>(null);

  const selectedSlot = map.selection.locationId != null ? layout?.slots.find((slot) => slot.locationId === map.selection.locationId) ?? null : null;

  const pickLocation = (location: MapSearchLocation) => {
    map.setHighlight(null);
    map.selectLocation(location.locationId);
  };
  const pickItem = (item: MapSearchItem) => {
    const placed = item.locations.filter((location) => location.placed);
    map.setHighlight({ label: `${item.itemName} · ${placed.length}곳`, ids: placed.map((location) => location.locationId) });
    if (placed[0]) map.selectZone(placed[0].zoneId);
  };
  const showItem = async (stock: SlotStock) => {
    const res = await apiGet<MapSearchResult>(`/warehouse/search?warehouseId=${map.warehouseId}&q=${encodeURIComponent(stock.itemCode)}`);
    const item = res.items.find((entry) => entry.itemCode === stock.itemCode);
    if (item) pickItem(item);
  };

  return (
    <div className="tmv">
      <div className="tmv-main">
        <section className="card tmv-map">
          <div className="tmv-map-head">
            <div className="nx-sect">
              <span className="nx-eyebrow">WORK MODE</span>
              <span className="nx-sect-title">{layout?.warehouse.name ?? "창고"} 3D 재고 이동</span>
            </div>
            <div className="tmv-map-tools">
              <select
                className="tmv-select"
                value={map.warehouseId}
                onChange={(event) => map.setWarehouseId(Number(event.target.value))}
                aria-label="창고 선택"
              >
                {map.summary.map((row) => (
                  <option key={row.warehouseId} value={row.warehouseId}>
                    {row.name}
                    {row.floors === 0 ? " · 레이아웃 미등록" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ol className="tmv-guide">
            <li>
              <b>끌어서 옮기기</b> 재고가 있는 슬롯을 다른 슬롯에 놓습니다. 놓을 수 있는 칸만 초록으로 밝아집니다.
            </li>
            <li>
              <b>눌러서 옮기기</b> 오른쪽 품목의 [이동] → 도착 슬롯을 클릭합니다. (태블릿)
            </li>
            <li>
              <b>우클릭 메뉴</b> 수량 확인·보충·조정·피킹 대기 주문 — 태블릿은 길게 누르기.
            </li>
          </ol>

          <div className="tmv-stage">
            {layout ? (
              <Suspense fallback={<div className="tmv-loading">3D 맵을 준비하는 중…</div>}>
                <Warehouse3D
                  layout={layout}
                  floor={map.floor}
                  onFloorChange={map.setFloor}
                  theme={theme}
                  mode="work"
                  selection={map.selection}
                  onSelectionChange={(next) => {
                    if (!actions.interceptSelection(next)) map.setSelection(next);
                  }}
                  colorMode={map.colorMode}
                  onColorModeChange={map.setColorMode}
                  highlightIds={map.highlight?.ids ?? null}
                  focus={map.focus}
                  dropCheck={actions.dropCheck}
                  onDropSlot={actions.onDropSlot}
                  onSlotContextMenu={(slot, point) => {
                    map.setSelection({ zoneId: slot.zoneId, locationId: slot.locationId });
                    setMenu({ slot, point });
                  }}
                  popover={
                    menu ? (
                      <SlotContextMenu
                        slot={menu.slot}
                        point={menu.point}
                        actions={actions}
                        onClose={() => setMenu(null)}
                        onOpenOrder={(order, code) => navigate(`/outbound/picking?outboundNo=${encodeURIComponent(order.outboundNo)}&from=${encodeURIComponent(code)}`)}
                        onShowItem={(stock) => void showItem(stock)}
                        onFocus={() => map.requestFocus({ locationId: menu.slot.locationId })}
                      />
                    ) : null
                  }
                  overlay={
                    actions.pendingBanner ??
                    (layout.floors.length ? (
                      <MapSearch
                        warehouseId={map.warehouseId}
                        onPickLocation={pickLocation}
                        onPickItem={pickItem}
                        highlightLabel={map.highlight?.label ?? null}
                        onClearHighlight={() => map.setHighlight(null)}
                      />
                    ) : null)
                  }
                />
              </Suspense>
            ) : (
              <div className="tmv-loading">{map.error ? `레이아웃 조회 실패: ${map.error}` : "레이아웃을 불러오는 중…"}</div>
            )}
          </div>
        </section>

        <MapSidePanel
          map={map}
          title="이동할 재고 찾기"
          onPickSlot={(slot) => actions.interceptSelection({ zoneId: slot.zoneId, locationId: slot.locationId })}
          onOpenActions={() => {
            if (selectedSlot) setMenu({ slot: selectedSlot, point: { x: 100000, y: 56 } });
          }}
          stockAction={(stock) => {
            const movable = movableQty(stock) > 0;
            return (
              <>
                <button
                  type="button"
                  disabled={!movable || !selectedSlot || !actions.canMove}
                  title={!actions.canMove ? "재고 이동 권한이 없습니다" : !movable ? "할당·격납대기 재고는 옮길 수 없습니다" : "도착 슬롯을 클릭해 옮깁니다"}
                  onClick={() => selectedSlot && actions.beginMove(selectedSlot, stock)}
                >
                  이동
                </button>
                <button
                  type="button"
                  disabled={!actions.canAdjust}
                  title={actions.canAdjust ? "실제 재고 수량을 조정합니다" : "재고 조정 권한이 없습니다 (관리자·물류·재고 담당)"}
                  onClick={() => actions.openAdjust(stock, map.detail?.location.code ?? "")}
                >
                  조정
                </button>
              </>
            );
          }}
        />
      </div>

      {actions.layer}
    </div>
  );
};
