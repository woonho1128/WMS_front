import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type CompareRow = {
  compareDate: string;
  itemCode: string;
  itemName: string;
  warehouseName: string;
  locationCode: string;
  lotNo: string;
  wmsQty: number;
  erpQty: number;
  diff: number; // wms - erp
};

/** ERP/WMS 시점 재고 비교 — 일별(과거 날짜 지정), 상품·로케이션·수량별 차이 확인 + 차이 알림 */
export const ErpComparePage = () => {
  const [dates, setDates] = useState<string[]>([]);
  const [selDate, setSelDate] = useState("");
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);

  useEffect(() => {
    apiGet<string[]>("/erp-compare/dates")
      .then((d) => { setDates(d); setSelDate(d[0] ?? ""); if (!d[0]) setLoading(false); })
      .catch((e) => { setError(e instanceof Error ? e.message : "조회 실패"); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selDate) { setRows([]); return; }
    setLoading(true);
    setError(null);
    apiGet<CompareRow[]>(`/erp-compare?date=${selDate}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, [selDate]);

  const summary = useMemo(() => {
    const mismatch = rows.filter((r) => r.diff !== 0);
    return {
      total: rows.length,
      match: rows.length - mismatch.length,
      mismatch: mismatch.length,
      absDiff: mismatch.reduce((a, r) => a + Math.abs(r.diff), 0)
    };
  }, [rows]);

  const view = useMemo(() => (onlyDiff ? rows.filter((r) => r.diff !== 0) : rows), [rows, onlyDiff]);

  const exportCsv = () =>
    downloadCsv(
      `ERP재고비교_${selDate}`,
      ["기준일", "SKU", "품목명", "창고", "로케이션", "LOT", "WMS재고", "ERP재고", "차이"],
      view.map((r) => [r.compareDate, r.itemCode, r.itemName, r.warehouseName, r.locationCode, r.lotNo, r.wmsQty, r.erpQty, r.diff])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="ERP 재고 비교 요약">
        <article className="app-surface outbound-summary-card"><span>비교 대상</span><strong>{summary.total}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>일치</span><strong style={{ color: "var(--c-success)" }}>{summary.match}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>불일치</span><strong style={{ color: summary.mismatch ? "var(--c-danger)" : undefined }}>{summary.mismatch}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>차이 수량(절대합)</span><strong>{summary.absDiff.toLocaleString()}</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="ERP 재고 비교 (일별·과거 날짜 조회)">
        <div className="outbound-filter-grid">
          <label>
            <span>기준일 (마감 시점)</span>
            <select value={selDate} onChange={(e) => setSelDate(e.target.value)}>
              {dates.length === 0 ? <option value="">데이터 없음</option> : null}
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>
            <span>표시</span>
            <select value={onlyDiff ? "1" : "0"} onChange={(e) => setOnlyDiff(e.target.value === "1")}>
              <option value="0">전체</option>
              <option value="1">차이 발생만</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={view.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      {summary.mismatch > 0 ? (
        <div className="ds-callout danger" style={{ marginBottom: 16 }}>
          <Icon name="check" size={18} />
          <span>
            <b>{selDate}</b> 기준 ERP와 재고 차이 <b>{summary.mismatch}건</b>이 발견되었습니다 — 상품·로케이션별 차이를 확인하고 일일 재고 실사·조정 대상으로 처리하세요.
          </span>
        </div>
      ) : null}

      <DashboardCard className="outbound-table-card" title={`재고 비교 ${selDate ? `(${selDate})` : ""} · ${view.length}건`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">매일 마감 시점 ERP 재고와 WMS 재고를 상품·로케이션 단위로 비교합니다. 과거 날짜를 선택해 비교 이력을 조회할 수 있습니다.</p>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(18080) 확인</span></div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>기준일</th>
                <th>SKU</th>
                <th>품목명</th>
                <th>창고</th>
                <th>로케이션</th>
                <th>LOT</th>
                <th className="num">WMS 재고</th>
                <th className="num">ERP 재고</th>
                <th className="num">차이</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : view.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>조건에 맞는 비교 데이터가 없습니다.</td></tr>
              ) : (
                view.map((r, idx) => (
                  <tr key={`${r.itemCode}-${r.locationCode}-${idx}`} className={r.diff !== 0 ? "row-warning" : ""}>
                    <td>{r.compareDate}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.warehouseName}</td>
                    <td><b>{r.locationCode}</b></td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.lotNo}</td>
                    <td className="num">{r.wmsQty.toLocaleString()}</td>
                    <td className="num">{r.erpQty.toLocaleString()}</td>
                    <td className={`num${r.diff !== 0 ? " is-short" : ""}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                    <td>{r.diff === 0 ? <StatusBadge tone="success">일치</StatusBadge> : <StatusBadge tone="danger">불일치</StatusBadge>}</td>
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
