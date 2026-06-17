import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type PeriodRow = { period: string; cnt: number; qty: number };
type ItemRow = { itemCode: string; itemName: string; cnt: number; qty: number };
type SummaryResult = { periodRows: PeriodRow[]; itemRows: ItemRow[] };

type Props = {
  endpoint: string; // "inbound-summary" | "outbound-summary"
  label: string;    // "입고" | "출고"
};

const PERIODS: { key: string; label: string }[] = [
  { key: "day", label: "일별" },
  { key: "week", label: "주별" },
  { key: "month", label: "월별" }
];

/** 입고/출고 집계 공용 — 기간별(일/주/월) + 품목별 */
export const SummaryPage = ({ endpoint, label }: Props) => {
  const [period, setPeriod] = useState("day");
  const [data, setData] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<SummaryResult>(`/analytics/${endpoint}?period=${period}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [endpoint, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const periodRows = data?.periodRows ?? [];
    const totalQty = periodRows.reduce((a, r) => a + r.qty, 0);
    const totalCnt = periodRows.reduce((a, r) => a + r.cnt, 0);
    return { totalQty, totalCnt, buckets: periodRows.length };
  }, [data]);

  const maxQty = useMemo(
    () => Math.max(1, ...(data?.periodRows ?? []).map((r) => r.qty)),
    [data]
  );

  const exportCsv = () =>
    downloadCsv(
      `${label}집계_${period}_${new Date().toISOString().slice(0, 10)}`,
      ["기간", "건수", "수량"],
      (data?.periodRows ?? []).map((r) => [r.period, r.cnt, r.qty])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label={`${label} 집계 요약`}>
        <article className="app-surface outbound-summary-card"><span>{label} 건수 (확정)</span><strong>{totals.totalCnt}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>{label} 수량 합계</span><strong>{totals.totalQty.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>집계 구간</span><strong>{totals.buckets}개</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title={`${label} 집계 조건`}>
        <div className="outbound-filter-grid">
          <label>
            <span>집계 단위</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={!data || data.periodRows.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      {error ? (
        <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="summary-grid">
        <DashboardCard className="outbound-table-card" title={`기간별 ${label} (${PERIODS.find((p) => p.key === period)?.label})`}>
          <div className="pc-only">
            <table className="outbound-table">
              <thead>
                <tr><th>기간</th><th className="num">건수</th><th className="num">수량</th><th>추이</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
                ) : (data?.periodRows.length ?? 0) === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>집계 데이터가 없습니다.</td></tr>
                ) : (
                  data!.periodRows.map((r) => (
                    <tr key={r.period}>
                      <td>{r.period}</td>
                      <td className="num">{r.cnt}</td>
                      <td className="num"><b>{r.qty.toLocaleString()}</b></td>
                      <td style={{ width: 160 }}>
                        <div style={{ background: "var(--c-info)", height: 10, borderRadius: 5, width: `${Math.round((r.qty / maxQty) * 100)}%`, minWidth: 4 }} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DashboardCard>

        <DashboardCard className="outbound-table-card" title={`품목별 ${label}`}>
          <div className="pc-only">
            <table className="outbound-table">
              <thead>
                <tr><th>SKU</th><th>품목명</th><th className="num">건수</th><th className="num">수량</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
                ) : (data?.itemRows.length ?? 0) === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>집계 데이터가 없습니다.</td></tr>
                ) : (
                  data!.itemRows.map((r) => (
                    <tr key={r.itemCode}>
                      <td>{r.itemCode}</td>
                      <td>{r.itemName}</td>
                      <td className="num">{r.cnt}</td>
                      <td className="num"><b>{r.qty.toLocaleString()}</b></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DashboardCard>
      </div>
    </section>
  );
};
