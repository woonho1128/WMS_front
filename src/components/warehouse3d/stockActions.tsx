import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../services/http";
import { useAuthStore } from "../../app/store/authStore";
import { useUiStore } from "../../app/store/uiStore";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import {
  LOCATION_TYPE_LABEL,
  formatKg,
  type LayoutSlot,
  type MapSelection,
  type ReplenishSuggestion,
  type SlotDetail,
  type SlotStock
} from "./types";
import type { WarehouseMapState } from "./useWarehouseMap";
import "./stockActions.css";

/* ============================================================
   3D 맵에서 하는 재고 작업 — 이동 · 조정 · 보충
   재고 이동 › 3D 탭과 대시보드(우클릭 메뉴)가 같은 규칙·같은 창을 쓴다.
   ============================================================ */

/** 이동·보충 — 현장 작업자 포함 */
export const STOCK_MOVE_ROLES = ["admin", "logistics", "inventory", "inbound", "outbound"];
/** 수량 조정 — 관리자급만 (DOCS/WMS_3D창고맵_설계.md §7) */
export const STOCK_ADJUST_ROLES = ["admin", "logistics", "inventory"];

const ADJUST_REASONS = [
  { code: "COUNT_DIFF", label: "실사 차이" },
  { code: "DAMAGE", label: "파손" },
  { code: "LOSS", label: "분실" },
  { code: "MISRECEIVE", label: "오입고" },
  { code: "ETC", label: "기타" }
];

const isBadType = (type: string) => type === "DEFECT" || type === "DAMAGED";
const round2 = (value: number) => Math.round(value * 100) / 100;

export const movableQty = (stock: Pick<SlotStock, "stockStatus" | "available" | "onHand">) =>
  stock.stockStatus === "AVAILABLE" ? stock.available : stock.onHand;

/** 도착 칸에 옮길 수 있는 최대 수량 — 남은 파레트 자리와 남은 허용 하중 중 작은 쪽 */
const limitsFor = (stock: SlotStock, to: Pick<LayoutSlot, "capacity" | "pallets" | "loadKg" | "maxLoadKg">) => {
  const upp = stock.unitsPerPallet || 1;
  const free = Math.max(to.capacity - to.pallets, 0);
  const byCapacity = Math.floor(free * upp + 1e-6);
  const freeKg = to.maxLoadKg == null ? null : Math.max(to.maxLoadKg - to.loadKg, 0);
  const byWeight = freeKg == null || !(stock.unitWeightKg > 0) ? Number.POSITIVE_INFINITY : Math.floor(freeKg / stock.unitWeightKg + 1e-6);
  const max = Math.max(Math.min(movableQty(stock), byCapacity, byWeight), 0);
  return { upp, free: round2(free), byCapacity, freeKg: freeKg == null ? null : round2(freeKg), byWeight, max };
};

type Toast = { tone: "success" | "danger" | "info"; text: string } | null;
type MoveDraft = { from: LayoutSlot; to: LayoutSlot; stocks: SlotStock[]; stockId: number; qty: number; reason: string };
type AdjustDraft = { code: string; stock: SlotStock; newQty: number; reasonCode: string; memo: string; confirmLarge: boolean };
type ReplenishDraft = { suggestion: ReplenishSuggestion; target: LayoutSlot | null; qty: number; max: number };

