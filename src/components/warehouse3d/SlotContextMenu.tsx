import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiGet } from "../../services/http";
import { Icon } from "../ui/Icon";
import { movableQty, type StockActions } from "./stockActions";
import {
  LOCATION_TYPE_LABEL,
  TYPE_LEGEND,
  formatKg,
  isOverweight,
  type LayoutSlot,
  type SlotContext,
  type SlotOrder,
  type SlotStock
} from "./types";
import "./slotMenu.css";

/* ============================================================
   슬롯 우클릭(길게 누르기) 메뉴
   · 카드: 무엇이 몇 개 있는지
   · 보충: 파레트 구성 기준으로 부족하면 FIFO 출발지와 함께 제안
   · 피킹·출고는 주문 단위라 여기서 수량을 빼지 않는다 → 피킹 대기 주문으로 연결
   · 이동·조정은 권한이 있을 때만
   ============================================================ */

type Props = {
  slot: LayoutSlot;
  /** 맵 안에서의 위치(px) — 화면 밖으로 나가면 안쪽으로 당긴다 */
  point: { x: number; y: number };
  actions: StockActions;
  onClose: () => void;
  onOpenOrder: (order: SlotOrder, locationCode: string) => void;
  onShowItem?: (stock: SlotStock) => void;
  onFocus?: () => void;
  /** 바깥에서 데이터가 바뀌면 다시 읽도록 */
  reloadKey?: number;
};

const STATUS_TONE: Record<string, string> = { AVAILABLE: "success", DEFECT: "danger", PUTAWAY_WAIT: "warning" };
const STATUS_LABEL: Record<string, string> = { AVAILABLE: "가용", DEFECT: "불량", PUTAWAY_WAIT: "격납대기" };

