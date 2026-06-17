import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type TransferRow = {
  id: number;
  transferNo: string;
  itemCode: string;
  itemName: string;
  fromWarehouse: string;
  toWarehouse: string;
  fromLocation: string | null;
  toLocation: string | null;
  qty: number;
  type: string; // 격납/보충/일반→일반/외주→외주/조정
  lotNo: string | null;
  erpLinked: boolean;
  status: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

const typeTone = (t: string): "info" | "violet" | "gray" | "teal" => {
  if (t === "격납") return "info";
  if (t === "보충") return "violet";
  if (t === "조정") return "teal";
  return "gray";
};

/** 재고 이동 이력 — 격납·보충·일반이동·조정 */
export const TransferHistoryPage = () => {
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState(() => shiftDays(-30));
  const [dateTo, setDateTo] = useState(() => shiftDays(1));

  const load = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (type) qs.set("type", type);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    if (keyword.trim()) qs.set("keyword", keyword.trim());
    apiGet<TransferRow[]>(`/history/transfer?${qs.toString()}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [type, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.type))), [rows]);

  const exportCsv = () =>
    downloadCsv(
      `재고이동이력_${new Date().toISOString().slice(0, 10)}`,
      ["일시", "이동번호", "유형", "품목", "LOT", "출발", "도착", "수량", "ERP", "처리자", "사유"],
      rows.map((r) => [
        r.createdAt, r.transferNo, r.type, `${r.itemCode} ${r.itemName}`, r.lotNo ?? "",
        `${r.fromWarehouse}/${r.fromLocation ?? "-"}`, `${r.toWarehouse}/${r.toLocation ?? "-"}`,
        r.qty, r.erpLinked ? "연동" : "미연동", r.createdBy ?? "", r.reason ?? ""
      ])
    );

  return (
    <section className="outbound-page">
      <DashboardCard className="outbound-filter-card" title="재고 이동 이력 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (이동번호/품목/LOT/로케이션)</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") load(); }}
              placeholder="검색어 입력 후 Enter"
            />
          </label>
          <label>
            <span>이동 유형</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">전체</option>
              <option value="격납">격납</option>
              <option value="보충">보충</option>
              <option value="일반→일반">일반→일반</option>
              <option value="외주→외주">외주→외주</option>
              <option value="조정">조정(실사)</option>
            </select>
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

      <DashboardCard className="outbound-table-card" title={`이동 이력 (${rows.length}건)${types.length ? ` · 유형 ${types.join(", ")}` : ""}`}>
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
                <th>이동번호</th>
                <th>유형</th>
                <th>품목</th>
                <th>LOT</th>
                <th>출발</th>
                <th>도착</th>
                <th className="num">수량</th>
                <th>ERP</th>
                <th>처리자</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>조건에 맞는 이동 이력이 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.createdAt}</td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.transferNo}</td>
                    <td><StatusBadge tone={typeTone(r.type)}>{r.type}</StatusBadge></td>
                    <td>{r.itemCode} · {r.itemName}</td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.lotNo ?? "-"}</td>
                    <td>{r.fromWarehouse}{r.fromLocation ? ` / ${r.fromLocation}` : ""}</td>
                    <td>{r.toWarehouse}{r.toLocation ? ` / ${r.toLocation}` : ""}</td>
                    <td className="num">{r.qty.toLocaleString()}</td>
                    <td>{r.erpLinked ? <StatusBadge tone="success">연동</StatusBadge> : <StatusBadge tone="gray">미연동</StatusBadge>}</td>
                    <td>{r.createdBy ?? "-"}</td>
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
