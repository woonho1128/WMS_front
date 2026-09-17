import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { RackFaceGrid } from "./RackFaceGrid";
import { polygonArea, zoneWorldPoints } from "./geometry";
import {
  LOCATION_TYPE_LABEL,
  TYPE_LEGEND,
  bucketOf,
  formatKg,
  purposeMeta,
  type LayoutSlot,
  type LayoutZone,
  type SlotStock
} from "./types";
import type { WarehouseMapState } from "./useWarehouseMap";
import "./mapPanel.css";

/* ============================================================
   맵 옆 패널 — 선택 단계에 따라 바뀐다
   구역 목록 → (구역 선택) 구역 상세 펼침 → (슬롯 선택) 로케이션 상세 · 품목
   ============================================================ */

type Props = {
  map: WarehouseMapState;
  title?: string;
  /** 품목 행 오른쪽에 붙일 작업 버튼 (작업 모드: 이동 · 조정) */
  stockAction?: (stock: SlotStock) => ReactNode;
  /** 로케이션 상세 하단 버튼 */
  locationFooter?: ReactNode;
  /** 구역 목록 하단 버튼 */
  zoneFooter?: ReactNode;
  headAction?: ReactNode;
  /** 로케이션 상세에서 우클릭 메뉴를 여는 버튼 — 우클릭이 없는 태블릿·키보드 사용자용 */
  onOpenActions?: () => void;
  /** 랙 격자 칸을 눌렀을 때 먼저 받는다 — true 면 평소 선택을 하지 않는다 (이동 대기 중 도착 칸 고르기) */
  onPickSlot?: (slot: LayoutSlot) => boolean;
};

const barTone = (util: number) => {
  const key = bucketOf(util).key;
  return key === "free" ? "is-ok" : key === "normal" ? "is-info" : key === "busy" ? "is-warn" : "is-danger";
};

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "success",
  DEFECT: "danger",
  PUTAWAY_WAIT: "warning"
};
const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "가용",
  DEFECT: "불량",
  PUTAWAY_WAIT: "격납대기"
};

export const MapSidePanel = ({ map, title = "로케이션 현황", stockAction, locationFooter, zoneFooter, headAction, onOpenActions, onPickSlot }: Props) => {
  const { layout, selection } = map;
  const showDetail = selection.locationId != null;

  return (
    <aside className="card wmp">
      <div className="wmp-body">
      {showDetail ? (
        <LocationDetail map={map} stockAction={stockAction} footer={locationFooter} onOpenActions={onOpenActions} onPickSlot={onPickSlot} />
      ) : (
        <>
          <div className="wmp-head">
            <div className="nx-sect">
              <span className="nx-sect-title">{title}</span>
              <span className="nx-sect-sub">
                {layout?.warehouse.name ?? ""} · {map.floor}
              </span>
            </div>
            {headAction}
          </div>

          <div className="wmp-zones">
            {map.floorZones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                active={zone.id === selection.zoneId}
                onSelect={() => map.selectZone(zone.id)}
              />
            ))}
            {layout && !map.floorZones.length ? (
              <div className="nx-empty">이 층에 등록된 구역이 없습니다.</div>
            ) : null}
          </div>

          {layout && layout.unplaced.length ? (
            <div className="wmp-unplaced">
              <Icon name="alert" size={14} />
              <span>
                좌표가 없는 <b>미배치 로케이션 {layout.unplaced.length}개</b>는 3D에 보이지 않습니다.
              </span>
            </div>
          ) : null}

          {zoneFooter ? <div className="wmp-foot">{zoneFooter}</div> : null}
        </>
      )}
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------ */

