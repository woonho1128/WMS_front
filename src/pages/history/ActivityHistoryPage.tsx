import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type LogRow = {
  id: number;
  refType: string;
  refNo: string;
  action: string;
  detail: string | null;
  erpSent: boolean;
  operator: string | null;
  createdAt: string;
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

const actionTone = (action: string): "info" | "success" | "danger" | "violet" | "gray" => {
  if (action.includes("ERP")) return "violet";
  if (action.includes("확정")) return "success";
  if (action.includes("거부") || action.includes("반려")) return "danger";
  if (action.includes("피킹") || action.includes("승인") || action.includes("등록")) return "info";
  return "gray";
};

type Props = {
  /** "inbound" | "outbound" */
  endpoint: string;
  refLabel: string; // "입고번호" / "출하번호"
};

/** 입고/출고 처리 이력 (activity_log) 공용 화면 */
export const ActivityHistoryPage = ({ endpoint, refLabel }: Props) => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState(() => shiftDays(-30));
  const [dateTo, setDateTo] = useState(() => shiftDays(1));

  const load = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    if (keyword.trim()) qs.set("keyword", keyword.trim());
    apiGet<LogRow[]>(`/history/${endpoint}?${qs.toString()}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  // 최초 + 필터 변경 시 재조회
  useEffect(load, [endpoint, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const refs = new Set(rows.map((r) => r.refNo));
    const erp = rows.filter((r) => r.erpSent).length;
    return { logs: rows.length, refs: refs.size, erp };
  }, [rows]);

  const exportCsv = () =>
    downloadCsv(
      `${endpoint}_이력_${new Date().toISOString().slice(0, 10)}`,
      ["일시", refLabel, "처리구분", "내용", "ERP전송", "처리자"],
      rows.map((r) => [r.createdAt, r.refNo, r.action, r.detail ?? "", r.erpSent ? "Y" : "", r.operator ?? ""])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="이력 요약">
        <article className="app-surface outbound-summary-card"><span>이력 건수</span><strong>{summary.logs}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>대상 {refLabel}</span><strong>{summary.refs}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>ERP 전송</span><strong>{summary.erp}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="이력 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 ({refLabel}/처리구분/내용/처리자)</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") load(); }}
              placeholder="검색어 입력 후 Enter"
            />
          </label>
          <label>
            <span>시작일</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            <span>종료일</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>조회</button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={rows.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`처리 이력 (${rows.length}건)`}>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
          </div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>{refLabel}</th>
                <th>처리구분</th>
                <th>내용</th>
                <th>ERP전송</th>
                <th>처리자</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>조건에 맞는 이력이 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.createdAt}</td>
                    <td>{r.refNo}</td>
                    <td><StatusBadge tone={actionTone(r.action)}>{r.action}</StatusBadge></td>
                    <td>{r.detail ?? "-"}</td>
                    <td>{r.erpSent ? <StatusBadge tone="violet">전송</StatusBadge> : <span className="cell-mut">-</span>}</td>
                    <td>{r.operator ?? "-"}</td>
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
