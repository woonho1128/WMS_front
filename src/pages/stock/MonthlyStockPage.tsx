import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet, apiPost } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type SnapRow = {
  snapshotMonth: string;
  itemCode: string;
  itemName: string;
  warehouseName: string;
  wmsQty: number;
  erpQty: number | null;
  diff: number; // wms - erp
  capturedAt: string;
};

const curMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const MonthlyStockPage = () => {
  const [months, setMonths] = useState<string[]>([]);
  const [selMonth, setSelMonth] = useState("");
  const [rows, setRows] = useState<SnapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMonths = (preferred?: string) => {
    apiGet<string[]>("/snapshots/months")
      .then((m) => {
        setMonths(m);
        const pick = preferred && m.includes(preferred) ? preferred : m[0] ?? "";
        setSelMonth(pick);
        if (!pick) setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "조회 실패"); setLoading(false); });
  };
  useEffect(() => loadMonths(), []);

  useEffect(() => {
    if (!selMonth) { setRows([]); return; }
    setLoading(true);
    setError(null);
    apiGet<SnapRow[]>(`/snapshots?month=${selMonth}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, [selMonth]);

  const summary = useMemo(() => {
    const wms = rows.reduce((a, r) => a + r.wmsQty, 0);
    const erp = rows.reduce((a, r) => a + (r.erpQty ?? r.wmsQty), 0);
    const mismatch = rows.filter((r) => r.diff !== 0).length;
    return { wms, erp, mismatch };
  }, [rows]);

  const doCapture = async () => {
    const m = curMonth();
    setBusy(true);
    try {
      await apiPost("/snapshots/capture", { month: m });
      setNotice(`${m} 월말 스냅샷 생성 완료 (현재고 기준)`);
      loadMonths(m);
    } catch (e) { setNotice(e instanceof Error ? e.message : "스냅샷 생성 실패"); }
    finally { setBusy(false); }
  };

  const exportCsv = () =>
    downloadCsv(
      `월말재고_${selMonth}`,
      ["기준월", "창고", "SKU", "품목명", "WMS재고", "ERP재고", "차이"],
      rows.map((r) => [r.snapshotMonth, r.warehouseName, r.itemCode, r.itemName, r.wmsQty, r.erpQty ?? "", r.diff])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="월말 재고 요약">
        <article className="app-surface outbound-summary-card"><span>WMS 재고 합계</span><strong>{summary.wms.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>ERP 재고 합계</span><strong>{summary.erp.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>불일치 품목</span><strong style={{ color: summary.mismatch ? "var(--c-danger)" : undefined }}>{summary.mismatch}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="월말 재고 조회 (ERP 비교)">
        <div className="outbound-filter-grid">
          <label>
            <span>기준월</span>
            <select value={selMonth} onChange={(e) => setSelMonth(e.target.value)}>
              {months.length === 0 ? <option value="">스냅샷 없음</option> : null}
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={doCapture}>당월 스냅샷 생성</button>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`월말 재고 ${selMonth ? `(${selMonth})` : ""} · ${rows.length}건`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "월말 자동 스냅샷과 ERP 보고 재고를 비교합니다. 차이 발생 품목은 실사·조정 대상입니다."}</p>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>기준월</th>
                <th>창고</th>
                <th>SKU</th>
                <th>품목명</th>
                <th className="num">WMS 재고</th>
                <th className="num">ERP 재고</th>
                <th className="num">차이</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>스냅샷이 없습니다. "당월 스냅샷 생성"으로 현재고를 캡처하세요.</td></tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.itemCode}-${r.warehouseName}-${idx}`} className={r.diff !== 0 ? "row-warning" : ""}>
                    <td>{r.snapshotMonth}</td>
                    <td>{r.warehouseName}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td className="num">{r.wmsQty.toLocaleString()}</td>
                    <td className="num">{r.erpQty != null ? r.erpQty.toLocaleString() : "-"}</td>
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
