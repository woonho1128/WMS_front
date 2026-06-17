import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type AgingRow = {
  itemCode: string;
  itemName: string;
  warehouseName: string;
  locationCode: string;
  lotNo: string;
  receivedDate: string | null;
  agingDays: number;
  qty: number;
  unitPrice: number;
  amount: number;
  longTerm: boolean;
};

const THRESHOLDS = [
  { key: 0, label: "전체" },
  { key: 30, label: "30일+" },
  { key: 60, label: "60일+" },
  { key: 365, label: "1년+ (장기)" }
];

/** 장기재고 관리 — 입고 후 경과일 + 재고금액, 1년 미출고 강조 */
export const AgingStockPage = () => {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<AgingRow[]>("/analytics/aging")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => rows.filter((r) => r.agingDays >= threshold), [rows, threshold]);

  const summary = useMemo(() => {
    const longTerm = rows.filter((r) => r.longTerm);
    const totalAmount = filtered.reduce((a, r) => a + r.amount, 0);
    return {
      total: filtered.length,
      longTerm: longTerm.length,
      longTermAmount: longTerm.reduce((a, r) => a + r.amount, 0),
      totalAmount
    };
  }, [rows, filtered]);

  const exportCsv = () =>
    downloadCsv(
      `장기재고_${new Date().toISOString().slice(0, 10)}`,
      ["SKU", "품목명", "창고", "로케이션", "LOT", "입고일", "경과일", "재고수량", "단가", "재고금액", "장기여부"],
      filtered.map((r) => [
        r.itemCode, r.itemName, r.warehouseName, r.locationCode, r.lotNo, r.receivedDate ?? "",
        r.agingDays, r.qty, r.unitPrice, r.amount, r.longTerm ? "장기(1년+)" : ""
      ])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="장기재고 요약">
        <article className="app-surface outbound-summary-card"><span>대상 LOT</span><strong>{summary.total}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>장기재고(1년+)</span><strong>{summary.longTerm}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>장기재고 금액</span><strong>₩{summary.longTermAmount.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>조회 재고금액</span><strong>₩{summary.totalAmount.toLocaleString()}</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="장기재고 조회 (입고 후 경과일 기준)">
        <div className="outbound-filter-grid">
          <label>
            <span>경과일 기준</span>
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
              {THRESHOLDS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`장기재고 목록 (${filtered.length}건)`}>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>품목명</th>
                <th>창고/로케이션</th>
                <th>LOT</th>
                <th>입고일</th>
                <th className="num">경과일</th>
                <th className="num">재고수량</th>
                <th className="num">재고금액</th>
                <th>구분</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>해당 기준의 재고가 없습니다.</td></tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={`${r.itemCode}-${r.lotNo}-${idx}`} className={r.longTerm ? "row-warning" : ""}>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.warehouseName} / {r.locationCode}</td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.lotNo}</td>
                    <td>{r.receivedDate ?? "-"}</td>
                    <td className="num"><b>{r.agingDays.toLocaleString()}</b>일</td>
                    <td className="num">{r.qty.toLocaleString()}</td>
                    <td className="num">₩{r.amount.toLocaleString()}</td>
                    <td>{r.longTerm ? <StatusBadge tone="danger">장기(1년+)</StatusBadge> : <StatusBadge tone="gray">일반</StatusBadge>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </section>
  );
};
