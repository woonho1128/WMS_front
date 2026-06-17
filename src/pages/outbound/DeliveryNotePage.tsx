import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type DeliveryRow = {
  outboundNo: string;
  customerCode: string | null;
  customerName: string | null;
  shipAddress: string | null;
  carrierName: string | null;
  vehicleType: string | null;
  invoiceNo: string | null;
  qty: number;
  scheduledDate: string | null;
  dispatchDate: string | null;
};

export const DeliveryNotePage = () => {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(""); // 빈값=전체

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<DeliveryRow[]>(`/dispatch/deliveries${date ? `?date=${date}` : ""}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const qty = rows.reduce((a, r) => a + r.qty, 0);
    const assigned = rows.filter((r) => r.carrierName).length;
    return { count: rows.length, qty, assigned, pending: rows.length - assigned };
  }, [rows]);

  const exportCsv = () =>
    downloadCsv(
      `배송내역서_${date || "전체"}`,
      ["출하번호", "납품처코드", "납품처", "배송주소", "배송사", "차량", "송장번호", "출고수량", "출고예정일", "배차일"],
      rows.map((r) => [r.outboundNo, r.customerCode ?? "", r.customerName ?? "", r.shipAddress ?? "", r.carrierName ?? "", r.vehicleType ?? "", r.invoiceNo ?? "", r.qty, r.scheduledDate ?? "", r.dispatchDate ?? ""])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="배송 내역 요약">
        <article className="app-surface outbound-summary-card"><span>출고완료 건</span><strong>{summary.count}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>출고 수량</span><strong>{summary.qty.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>배차완료</span><strong>{summary.assigned}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>배차대기</span><strong>{summary.pending}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="배송 내역서 (일일 출고·배송·운송정보)">
        <div className="outbound-filter-grid">
          <label>
            <span>출고예정일</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={() => setDate("")}>전체</button>
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={rows.length === 0}>내역서 출력(엑셀)</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`배송 내역 (${rows.length}건)`}>
        {error ? (<div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr><th>출하번호</th><th>납품처</th><th>배송주소</th><th>배송사</th><th>차량</th><th>송장번호</th><th className="num">출고수량</th><th>출고예정일</th><th>배차일</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>출고완료 배송 내역이 없습니다.</td></tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.outboundNo}-${idx}`}>
                    <td><b>{r.outboundNo}</b></td>
                    <td>{`${r.customerCode ?? ""}${r.customerCode ? " / " : ""}${r.customerName ?? "-"}`}</td>
                    <td><span className="outbound-addr-cell" title={r.shipAddress ?? ""}>{r.shipAddress ?? "-"}</span></td>
                    <td>{r.carrierName ? <b>{r.carrierName}</b> : <StatusBadge tone="gray">미배차</StatusBadge>}</td>
                    <td>{r.vehicleType ? <StatusBadge tone="violet">{r.vehicleType}</StatusBadge> : "-"}</td>
                    <td>{r.invoiceNo ?? "-"}</td>
                    <td className="num">{r.qty.toLocaleString()}</td>
                    <td>{r.scheduledDate ?? "-"}</td>
                    <td>{r.dispatchDate ?? "-"}</td>
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