export const useStockActions = (map: WarehouseMapState, options: { onChanged?: () => void } = {}) => {
  const role = useUiStore((state) => state.currentRole);
  const operator = useAuthStore((state) => state.user?.id ?? "system");
  const canMove = STOCK_MOVE_ROLES.includes(role);
  const canAdjust = STOCK_ADJUST_ROLES.includes(role);
  const { onChanged } = options;

  const [pending, setPending] = useState<{ from: LayoutSlot; stock: SlotStock | null } | null>(null);
  const [move, setMove] = useState<MoveDraft | null>(null);
  const [adjust, setAdjust] = useState<AdjustDraft | null>(null);
  const [replenish, setReplenish] = useState<ReplenishDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const slotById = useMemo(() => new Map((map.layout?.slots ?? []).map((slot) => [slot.locationId, slot])), [map.layout]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  /** 서버 규칙을 화면에서 먼저 흉내 낸다 — 최종 판정은 서버 */
  const dropCheck = useCallback((from: LayoutSlot, to: LayoutSlot): string | null => {
    if (!to.active) return `${to.code} 는 사용중지된 로케이션입니다`;
    if (isBadType(from.locationType) !== isBadType(to.locationType)) {
      return isBadType(from.locationType)
        ? "불량 재고는 불량·파손 로케이션으로만 옮길 수 있습니다"
        : "가용 재고는 불량·파손 로케이션으로 옮길 수 없습니다";
    }
    if (to.capacity - to.pallets <= 0.001) return `빈 자리가 없습니다 (${to.pallets}/${to.capacity} 파레트)`;
    if (to.maxLoadKg != null && to.maxLoadKg - to.loadKg <= 0.001) return `허용 하중이 찼습니다 (${formatKg(to.loadKg)}/${formatKg(to.maxLoadKg)}kg)`;
    return null;
  }, []);

  const openMove = useCallback(
    async (from: LayoutSlot, to: LayoutSlot, preferredStockId?: number) => {
      if (!canMove) {
        setToast({ tone: "danger", text: "재고 이동 권한이 없습니다" });
        return;
      }
      try {
        const detail = await apiGet<SlotDetail>(`/locations/${from.locationId}/detail`);
        const stocks = detail.stocks.filter((stock) => movableQty(stock) > 0);
        if (!stocks.length) {
          setToast({ tone: "danger", text: `${from.code} 에 옮길 수 있는 재고가 없습니다 (할당·격납대기 제외)` });
          return;
        }
        const chosen = stocks.find((stock) => stock.stockId === preferredStockId) ?? stocks[0];
        setMove({ from, to, stocks, stockId: chosen.stockId, qty: limitsFor(chosen, to).max, reason: "" });
      } catch (err) {
        setToast({ tone: "danger", text: err instanceof Error ? err.message : "재고 조회 실패" });
      }
    },
    [canMove]
  );

  const onDropSlot = useCallback((from: LayoutSlot, to: LayoutSlot) => void openMove(from, to), [openMove]);

  /** 옮길 재고를 정하고 도착 칸 클릭을 기다린다 (태블릿·우클릭 메뉴) */
  const beginMove = useCallback(
    (from: LayoutSlot, stock: SlotStock | null = null) => {
      if (!canMove) {
        setToast({ tone: "danger", text: "재고 이동 권한이 없습니다" });
        return;
      }
      setPending({ from, stock });
    },
    [canMove]
  );

  const cancelMove = useCallback(() => setPending(null), []);

  /** 대기 중이면 클릭한 칸을 도착으로 쓰고 true — 아니면 false 를 돌려 평소 선택으로 */
  const interceptSelection = useCallback(
    (next: MapSelection) => {
      if (!pending || next.locationId == null || next.locationId === pending.from.locationId) return false;
      const to = slotById.get(next.locationId);
      if (!to) return true;
      const reason = dropCheck(pending.from, to);
      if (reason) {
        setToast({ tone: "danger", text: reason });
        return true;
      }
      void openMove(pending.from, to, pending.stock?.stockId);
      setPending(null);
      return true;
    },
    [pending, slotById, dropCheck, openMove]
  );

  const afterChange = useCallback(
    async (selectId?: number) => {
      await map.refresh();
      if (selectId != null) map.selectLocation(selectId, { focus: false });
      onChanged?.();
    },
    [map, onChanged]
  );

  const moveStock = move?.stocks.find((stock) => stock.stockId === move.stockId) ?? null;
  const moveLimits = move && moveStock ? limitsFor(moveStock, move.to) : null;

  const submitMove = async () => {
    if (!move || !moveStock || !moveLimits || move.qty <= 0 || move.qty > moveLimits.max) return;
    setBusy(true);
    try {
      const res = await apiPost<{ transferNo: string }>("/transfers/move", {
        sourceStockId: moveStock.stockId,
        toLocationId: move.to.locationId,
        qty: move.qty,
        reason: move.reason.trim() || "3D 맵 이동",
        operator
      });
      setToast({ tone: "success", text: `이동 완료 ${res.transferNo} — ${moveStock.itemName} ${move.qty.toLocaleString()} ${moveStock.unit} · ${move.from.code} → ${move.to.code}` });
      const targetId = move.to.locationId;
      setMove(null);
      await afterChange(targetId);
    } catch (err) {
      setToast({ tone: "danger", text: err instanceof Error ? err.message : "이동 실패" });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 조정 ---------- */
  const openAdjust = useCallback(
    (stock: SlotStock, code: string) => {
      if (!canAdjust) {
        setToast({ tone: "danger", text: "재고 조정 권한이 없습니다 (관리자·물류·재고 담당)" });
        return;
      }
      setAdjust({ code, stock, newQty: stock.onHand, reasonCode: "", memo: "", confirmLarge: false });
    },
    [canAdjust]
  );

  const adjustDiff = adjust ? adjust.newQty - adjust.stock.onHand : 0;
  const adjustLarge = adjust ? Math.abs(adjustDiff) >= (adjust.stock.unitsPerPallet || 1) : false;
  const adjustError = !adjust
    ? null
    : adjustDiff === 0
      ? "수량 변화가 없습니다"
      : adjust.newQty < adjust.stock.allocated
        ? `출고 할당 수량(${adjust.stock.allocated})보다 적게 조정할 수 없습니다`
        : !adjust.reasonCode
          ? "조정 사유를 선택하세요"
          : adjust.reasonCode === "ETC" && !adjust.memo.trim()
            ? "기타 사유는 메모가 필요합니다"
            : adjustLarge && !adjust.confirmLarge
              ? "1파레트 이상 조정은 확인이 필요합니다"
              : null;

  const submitAdjust = async () => {
    if (!adjust || adjustError) return;
    setBusy(true);
    try {
      const res = await apiPost<{ transferNo: string; diff: number }>("/stocks/adjust", {
        stockId: adjust.stock.stockId,
        newQty: adjust.newQty,
        reasonCode: adjust.reasonCode,
        memo: adjust.memo.trim(),
        operator
      });
      setToast({ tone: "success", text: `조정 완료 ${res.transferNo} — ${adjust.stock.itemName} ${res.diff > 0 ? "+" : ""}${res.diff.toLocaleString()} ${adjust.stock.unit}` });
      setAdjust(null);
      await afterChange();
    } catch (err) {
      setToast({ tone: "danger", text: err instanceof Error ? err.message : "조정 실패" });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 보충 ---------- */
  const openReplenish = useCallback(
    (suggestion: ReplenishSuggestion) => {
      if (!canMove) {
        setToast({ tone: "danger", text: "보충 권한이 없습니다" });
        return;
      }
      if (suggestion.sourceStockId == null) {
        setToast({ tone: "danger", text: "보관 구역에 같은 품목 재고가 없어 보충할 수 없습니다" });
        return;
      }
      const target = suggestion.targetLocationId != null ? slotById.get(suggestion.targetLocationId) ?? null : null;
      const upp = suggestion.unitsPerPallet || 1;
      const byCapacity = target ? Math.floor(Math.max(target.capacity - target.pallets, 0) * upp + 1e-6) : Number.POSITIVE_INFINITY;
      const byWeight =
        target && target.maxLoadKg != null && suggestion.unitWeightKg > 0
          ? Math.floor(Math.max(target.maxLoadKg - target.loadKg, 0) / suggestion.unitWeightKg + 1e-6)
          : Number.POSITIVE_INFINITY;
      const max = Math.max(Math.min(suggestion.sourceAvail, byCapacity, byWeight), 0);
      setReplenish({ suggestion, target, qty: Math.min(suggestion.suggestQty, max), max });
    },
    [canMove, slotById]
  );

  const submitReplenish = async () => {
    if (!replenish || replenish.qty <= 0 || replenish.qty > replenish.max) return;
    const { suggestion } = replenish;
    setBusy(true);
    try {
      const res = await apiPost<{ transferNo: string }>("/stocks/replenish", {
        sourceStockId: suggestion.sourceStockId,
        toLocationId: suggestion.targetLocationId,
        qty: replenish.qty,
        operator
      });
      setToast({
        tone: "success",
        text: `보충 완료 ${res.transferNo} — ${suggestion.itemName} ${replenish.qty.toLocaleString()} ${suggestion.unit} · ${suggestion.sourceLocationCode} → ${suggestion.pickingLocationCode}`
      });
      setReplenish(null);
      await afterChange(suggestion.targetLocationId ?? undefined);
    } catch (err) {
      setToast({ tone: "danger", text: err instanceof Error ? err.message : "보충 실패" });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 화면 ---------- */
  const pendingBanner = pending ? (
    <div className="sa-pending">
      <Icon name="move" size={15} />
      <span>
        <b>{pending.from.code}</b>
        {pending.stock ? ` 의 ${pending.stock.itemName}` : ""} — 도착 칸을 클릭하세요
      </span>
      <button type="button" onClick={cancelMove}>
        취소 <kbd>Esc</kbd>
      </button>
    </div>
  ) : null;

  const layer = (
    <>
      {toast ? (
        <div className={`ds-callout ${toast.tone} sa-toast`} role="status">
          <Icon name={toast.tone === "success" ? "checkCircle" : toast.tone === "danger" ? "alert" : "bell"} size={17} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="닫기">
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : null}

      {/* 이동 */}
      <Modal
        open={move !== null}
        title="재고 이동"
        desc={move ? `${move.from.code} → ${move.to.code}` : ""}
        icon="move"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary)"
        onClose={() => !busy && setMove(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMove(null)} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={submitMove}
              disabled={busy || !moveLimits || !move || move.qty <= 0 || move.qty > moveLimits.max}
            >
              {busy ? "처리 중…" : "이동 확정"}
            </button>
          </>
        }
      >
        {move && moveStock && moveLimits ? (
          <div className="sa-form">
            <div className="sa-route">
              <SlotChip
                label="출발"
                code={move.from.code}
                type={move.from.locationType}
                before={move.from.pallets}
                after={round2(move.from.pallets - move.qty / moveLimits.upp)}
                capacity={move.from.capacity}
                load={{ before: move.from.loadKg, after: move.from.loadKg - move.qty * moveStock.unitWeightKg, max: move.from.maxLoadKg }}
              />
              <Icon name="arrowR" size={18} />
              <SlotChip
                label="도착"
                code={move.to.code}
                type={move.to.locationType}
                before={move.to.pallets}
                after={round2(move.to.pallets + move.qty / moveLimits.upp)}
                capacity={move.to.capacity}
                load={{ before: move.to.loadKg, after: move.to.loadKg + move.qty * moveStock.unitWeightKg, max: move.to.maxLoadKg }}
              />
            </div>
            <div className="sa-field">
              <span>옮길 재고</span>
              <div className="sa-stock-list">
                {move.stocks.map((stock) => (
                  <label key={stock.stockId} className={`sa-stock${stock.stockId === move.stockId ? " is-on" : ""}`}>
                    <input
                      type="radio"
                      name="sa-move-stock"
                      checked={stock.stockId === move.stockId}
                      onChange={() => setMove({ ...move, stockId: stock.stockId, qty: limitsFor(stock, move.to).max })}
                    />
                    <span>
                      <b>{stock.itemName}</b>
                      <small>
                        {stock.lotNo} · 입고 {stock.receivedDate} · 이동 가능 {movableQty(stock).toLocaleString()} {stock.unit}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sa-field">
              <span>
                이동 수량 <small>최대 {moveLimits.max.toLocaleString()} {moveStock.unit}</small>
              </span>
              <div className="sa-qty">
                <Stepper value={move.qty} min={0} max={moveLimits.max} onChange={(qty) => setMove({ ...move, qty })} />
                <button type="button" className="btn-secondary" onClick={() => setMove({ ...move, qty: moveLimits.max })}>
                  최대
                </button>
              </div>
              <p className="sa-hint">
                도착 칸 여유 {moveLimits.free} 파레트 = {moveLimits.byCapacity.toLocaleString()} {moveStock.unit} (파레트당 {moveLimits.upp})
                {moveLimits.freeKg != null && Number.isFinite(moveLimits.byWeight)
                  ? ` · 허용 하중 여유 ${formatKg(moveLimits.freeKg)}kg = ${moveLimits.byWeight.toLocaleString()} ${moveStock.unit} (단위당 ${moveStock.unitWeightKg}kg)`
                  : ""}
                {moveLimits.max < movableQty(moveStock)
                  ? moveLimits.byWeight < moveLimits.byCapacity
                    ? " — 나머지는 무게 한도 때문에 옮길 수 없습니다"
                    : " — 나머지는 자리가 없어 옮길 수 없습니다"
                  : ""}
              </p>
            </div>
            <label className="ds-field">
              <span>사유 (선택)</span>
              <input value={move.reason} onChange={(event) => setMove({ ...move, reason: event.target.value })} placeholder="예: 피킹 동선 재배치" />
            </label>
            <div className={`ds-callout ${moveStock.warehouseType === "외주" ? "warning" : "info"} sa-note`}>
              <Icon name="alert" size={15} />
              <span>
                {moveStock.warehouseType === "외주" ? "외주 재고 이동 — ERP로 전송하지 않습니다." : "일반 재고 이동 — 확정하면 이동 이력이 남고 ERP 반영 대상이 됩니다."}
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 조정 */}
      <Modal
        open={adjust !== null}
        title="재고 조정"
        desc={adjust ? `${adjust.code} · ${adjust.stock.itemName}` : ""}
        icon="sliders"
        iconBg="var(--c-warning-bg)"
        iconColor="var(--c-warning)"
        onClose={() => !busy && setAdjust(null)}
        footer={
          <>
            <span className="sa-foot-msg">{adjustError ?? ""}</span>
            <button type="button" className="btn-secondary" onClick={() => setAdjust(null)} disabled={busy}>
              취소
            </button>
            <button type="button" className="btn-primary" onClick={submitAdjust} disabled={busy || Boolean(adjustError)}>
              {busy ? "처리 중…" : "조정 확정"}
            </button>
          </>
        }
      >
        {adjust ? (
          <div className="sa-form">
            <div className="sa-item">
              <b>{adjust.stock.itemName}</b>
              <small>
                {adjust.stock.itemCode} · {adjust.stock.lotNo} · 할당 {adjust.stock.allocated.toLocaleString()}
              </small>
            </div>
            <div className="sa-adjust-qty">
              <div>
                <span>현재 수량</span>
                <b>{adjust.stock.onHand.toLocaleString()}</b>
              </div>
              <Icon name="arrowR" size={18} />
              <div>
                <span>조정 후</span>
                <Stepper
                  value={adjust.newQty}
                  min={adjust.stock.allocated}
                  max={adjust.stock.onHand + adjust.stock.unitsPerPallet * 5}
                  onChange={(newQty) => setAdjust({ ...adjust, newQty, confirmLarge: false })}
                />
              </div>
              <div className={`sa-diff${adjustDiff > 0 ? " is-plus" : adjustDiff < 0 ? " is-minus" : ""}`}>
                <span>차이</span>
                <b>
                  {adjustDiff > 0 ? "+" : ""}
                  {adjustDiff.toLocaleString()}
                </b>
              </div>
            </div>
            <div className="sa-field">
              <span>
                조정 사유 <small className="sa-req">필수</small>
              </span>
              <div className="sa-chips">
                {ADJUST_REASONS.map((reason) => (
                  <button
                    key={reason.code}
                    type="button"
                    className={`sa-chip${adjust.reasonCode === reason.code ? " is-on" : ""}`}
                    onClick={() => setAdjust({ ...adjust, reasonCode: reason.code })}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="ds-field">
              <span>메모 {adjust.reasonCode === "ETC" ? "(필수)" : "(선택)"}</span>
              <textarea rows={2} value={adjust.memo} onChange={(event) => setAdjust({ ...adjust, memo: event.target.value })} placeholder="예: 실사 결과 2박스 부족 확인" />
            </label>
            {adjustLarge ? (
              <label className="ds-callout danger sa-large">
                <input type="checkbox" checked={adjust.confirmLarge} onChange={(event) => setAdjust({ ...adjust, confirmLarge: event.target.checked })} />
                <span>
                  <b>
                    1파레트({adjust.stock.unitsPerPallet} {adjust.stock.unit}) 이상
                  </b>{" "}
                  조정입니다. 수량을 다시 확인했습니다.
                </span>
              </label>
            ) : null}
            <div className={`ds-callout ${adjust.stock.warehouseType === "외주" ? "warning" : "info"} sa-note`}>
              <Icon name="alert" size={15} />
              <span>
                {adjust.stock.warehouseType === "외주" ? "외주 재고는 조정 결과를 ERP로 전송하지 않습니다." : "조정 결과는 재고 이동 이력(조정)에 남고 ERP 반영 대상이 됩니다."}
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 보충 */}
      <Modal
        open={replenish !== null}
        title="피킹 로케이션 보충"
        desc={replenish ? `${replenish.suggestion.sourceLocationCode} → ${replenish.suggestion.pickingLocationCode}` : ""}
        icon="layers"
        iconBg="var(--c-violet-bg)"
        iconColor="var(--c-violet)"
        onClose={() => !busy && setReplenish(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReplenish(null)} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={submitReplenish}
              disabled={busy || !replenish || replenish.qty <= 0 || replenish.qty > replenish.max}
            >
              {busy ? "처리 중…" : "보충 확정"}
            </button>
          </>
        }
      >
        {replenish ? (
          <div className="sa-form">
            <div className="sa-item">
              <b>{replenish.suggestion.itemName}</b>
              <small>
                {replenish.suggestion.itemCode} · 파레트당 {replenish.suggestion.unitsPerPallet} {replenish.suggestion.unit}
              </small>
            </div>
            <div className="sa-route">
              <div className="sa-slot">
                <span>출발 · 보충 로케이션 (선입선출)</span>
                <b>{replenish.suggestion.sourceLocationCode}</b>
                <small>
                  {replenish.suggestion.sourceLot} · 입고 {replenish.suggestion.sourceReceivedDate} · 가용 {replenish.suggestion.sourceAvail.toLocaleString()}
                </small>
              </div>
              <Icon name="arrowR" size={18} />
              <div className="sa-slot">
                <span>도착 · 피킹 로케이션</span>
                <b>{replenish.suggestion.pickingLocationCode}</b>
                <small>
                  {replenish.suggestion.pickingQty.toLocaleString()} → <em>{(replenish.suggestion.pickingQty + replenish.qty).toLocaleString()}</em> {replenish.suggestion.unit}
                </small>
              </div>
            </div>
            <div className="ds-callout info sa-note">
              <Icon name="layers" size={15} />
              <span>
                지금 {replenish.suggestion.wholePallets} 파레트 + 낱개 {replenish.suggestion.looseQty} {replenish.suggestion.unit} — <b>{replenish.suggestion.shortQty}</b> {replenish.suggestion.unit} 채우면 파레트 단위가 맞습니다.
              </span>
            </div>
            <div className="sa-field">
              <span>
                보충 수량 <small>최대 {replenish.max.toLocaleString()} {replenish.suggestion.unit}</small>
              </span>
              <div className="sa-qty">
                <Stepper value={replenish.qty} min={0} max={replenish.max} onChange={(qty) => setReplenish({ ...replenish, qty })} />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReplenish({ ...replenish, qty: Math.min(replenish.suggestion.shortQty, replenish.max) })}
                >
                  제안 {Math.min(replenish.suggestion.shortQty, replenish.max)}
                </button>
              </div>
              {replenish.max < replenish.suggestion.shortQty ? (
                <p className="sa-hint">보관 재고·칸 자리·허용 하중 중 모자란 것이 있어 제안 수량을 다 채울 수 없습니다.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );

  return {
    canMove,
    canAdjust,
    pending,
    pendingBanner,
    dropCheck,
    onDropSlot,
    beginMove,
    cancelMove,
    interceptSelection,
    openAdjust,
    openReplenish,
    notify: setToast,
    layer
  };
};

export type StockActions = ReturnType<typeof useStockActions>;

/* ------------------------------------------------------------ */

const SlotChip = ({
  label,
  code,
  type,
  before,
  after,
  capacity,
  load
}: {
  label: string;
  code: string;
  type: LayoutSlot["locationType"];
  before: number;
  after: number;
  capacity: number;
  load?: { before: number; after: number; max: number | null };
}) => (
  <div className="sa-slot">
    <span>{label}</span>
    <b>{code}</b>
    <small>
      {LOCATION_TYPE_LABEL[type]} · {before} → <em>{Math.max(after, 0)}</em> / {capacity} 파레트
    </small>
    {load ? (
      <small className={load.max != null && load.after > load.max + 1e-6 ? "sa-load is-over" : "sa-load"}>
        무게 {formatKg(load.before)} → <em>{formatKg(Math.max(load.after, 0))}</em>
        {load.max != null ? ` / ${formatKg(load.max)}` : ""} kg
      </small>
    ) : null}
  </div>
);

const Stepper = ({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) => {
  const clamp = (next: number) => Math.min(Math.max(Math.round(next), min), max);
  return (
    <div className="sa-stepper">
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label="감소">
        <Icon name="minus" size={14} />
      </button>
      <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(clamp(Number(event.target.value) || 0))} />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label="증가">
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
};