export const SlotContextMenu = ({ slot, point, actions, onClose, onOpenOrder, onShowItem, onFocus, reloadKey }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SlotContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ left: point.x, top: point.y });

  useEffect(() => {
    let alive = true;
    setError(null);
    apiGet<SlotContext>(`/locations/${slot.locationId}/context`)
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "조회 실패"));
    return () => {
      alive = false;
    };
  }, [slot.locationId, reloadKey]);

  // 맵 영역 안에 들어오도록 — 오른쪽·아래가 모자라면 커서 반대쪽으로 편다
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const margin = 8;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let left = point.x + 6;
    let top = point.y + 6;
    if (left + width + margin > parent.clientWidth) left = point.x - width - 6;
    if (top + height + margin > parent.clientHeight) top = parent.clientHeight - height - margin;
    // 마지막으로 맵 안에 가둔다 — 패널 버튼처럼 맵 밖 좌표로 열어도 보이게
    left = Math.min(Math.max(margin, left), Math.max(margin, parent.clientWidth - width - margin));
    top = Math.min(Math.max(margin, top), Math.max(margin, parent.clientHeight - height - margin));
    setPos({ left, top });
  }, [point.x, point.y, data, error]);

  // 바깥 클릭 · Esc 로 닫고, 방향키로 항목을 오간다
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (!data) return;
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }, [data]);

  const typeEntry = TYPE_LEGEND.find((entry) => entry.key === slot.locationType);
  const stocks = data?.stocks ?? [];
  const firstMovable = stocks.find((stock) => movableQty(stock) > 0) ?? null;
  const primary = stocks[0] ?? null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div className="scm" ref={ref} role="menu" aria-label={`${slot.code} 작업`} style={{ left: pos.left, top: pos.top }}>
      <header className="scm-head">
        <div className="scm-title">
          <b>{slot.code}</b>
          <span className="scm-type" style={{ color: typeEntry?.token, borderColor: typeEntry?.token }}>
            {LOCATION_TYPE_LABEL[slot.locationType]}
          </span>
          {!slot.active ? <span className="ds-badge gray">사용중지</span> : null}
        </div>
        <small>
          {data?.zone?.name ?? ""} {data?.rack ? `· ${data.rack.code} ${data.bay}연 ${data.level}단` : ""}
        </small>
        <div className="scm-meta">
          <span>
            적치 <b>{slot.pallets}</b> / {slot.capacity} 파레트
          </span>
          <span className={isOverweight(slot) ? "is-over" : ""}>
            무게 <b>{formatKg(slot.loadKg)}</b>
            {slot.maxLoadKg != null ? ` / ${formatKg(slot.maxLoadKg)}` : ""}kg
          </span>
          <span>
            90일 출고 <b>{slot.outFreq90}</b>회
          </span>
        </div>
      </header>

      {error ? <div className="scm-empty is-error">{error}</div> : null}
      {!data && !error ? <div className="scm-empty">불러오는 중…</div> : null}

      {data ? (
        <>
          <section className="scm-sec">
            {stocks.length === 0 ? (
              <div className="scm-empty">비어 있는 칸입니다</div>
            ) : (
              stocks.slice(0, 3).map((stock) => (
                <div key={stock.stockId} className="scm-stock">
                  <div className="scm-stock-top">
                    <b>{stock.itemName}</b>
                    <span className={`ds-badge ${STATUS_TONE[stock.stockStatus] ?? "gray"}`}>{STATUS_LABEL[stock.stockStatus] ?? stock.stockStatus}</span>
                  </div>
                  <small>
                    {stock.itemCode} · {stock.lotNo} · 입고 {stock.receivedDate}
                  </small>
                  <div className="scm-qty">
                    <span>
                      현재고 <b>{stock.onHand.toLocaleString()}</b>
                    </span>
                    <span>가용 {stock.available.toLocaleString()}</span>
                    <span>할당 {stock.allocated.toLocaleString()}</span>
                    <small>{stock.unit}</small>
                    {stocks.length > 1 && actions.canAdjust ? (
                      <button type="button" role="menuitem" className="scm-inline" onClick={run(() => actions.openAdjust(stock, slot.code))}>
                        조정
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {stocks.length > 3 ? <small className="scm-more">외 {stocks.length - 3}건</small> : null}
          </section>

          {data.replenishment ? (
            <section className="scm-sec scm-replenish">
              <div className="scm-alert">
                <Icon name="alert" size={14} />
                <span>
                  보충 필요 — <b>{data.replenishment.shortQty}</b> {data.replenishment.unit} 부족
                </span>
              </div>
              <small>
                {data.replenishment.pickingQty.toLocaleString()} {data.replenishment.unit} = {data.replenishment.wholePallets} 파레트 + 낱개 {data.replenishment.looseQty} · 파레트 구성 기준
              </small>
              {data.replenishment.sourceLocationCode ? (
                <button
                  type="button"
                  role="menuitem"
                  className="scm-primary"
                  disabled={!actions.canMove}
                  title={actions.canMove ? undefined : "보충 권한이 없습니다"}
                  onClick={run(() => actions.openReplenish(data.replenishment!))}
                >
                  <Icon name="layers" size={14} />
                  <span>
                    {data.replenishment.sourceLocationCode}에서 {data.replenishment.suggestQty} {data.replenishment.unit} 채우기
                    <small>선입선출 · {data.replenishment.sourceLot}</small>
                  </span>
                </button>
              ) : (
                <small className="scm-muted">보관 구역에 같은 품목 재고가 없어 보충할 수 없습니다</small>
              )}
            </section>
          ) : null}

          {data.orders.length ? (
            <section className="scm-sec">
              <div className="scm-sec-title">피킹 대기 주문 {data.orders.length}건</div>
              {data.orders.map((order) => (
                <button key={order.outboundId} type="button" role="menuitem" className="scm-order" onClick={run(() => onOpenOrder(order, slot.code))}>
                  <span className="scm-order-main">
                    <span>
                      <b>{order.outboundNo}</b>
                      <em className={order.status === "피킹중" ? "is-picking" : ""}>{order.status}</em>
                    </span>
                    <small>
                      {order.customerName} · {order.lines.map((line) => `${line.itemName} ${line.orderQty}${line.unit}`).join(", ")}
                    </small>
                  </span>
                  <Icon name="chevR" size={14} />
                </button>
              ))}
              <small className="scm-muted">피킹·출고는 주문 단위로 스캔 검증을 거칩니다 — 피킹 작업 화면에서 처리하세요</small>
            </section>
          ) : null}

          <section className="scm-sec scm-actions">
            <button
              type="button"
              role="menuitem"
              disabled={!firstMovable || !actions.canMove}
              title={!actions.canMove ? "재고 이동 권한이 없습니다" : !firstMovable ? "옮길 수 있는 재고가 없습니다 (할당·격납대기 제외)" : undefined}
              onClick={run(() => actions.beginMove(slot, firstMovable))}
            >
              <Icon name="move" size={14} />
              다른 칸으로 옮기기
            </button>
            {stocks.length <= 1 ? (
              <button
                type="button"
                role="menuitem"
                disabled={!primary || !actions.canAdjust}
                title={!actions.canAdjust ? "재고 조정 권한이 없습니다 (관리자·물류·재고 담당)" : !primary ? "조정할 재고가 없습니다" : undefined}
                onClick={run(() => primary && actions.openAdjust(primary, slot.code))}
              >
                <Icon name="sliders" size={14} />
                수량 조정
              </button>
            ) : null}
            {onShowItem ? (
              <button type="button" role="menuitem" disabled={!primary} onClick={run(() => primary && onShowItem(primary))}>
                <Icon name="search" size={14} />
                같은 품목 위치 모두 보기
              </button>
            ) : null}
            {onFocus ? (
              <button type="button" role="menuitem" onClick={run(onFocus)}>
                <Icon name="crosshair" size={14} />
                이 칸으로 확대
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
};
