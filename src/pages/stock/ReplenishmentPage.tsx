import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type ReplenishRow = {
  itemCode: string;
  itemName: string;
  unit: string;
  safetyStock: number;
  pickingAvail: number;
  shortQty: number;
  suggestQty: number;
  sourceStockId: number;
  sourceLocationCode: string;
  sourceLot: string;
  sourceReceivedDate: string | null;
  targetLocationId: number;
  targetLocationCode: string;
};

const REPLENISH_STEPS = [
  { key: "detect", label: "부족 감지" },
  { key: "fifo", label: "FIFO 추천" },
  { key: "qr", label: "QR 검증" },
  { key: "done", label: "보충 완료" }
];

/** 보충 작업 — 피킹재고 부족 자동감지 + FIFO 추천 + 출발/도착 QR 검증 + 보충 이동 */
export const ReplenishmentPage = () => {
  const [rows, setRows] = useState<ReplenishRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 보충 처리 모달
  const [target, setTarget] = useState<ReplenishRow | null>(null);
  const [qty, setQty] = useState(0);
  const [fromQr, setFromQr] = useState("");
  const [toQr, setToQr] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<ReplenishRow[]>("/stocks/replenishment")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const summary = useMemo(
    () => ({
      count: rows.length,
      totalShort: rows.reduce((acc, r) => acc + r.shortQty, 0),
      totalSuggest: rows.reduce((acc, r) => acc + r.suggestQty, 0)
    }),
    [rows]
  );

  const openModal = (row: ReplenishRow) => {
    setTarget(row);
    setQty(row.suggestQty);
    setFromQr("");
    setToQr("");
  };

  const fromOk = target != null && fromQr.trim().toUpperCase() === target.sourceLocationCode.toUpperCase();
  const toOk = target != null && toQr.trim().toUpperCase() === target.targetLocationCode.toUpperCase();

  const doComplete = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await apiPost("/stocks/replenishment/complete", {
        sourceStockId: target.sourceStockId,
        toLocationId: target.targetLocationId,
        qty
      });
      setNotice(`${target.itemCode} 보충 완료 — ${target.sourceLocationCode} → ${target.targetLocationCode} ${qty.toLocaleString()}${target.unit} (LOT ${target.sourceLot})`);
      setTarget(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "보충 실패");
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="보충 작업 단계"
        steps={REPLENISH_STEPS}
        current={1}
        note="피킹 가용재고 < 안전재고 자동감지 → 보충(RESERVE) 재고 FIFO 추천 → 출발/도착 QR 검증 → 보충 이동"
      />

      <section className="outbound-summary-grid" aria-label="보충 요약">
        <article className="app-surface outbound-summary-card"><span>보충 대상 품목</span><strong>{summary.count}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>부족 수량 합계</span><strong>{summary.totalShort.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>보충 제안 합계</span><strong>{summary.totalSuggest.toLocaleString()}</strong></article>
      </section>

      <DashboardCard className="outbound-table-card" title={`보충 대상 (${rows.length}건) — 자동 감지`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ?? "피킹 로케이션 가용재고가 안전재고 미만인 품목입니다. FIFO(입고일 오름차순) LOT이 출발지로 추천됩니다."}
          </p>
          <div className="outbound-expand-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
          </div>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
          </div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>품목명</th>
                <th className="num">피킹 가용</th>
                <th className="num">안전재고</th>
                <th className="num">부족</th>
                <th>출발 (FIFO 추천)</th>
                <th>도착 (피킹)</th>
                <th className="num">보충 제안</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>보충 대상이 없습니다 — 모든 품목의 피킹 가용재고가 안전재고 이상입니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.itemCode}-${r.sourceStockId}`}>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td className="num is-short">{r.pickingAvail.toLocaleString()}</td>
                    <td className="num">{r.safetyStock.toLocaleString()}</td>
                    <td className="num"><b>{r.shortQty.toLocaleString()}</b></td>
                    <td>
                      <b>{r.sourceLocationCode}</b>
                      <div className="cell-mut" style={{ fontSize: 12 }}>
                        {r.sourceLot}{r.sourceReceivedDate ? ` · ${r.sourceReceivedDate}` : ""}
                      </div>
                    </td>
                    <td><b>{r.targetLocationCode}</b></td>
                    <td className="num">{r.suggestQty.toLocaleString()} {r.unit}</td>
                    <td>
                      <div className="outbound-row-actions">
                        <button type="button" className="btn-secondary" disabled={busy} onClick={() => openModal(r)}>보충</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <Modal
        open={target !== null}
        title="보충 이동"
        desc={target ? `${target.itemCode} · ${target.sourceLocationCode} → ${target.targetLocationCode}` : ""}
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTarget(null)}>취소</button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !fromOk || !toOk || qty <= 0}
              title={!fromOk || !toOk ? "출발/도착 로케이션 QR을 모두 확인하세요" : undefined}
              onClick={doComplete}
            >
              보충 완료
            </button>
          </>
        }
      >
        {target ? (
          <>
            <label className="ds-field">
              <span>보충 수량 (제안 {target.suggestQty.toLocaleString()}{target.unit})</span>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <label className="ds-field" style={{ marginTop: 10 }}>
              <span>출발 로케이션 QR 확인 ({target.sourceLocationCode})</span>
              <input value={fromQr} onChange={(e) => setFromQr(e.target.value)} placeholder={`"${target.sourceLocationCode}" 스캔/입력`} />
            </label>
            <label className="ds-field" style={{ marginTop: 10 }}>
              <span>도착 로케이션 QR 확인 ({target.targetLocationCode})</span>
              <input value={toQr} onChange={(e) => setToQr(e.target.value)} placeholder={`"${target.targetLocationCode}" 스캔/입력`} />
            </label>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <StatusBadge tone={fromOk ? "success" : "gray"}>출발 {fromOk ? "확인" : "대기"}</StatusBadge>
              <StatusBadge tone={toOk ? "success" : "gray"}>도착 {toOk ? "확인" : "대기"}</StatusBadge>
            </div>
            {fromOk && toOk ? (
              <div className="ds-callout info" style={{ marginTop: 8 }}>
                <Icon name="check" size={18} />
                <span>QR 검증 완료 — LOT <b>{target.sourceLot}</b>이(가) 피킹 로케이션으로 이동하며 보충 이력이 기록됩니다.</span>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </section>
  );
};
