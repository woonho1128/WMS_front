import { useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { QrBox } from "../../components/ui/QrBox";
import { apiGet } from "../../services/http";
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
  available: number;
};

type HistoryRow = {
  createdAt: string;
  transferNo: string;
  type: string;
  itemCode: string;
  lotNo: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  qty: number;
  status: string;
  reason: string | null;
  createdBy: string | null;
};

type TraceResult = { stocks: StockRow[]; history: HistoryRow[] };

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "info" | "danger" | "warning" | "violet" }> = {
  AVAILABLE: { label: "가용", tone: "success" },
  PUTAWAY_WAIT: { label: "격납대기", tone: "info" },
  DEFECT: { label: "불량", tone: "danger" },
  RESERVED: { label: "예약", tone: "warning" },
  MOVING: { label: "이동중", tone: "violet" }
};

/** 바코드 조회 — QR/바코드(LOT·SKU)로 입고일자·LOT·현재 위치·이동이력 추적 */
export const BarcodeLookupPage = () => {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<TraceResult>(`/stocks/trace?q=${encodeURIComponent(q)}`);
      setResult(res);
      setSearched(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setResult(null);
      setSearched(q);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="outbound-page">
      <DashboardCard className="outbound-filter-card" title="QR / 바코드 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>QR/바코드 스캔 (LOT 또는 SKU)</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="예: LOT-IN-20260606-003 / SKU-10822 — 스캔 또는 입력 후 Enter"
            />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-primary" disabled={loading} onClick={search}>스캔 조회</button>
          </div>
        </div>
      </DashboardCard>

      {error ? (
        <div className="ds-callout danger" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      ) : null}

      {searched && result ? (
        <>
          <DashboardCard className="outbound-table-card" title={`현재 재고 위치 (${result.stocks.length}건)`}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ border: "1px solid var(--line, #ddd)", borderRadius: 8, padding: 10, background: "#fff" }}>
                <QrBox value={searched} size={84} />
                <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>{searched}</div>
              </div>
              <p className="outbound-notice" style={{ flex: 1, minWidth: 220 }}>
                {result.stocks.length === 0
                  ? "현재 보유 재고가 없습니다 (출고/이동으로 소진되었을 수 있음 — 아래 이동 이력 참조)."
                  : "LOT/품목의 현재 위치와 입고일자입니다."}
              </p>
            </div>
            {result.stocks.length > 0 && (
              <div className="pc-only">
                <table className="outbound-table">
                  <thead>
                    <tr>
                      <th>창고</th>
                      <th>구역</th>
                      <th>로케이션</th>
                      <th>SKU</th>
                      <th>품목명</th>
                      <th>LOT</th>
                      <th>입고일자</th>
                      <th className="num">현재고</th>
                      <th className="num">가용</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stocks.map((r, idx) => {
                      const meta = STATUS_LABEL[r.stockStatus];
                      return (
                        <tr key={idx}>
                          <td>
                            {r.warehouseName}
                            {r.warehouseType === "외주" ? <span className="outbound-consign-tag">외주</span> : null}
                          </td>
                          <td>{r.zoneName}</td>
                          <td><b>{r.locationCode}</b></td>
                          <td>{r.itemCode}</td>
                          <td>{r.itemName}</td>
                          <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.lotNo}</td>
                          <td>{r.receivedDate ?? "-"}</td>
                          <td className="num">{r.onHand.toLocaleString()}</td>
                          <td className="num">{r.available.toLocaleString()}</td>
                          <td>{meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : r.stockStatus}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>

          <DashboardCard className="outbound-table-card" title={`이동 이력 (${result.history.length}건)`}>
            <div className="pc-only">
              <table className="outbound-table">
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>이동번호</th>
                    <th>유형</th>
                    <th>LOT</th>
                    <th>출발</th>
                    <th>도착</th>
                    <th className="num">수량</th>
                    <th>사유</th>
                    <th>처리자</th>
                  </tr>
                </thead>
                <tbody>
                  {result.history.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>이동 이력이 없습니다.</td></tr>
                  ) : (
                    result.history.map((h, idx) => (
                      <tr key={idx}>
                        <td>{h.createdAt}</td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{h.transferNo}</td>
                        <td><StatusBadge tone={h.type === "격납" ? "info" : h.type === "보충" ? "violet" : "gray"}>{h.type}</StatusBadge></td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{h.lotNo ?? "-"}</td>
                        <td>{h.fromLocation ?? "-"}</td>
                        <td>{h.toLocation ?? "-"}</td>
                        <td className="num">{h.qty.toLocaleString()}</td>
                        <td>{h.reason ?? "-"}</td>
                        <td>{h.createdBy ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </>
      ) : (
        <DashboardCard className="outbound-table-card" title="안내">
          <p className="outbound-notice">QR/바코드를 스캔하거나 LOT·SKU를 입력하면 입고일자, 현재 로케이션, 격납/보충/이동 이력을 추적합니다.</p>
        </DashboardCard>
      )}
    </section>
  );
};
