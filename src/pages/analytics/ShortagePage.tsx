import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type ShortageRow = {
  itemCode: string;
  itemName: string;
  unit: string;
  safetyStock: number;
  leadTime: number;
  available: number;
  out30: number;
  avgDailyOut: number;
  reorderPoint: number;
  daysOfStock: number | null;
  shortageEta: string | null;
  risk: string; // 위험/주의/정상
};

const RISK_TONE: Record<string, "danger" | "warning" | "success"> = {
  위험: "danger",
  주의: "warning",
  정상: "success"
};

/** 쇼트 관리 — 평균출고량·안전재고·발주시점·쇼트예상일 + 재고부족 알림 */
export const ShortagePage = () => {
  const [rows, setRows] = useState<ShortageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<ShortageRow[]>("/analytics/shortage")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(
    () => (riskFilter ? rows.filter((r) => r.risk === riskFilter) : rows),
    [rows, riskFilter]
  );

  const summary = useMemo(
    () => ({
      danger: rows.filter((r) => r.risk === "위험").length,
      warning: rows.filter((r) => r.risk === "주의").length,
      ok: rows.filter((r) => r.risk === "정상").length
    }),
    [rows]
  );

  const exportCsv = () =>
    downloadCsv(
      `쇼트관리_${new Date().toISOString().slice(0, 10)}`,
      ["SKU", "품목명", "평균일출고", "안전재고", "현재가용", "발주시점", "리드타임", "잔여재고일수", "쇼트예상일", "위험도"],
      filtered.map((r) => [
        r.itemCode, r.itemName, r.avgDailyOut, r.safetyStock, r.available, r.reorderPoint,
        r.leadTime, r.daysOfStock ?? "", r.shortageEta ?? "", r.risk
      ])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="쇼트 요약">
        <article className="app-surface outbound-summary-card"><span>위험 (안전재고 이하)</span><strong style={{ color: "var(--c-danger)" }}>{summary.danger}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>주의 (발주시점 이하)</span><strong>{summary.warning}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>정상</span><strong>{summary.ok}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="쇼트 관리 (평균출고량·안전재고·발주시점)">
        <div className="outbound-filter-grid">
          <label>
            <span>위험도</span>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              <option value="">전체</option>
              <option value="위험">위험</option>
              <option value="주의">주의</option>
              <option value="정상">정상</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      {summary.danger > 0 ? (
        <div className="ds-callout danger" style={{ marginBottom: 12 }}>
          <span>재고부족 알림 — <b>{summary.danger}개 품목</b>이 안전재고 이하입니다. 발주가 필요합니다.</span>
        </div>
      ) : null}

      <DashboardCard className="outbound-table-card" title={`쇼트 예상 품목 (${filtered.length}건)`}>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>품목명</th>
                <th className="num">평균일출고</th>
                <th className="num">안전재고</th>
                <th className="num">현재 가용</th>
                <th className="num">발주시점</th>
                <th className="num">잔여재고일수</th>
                <th>쇼트 예상일</th>
                <th>위험도</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>해당 위험도의 품목이 없습니다.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.itemCode} className={r.risk === "위험" ? "row-warning" : ""}>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td className="num">{r.avgDailyOut.toLocaleString()} {r.unit}</td>
                    <td className="num">{r.safetyStock.toLocaleString()}</td>
                    <td className="num"><b>{r.available.toLocaleString()}</b></td>
                    <td className="num">{r.reorderPoint.toLocaleString()}</td>
                    <td className="num">{r.daysOfStock != null ? `${r.daysOfStock}일` : "—"}</td>
                    <td>{r.shortageEta ?? "출고 없음"}</td>
                    <td><StatusBadge tone={RISK_TONE[r.risk] ?? "gray"}>{r.risk}</StatusBadge></td>
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