const ZoneRow = ({ zone, active, onSelect }: { zone: LayoutZone; active: boolean; onSelect: () => void }) => {
  const bucket = bucketOf(zone.util);
  const meta = purposeMeta(zone.purpose);
  if (!meta.racks) {
    // 입고장 · 출고장 · 사무실 — 적치율 대신 유형과 면적
    const area = Math.round(polygonArea(zoneWorldPoints(zone)));
    return (
      <div className={`wmp-zone is-place${active ? " is-active" : ""}`}>
        <button type="button" className="wmp-zone-head" onClick={onSelect}>
          <span className="wmp-zone-badge" style={{ background: meta.token }}>
            {meta.label.slice(0, 1)}
          </span>
          <span className="wmp-zone-text">
            <span className="wmp-zone-name">{zone.name}</span>
            <span className="wmp-zone-code">{meta.hint}</span>
          </span>
          <span className="wmp-zone-figures">
            <span className="wmp-zone-util" style={{ color: meta.token }}>
              {meta.label}
            </span>
            <span className="wmp-zone-cap">{area.toLocaleString()} m²{zone.shape ? " · 자유형" : ""}</span>
          </span>
        </button>
        {active ? (
          <dl className="wmp-zone-detail">
            <div>
              <dt>장소 유형</dt>
              <dd>{meta.label}</dd>
            </div>
            <div>
              <dt>면적</dt>
              <dd>{area.toLocaleString()} m²</dd>
            </div>
            <div>
              <dt>담당자</dt>
              <dd>{zone.manager}</dd>
            </div>
            <div>
              <dt>모양</dt>
              <dd>{zone.shape ? `자유형 · 꼭짓점 ${zone.shape.length}` : `사각형 ${zone.width} × ${zone.depth} m`}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`wmp-zone${active ? " is-active" : ""}`}>
      <button type="button" className="wmp-zone-head" onClick={onSelect}>
        <span className="wmp-zone-badge" style={{ background: bucket.token }}>
          {zone.code.replace(/^.*-/, "")}
        </span>
        <span className="wmp-zone-text">
          <span className="wmp-zone-name">{zone.name}</span>
          <span className="wmp-zone-code">{zone.codeRange}</span>
        </span>
        <span className="wmp-zone-figures">
          <span className="wmp-zone-util" style={{ color: bucket.token }}>
            {zone.util}%
          </span>
          <span className="wmp-zone-cap">
            {zone.usedPositions} / {zone.positions} 파레트
          </span>
        </span>
      </button>
      <div className={`nx-bar ${barTone(zone.util)} wmp-zone-bar`}>
        <i style={{ width: `${Math.min(zone.util, 100)}%` }} />
      </div>
      {active ? (
        <dl className="wmp-zone-detail">
          <div>
            <dt>구역 유형</dt>
            <dd>{zone.purposeName}</dd>
          </div>
          <div>
            <dt>로케이션</dt>
            <dd>{zone.locationCount} 개</dd>
          </div>
          <div>
            <dt>보관 SKU</dt>
            <dd>{zone.skuCount} 종</dd>
          </div>
          <div>
            <dt>담당자</dt>
            <dd>{zone.manager}</dd>
          </div>
          <div>
            <dt>재고 수량</dt>
            <dd>{zone.onHand.toLocaleString()}</dd>
          </div>
          <div>
            <dt>최근 입·출고</dt>
            <dd>
              {zone.recentIn} / {zone.recentOut}
            </dd>
          </div>
          <p className="wmp-zone-tip">
            <Icon name="cube3d" size={13} />
            맵에서 이 구역의 슬롯을 클릭하면 로케이션 상세가 열립니다.
          </p>
        </dl>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------ */

const LocationDetail = ({
  map,
  stockAction,
  footer,
  onOpenActions,
  onPickSlot
}: {
  map: WarehouseMapState;
  stockAction?: (stock: SlotStock) => ReactNode;
  footer?: ReactNode;
  onOpenActions?: () => void;
  onPickSlot?: (slot: LayoutSlot) => boolean;
}) => {
  const { detail, layout, selectedZone } = map;
  const rackSlots: LayoutSlot[] = detail?.rack && layout ? layout.slots.filter((slot) => slot.rackId === detail.rack!.id) : [];
  const typeEntry = detail ? TYPE_LEGEND.find((entry) => entry.key === detail.location.locationType) : undefined;

  return (
    <div className="wmp-detail">
      <div className="wmp-crumbs">
        <button type="button" className="wmp-back" onClick={map.backToZone}>
          <Icon name="chevL" size={14} />
          {selectedZone?.name ?? "구역"}
        </button>
        <span className="wmp-crumb-sep">/</span>
        <span className="wmp-crumb">{detail?.rack?.code ?? "미배치"}</span>
        {detail?.bay ? (
          <>
            <span className="wmp-crumb-sep">/</span>
            <span className="wmp-crumb">
              {detail.bay}연 {detail.level}단
            </span>
          </>
        ) : null}
      </div>

      {!detail ? (
        <div className="wmp-loading">{map.detailLoading ? "불러오는 중…" : "로케이션 정보를 불러오지 못했습니다."}</div>
      ) : (
        <>
          <div className="wmp-title">
            <div>
              <span className="nx-eyebrow">LOCATION</span>
              <h3>{detail.location.code}</h3>
            </div>
            <div className="wmp-title-badges">
              <span className="wmp-type" style={{ color: typeEntry?.token, borderColor: typeEntry?.token }}>
                {LOCATION_TYPE_LABEL[detail.location.locationType]}
              </span>
              {detail.location.active ? null : <span className="ds-badge gray">사용중지</span>}
              {detail.location.warehouseType === "외주" ? <span className="ds-badge consign">외주</span> : null}
              {onOpenActions && detail.rack ? (
                <button type="button" className="wmp-actions-btn" onClick={onOpenActions} title="보충·이동·조정·피킹 대기 주문 (맵에서 우클릭과 같음)">
                  <Icon name="dots" size={14} />
                  작업
                </button>
              ) : null}
            </div>
          </div>

          {!detail.rack ? (
            <div className="ds-callout warning wmp-note">
              <Icon name="alert" size={16} />
              <span>
                좌표가 없는 <b>미배치 로케이션</b>입니다. 로케이션 관리 › 배치 탭에서 랙 칸에 놓으면 3D에 나타납니다.
              </span>
            </div>
          ) : null}

          <div className="wmp-kpis">
            <div>
              <span>적치</span>
              <b className={detail.used > detail.capacity ? "is-over" : ""}>
                {detail.pallets}
                <small> / {detail.capacity} 파레트</small>
              </b>
            </div>
            <div>
              <span>보관 SKU</span>
              <b>
                {new Set(detail.stocks.map((stock) => stock.itemCode)).size}
                <small> 종</small>
              </b>
            </div>
            <div>
              <span>90일 출고</span>
              <b>
                {detail.outFreq90}
                <small> 회</small>
              </b>
            </div>
          </div>

          <LoadStrip detail={detail} />

          {detail.rack && rackSlots.length ? (
            <div className="wmp-rack">
              <RackFaceGrid
                variant="compact"
                rack={detail.rack}
                slots={rackSlots}
                selectedId={detail.location.id}
                highlightIds={map.highlight ? new Set(map.highlight.ids) : null}
                onSelect={(id) => {
                  const slot = rackSlots.find((item) => item.locationId === id);
                  if (slot && onPickSlot?.(slot)) return;
                  map.selectLocation(id);
                }}
              />
            </div>
          ) : null}

          <div className="wmp-stocks">
            <div className="wmp-stocks-head">
              <span>보관 품목</span>
              <small>입고일 오래된 순</small>
            </div>
            {detail.stocks.length === 0 ? (
              <div className="nx-empty">비어 있는 슬롯입니다.</div>
            ) : (
              detail.stocks.map((stock) => (
                <div key={stock.stockId} className="wmp-stock">
                  <div className="wmp-stock-main">
                    <b>{stock.itemName}</b>
                    <span className="wmp-stock-meta">
                      <span className="wmp-mono">{stock.itemCode}</span>
                      <span className="wmp-mono">{stock.lotNo}</span>
                      <span>입고 {stock.receivedDate}</span>
                    </span>
                    <span className="wmp-stock-qty">
                      <span className={`ds-badge ${STATUS_TONE[stock.stockStatus] ?? "gray"}`}>
                        {STATUS_LABEL[stock.stockStatus] ?? stock.stockStatus}
                      </span>
                      <b>
                        {stock.onHand.toLocaleString()} <small>{stock.unit}</small>
                      </b>
                      <small>
                        가용 {stock.available.toLocaleString()} · 할당 {stock.allocated.toLocaleString()} · {Math.round((stock.onHand / stock.unitsPerPallet) * 100) / 100} 파레트
                      </small>
                    </span>
                  </div>
                  {stockAction ? <div className="wmp-stock-actions">{stockAction(stock)}</div> : null}
                </div>
              ))
            )}
          </div>

          {footer ? <div className="wmp-foot">{footer}</div> : null}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------
   무게 — 칸 허용 하중 대비 지금 올라간 무게 · 랙 파레트 규격
------------------------------------------------------------ */
const LoadStrip = ({ detail }: { detail: NonNullable<WarehouseMapState["detail"]> }) => {
  const limit = detail.maxLoadKg;
  // 내림 — 한도 아래인데 반올림으로 100% 가 보이지 않게
  const pct = limit ? Math.floor((detail.loadKg / limit) * 100) : 0;
  const over = limit != null && detail.loadKg > limit + 1e-6;
  return (
    <div className="wmp-load">
      <div className="wmp-load-top">
        <span>무게</span>
        <b className={over ? "is-over" : ""}>
          {formatKg(detail.loadKg)}
          <small>{limit != null ? ` / ${formatKg(limit)} kg · ${pct}%` : " kg · 하중 제한 없음"}</small>
        </b>
      </div>
      {limit != null ? (
        <div className={`nx-bar ${over ? "is-danger" : barTone(pct)}`}>
          <i style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      ) : null}
      {detail.rack ? (
        <small className="wmp-load-spec">
          파레트 {detail.rack.palletSpec} · 허용 하중{" "}
          {detail.location.maxWeightKg != null
            ? `이 칸 지정 (랙 기준 ${detail.rack.maxLoadKg != null ? `${formatKg(detail.rack.maxLoadKg)}kg` : "없음"})`
            : "랙 기준"}
        </small>
      ) : null}
      {over ? <small className="wmp-load-warn">허용 하중을 넘었습니다 — 무거운 재고를 아래 단으로 옮기세요</small> : null}
    </div>
  );
};
