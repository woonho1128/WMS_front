import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

export type ReturnRow = {
  id: number;
  returnNo: string;
  omsOrderNo: string | null;
  customerCode: string | null;
  customerName: string | null;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  reason: string | null;
  manager: string | null;
  warehouseName: string;
  locationCode: string | null;
  status: string; // received/approved/rejected
  rejectReason: string | null;
  receivedAt: string | null;
  processedAt: string | null;
};

export const RETURN_STATUS: Record<string, { label: string; tone: "gray" | "success" | "danger" }> = {
  received: { label: "수신", tone: "gray" },
  approved: { label: "승인", tone: "success" },
  rejected: { label: "반려", tone: "danger" }
};

/** 반품 예정 — OMS 반품오더 자동수신 내역 조회 (승인/반려는 반품 확정 화면) */
export const ReturnSchedulePage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<ReturnRow[]>("/returns")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.status !== "received") return false;
      if (kw) {
        const hay = [r.returnNo, r.omsOrderNo, r.manager, r.customerName, r.itemCode, r.itemName]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      return true;
    });
  }, [rows, keyword]);

  const summary = useMemo(
    () => ({
      received: rows.filter((r) => r.status === "received").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length
    }),
    [rows]
  );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="반품 요약">
        <article className="app-surface outbound-summary-card"><span>수신(처리 대기)</span><strong>{summary.received}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>승인</span><strong>{summary.approved}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>반려</span><strong>{summary.rejected}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="반품 예정 조회 (OMS 자동수신)">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (오더번호/담당자)</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="반품번호 / OMS 오더번호 / 담당자 / 거래처 / 품목"
            />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={() => navigate("/inbound/return-confirm")}>
              반품 확정 화면으로
            </button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`수신 반품 오더 (${filtered.length}건)`}>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
          </div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>반품번호</th>
                <th>OMS 오더번호</th>
                <th>거래처</th>
                <th>품목</th>
                <th className="num">수량</th>
                <th>반품사유</th>
                <th>영업담당자</th>
                <th>입고 예정 위치</th>
                <th>수신일시</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>수신 상태의 반품 오더가 없습니다.</td></tr>
              ) : (
                filtered.map((r) => {
                  const st = RETURN_STATUS[r.status] ?? { label: r.status, tone: "gray" as const };
                  return (
                    <tr key={r.id}>
                      <td>{r.returnNo}</td>
                      <td>{r.omsOrderNo ?? "-"}</td>
                      <td>{`${r.customerCode ?? ""}${r.customerCode ? " / " : ""}${r.customerName ?? "-"}`}</td>
                      <td>{r.itemCode} · {r.itemName}</td>
                      <td className="num">{r.qty.toLocaleString()} {r.unit}</td>
                      <td>{r.reason ?? "-"}</td>
                      <td>{r.manager ?? "-"}</td>
                      <td>{r.warehouseName} / {r.locationCode ?? "-"}</td>
                      <td>{r.receivedAt ?? "-"}</td>
                      <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </section>
  );
};
