import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type StockRow = {
  itemCode: string;
  itemName: string;
  warehouseName: string;
  warehouseType: string;
  zoneName: string;
  locationCode: string;
  locationType: string;
  lotNo: string;
  stockStatus: string;
  receivedDate: string | null;
  onHand: number;
  allocated: number;
  available: number;
  safetyStock: number;
};

const LOC_TYPE_LABEL: Record<string, string> = {
  PICKING: "피킹",
  RESERVE: "보충",
  DEFECT: "불량",
  DAMAGED: "파손"
};

/** 가용 재고 조회 — 가용(AVAILABLE) 상태 재고만 창고/로케이션/품목/LOT 차원으로 조회 */
export const AvailableStockPage = () => {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selWarehouse, setSelWarehouse] = useState("전체");
  const [selLocation, setSelLocation] = useState("전체");
  const [keyword, setKeyword] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<StockRow[]>("/stocks")
      .then((all) => setRows(all.filter((r) => r.stockStatus === "AVAILABLE" && r.available > 0)))
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const warehouses = useMemo(
    () => ["전체", ...Array.from(new Set(rows.map((r) => r.warehouseName)))],
    [rows]
  );
  const locations = useMemo(() => {
    const scoped = rows.filter((r) => selWarehouse === "전체" || r.warehouseName === selWarehouse);
    return ["전체", ...Array.from(new Set(scoped.map((r) => r.locationCode)))];
  }, [rows, selWarehouse]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (selWarehouse !== "전체" && r.warehouseName !== selWarehouse) return false;
      if (selLocation !== "전체" && r.locationCode !== selLocation) return false;
      if (kw) {
        const hay = [r.itemCode, r.itemName, r.lotNo, r.locationCode].map((v) => v.toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      return true;
    });
  }, [rows, selWarehouse, selLocation, keyword]);

  const summary = useMemo(() => {
    const totalAvail = filtered.reduce((acc, r) => acc + r.available, 0);
    const skus = new Set(filtered.map((r) => r.itemCode));
    const lots = new Set(filtered.map((r) => r.lotNo));
    return { totalAvail, skuCount: skus.size, lotCount: lots.size };
  }, [filtered]);

  const exportCsv = () =>
    downloadCsv(
      `가용재고_${new Date().toISOString().slice(0, 10)}`,
      ["창고", "구역", "로케이션", "로케이션유형", "SKU", "품목명", "LOT", "입고일", "가용수량"],
      filtered.map((r) => [
        r.warehouseName, r.zoneName, r.locationCode, LOC_TYPE_LABEL[r.locationType] ?? r.locationType,
        r.itemCode, r.itemName, r.lotNo, r.receivedDate ?? "", r.available
      ])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="가용재고 요약">
        <article className="app-surface outbound-summary-card"><span>가용재고 합계</span><strong>{summary.totalAvail.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>SKU 수</span><strong>{summary.skuCount}종</strong></article>
        <article className="app-surface outbound-summary-card"><span>LOT 수</span><strong>{summary.lotCount}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="가용 재고 조회 (창고/로케이션/품목/LOT)">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="SKU / 품목명 / LOT / 로케이션"
            />
          </label>
          <label>
            <span>창고</span>
            <select value={selWarehouse} onChange={(e) => { setSelWarehouse(e.target.value); setSelLocation("전체"); }}>
              {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label>
            <span>로케이션</span>
            <select value={selLocation} onChange={(e) => setSelLocation(e.target.value)}>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>
              엑셀 다운로드
            </button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`가용 재고 목록 (${filtered.length}건)`}>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
          </div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>창고</th>
                <th>구역</th>
                <th>로케이션</th>
                <th>유형</th>
                <th>SKU</th>
                <th>품목명</th>
                <th>LOT</th>
                <th>입고일</th>
                <th className="num">가용수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>조건에 맞는 가용재고가 없습니다.</td></tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={`${r.itemCode}-${r.locationCode}-${r.lotNo}-${idx}`}>
                    <td>
                      {r.warehouseName}
                      {r.warehouseType === "외주" ? <span className="outbound-consign-tag">외주</span> : null}
                    </td>
                    <td>{r.zoneName}</td>
                    <td>{r.locationCode}</td>
                    <td><StatusBadge tone={r.locationType === "PICKING" ? "info" : "gray"}>{LOC_TYPE_LABEL[r.locationType] ?? r.locationType}</StatusBadge></td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.lotNo}</td>
                    <td>{r.receivedDate ?? "-"}</td>
                    <td className="num"><b>{r.available.toLocaleString()}</b></td>
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
