import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type FifoRow = {
  itemCode: string;
  itemName: string;
  unit: string;
  lotNo: string;
  receivedDate: string | null;
  warehouseName: string;
  locationCode: string;
  qty: number;
  unitsPerPallet: number | null;
  pallets: number | null;
  fifoRank: number;
  priorityOut: boolean;
};

const daysSince = (d: string | null) => {
  if (!d) return null;
  const ms = Date.now() - new Date(d + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

/** 선입선출(FIFO) 현황 — 파레트 단위 관리용. 강제 출고가 아닌 우선출고 기준 정보 제공 */
export const FifoStatusPage = () => {
  const [rows, setRows] = useState<FifoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [onlyPriority, setOnlyPriority] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<FifoRow[]>("/stocks/fifo")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const view = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyPriority && !r.priorityOut) return false;
      if (kw && ![r.itemCode, r.itemName, r.lotNo, r.locationCode].some((v) => (v ?? "").toLowerCase().includes(kw))) return false;
      return true;
    });
  }, [rows, keyword, onlyPriority]);

  const summary = useMemo(() => {
    const items = new Set(rows.map((r) => r.itemCode));
    const totalPallets = rows.reduce((a, r) => a + (r.pallets ?? 0), 0);
    return { lots: rows.length, items: items.size, pallets: totalPallets, priority: rows.filter((r) => r.priorityOut).length };
  }, [rows]);

  const exportCsv = () =>
    downloadCsv(
      `선입선출현황_${new Date().toISOString().slice(0, 10)}`,
      ["SKU", "품목명", "입고일자", "경과일", "LOT", "창고", "로케이션", "수량", "파레트수", "FIFO순번", "우선출고"],
      view.map((r) => [r.itemCode, r.itemName, r.receivedDate ?? "", daysSince(r.receivedDate) ?? "", r.lotNo, r.warehouseName, r.locationCode, r.qty, r.pallets ?? "", r.fifoRank, r.priorityOut ? "Y" : ""])
    );

  return (
    <section className="outbound-page">
      <div className="ds-callout info" style={{ marginBottom: 16 }}>
        <Icon name="check" size={18} />
        <span>
          <b>파레트 단위 선입선출</b> 관리용 화면입니다. 시스템이 출고를 <b>강제 배정하지 않으며</b>, 입고일자 기준 우선출고 대상만 안내합니다. (현장은 파레트에 입고일자 라벨 부착)
        </span>
      </div>

      <section className="outbound-summary-grid" aria-label="선입선출 요약">
        <article className="app-surface outbound-summary-card"><span>대상 품목</span><strong>{summary.items}종</strong></article>
        <article className="app-surface outbound-summary-card"><span>LOT(파레트 그룹)</span><strong>{summary.lots}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>총 파레트(환산)</span><strong>{summary.pallets.toLocaleString()} PLT</strong></article>
        <article className="app-surface outbound-summary-card"><span>우선출고 대상</span><strong>{summary.priority}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="선입선출 현황 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="SKU / 품목명 / LOT / 로케이션" />
          </label>
          <label>
            <span>표시</span>
            <select value={onlyPriority ? "1" : "0"} onChange={(e) => setOnlyPriority(e.target.value === "1")}>
              <option value="0">전체</option>
              <option value="1">우선출고 대상만</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={view.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`선입선출 현황 (${view.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">품목별로 입고일자 오름차순 정렬 — FIFO 순번 1이 우선출고 대상입니다. 파레트 수는 파레트 구성수량 기준 환산값입니다.</p>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(18080) 확인</span></div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th className="num">FIFO</th>
                <th>SKU</th>
                <th>품목명</th>
                <th>입고일자</th>
                <th className="num">경과</th>
                <th>LOT</th>
                <th>창고</th>
                <th>로케이션</th>
                <th className="num">수량</th>
                <th className="num">파레트</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : view.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>표시할 재고가 없습니다.</td></tr>
              ) : (
                view.map((r) => {
                  const dd = daysSince(r.receivedDate);
                  return (
                    <tr key={`${r.itemCode}-${r.lotNo}-${r.locationCode}`} className={r.priorityOut ? "row-warning" : ""}>
                      <td className="num">
                        {r.priorityOut ? <StatusBadge tone="warning">1 · 우선</StatusBadge> : r.fifoRank}
                      </td>
                      <td>{r.itemCode}</td>
                      <td>{r.itemName}</td>
                      <td>{r.receivedDate ?? "-"}</td>
                      <td className="num">{dd != null ? `${dd}일` : "-"}</td>
                      <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{r.lotNo}</td>
                      <td>{r.warehouseName}</td>
                      <td><b>{r.locationCode}</b></td>
                      <td className="num">{r.qty.toLocaleString()} {r.unit}</td>
                      <td className="num">{r.pallets != null ? `${r.pallets} PLT` : "-"}</td>
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
