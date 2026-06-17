import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet, apiPost, apiPut } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type CountRow = {
  id: number;
  countDate: string;
  warehouseName: string;
  locationCode: string;
  itemCode: string;
  itemName: string;
  lotNo: string;
  systemQty: number;
  countedQty: number;
  diff: number;
  status: string; // COUNTED / ADJUSTED
  memo: string | null;
  createdBy: string | null;
  adjustedAt: string | null;
};

type WarehouseOption = { id: number; name: string };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const StocktakingPage = () => {
  const [rows, setRows] = useState<CountRow[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selDate, setSelDate] = useState(today());
  const [selWh, setSelWh] = useState<number | "">("");
  const [edits, setEdits] = useState<Record<number, number>>({}); // id → countedQty 입력값

  const load = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (selDate) qs.set("countDate", selDate);
    if (selWh !== "") qs.set("warehouseId", String(selWh));
    Promise.all([
      apiGet<CountRow[]>(`/stocktakings?${qs.toString()}`),
      apiGet<string[]>("/stocktakings/dates")
    ])
      .then(([r, d]) => {
        setRows(r);
        setDates(d.includes(today()) ? d : [today(), ...d]);
        setEdits({});
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [selDate, selWh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiGet<WarehouseOption[]>("/warehouses").then(setWarehouses).catch(() => {});
  }, []);

  const summary = useMemo(() => {
    const counted = rows.filter((r) => r.status === "COUNTED");
    const diffs = counted.filter((r) => r.diff !== 0);
    const adjusted = rows.filter((r) => r.status === "ADJUSTED");
    return { total: rows.length, diffCount: diffs.length, adjusted: adjusted.length };
  }, [rows]);

  const doGenerate = async () => {
    setBusy(true);
    try {
      const created = await apiPost<number>("/stocktakings/generate", { warehouseId: selWh === "" ? null : selWh });
      setSelDate(today());
      setNotice(`오늘자 실사 ${created}건 생성 (이미 생성된 LOT 제외)`);
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "실사 생성 실패"); }
    finally { setBusy(false); }
  };

  const saveCount = async (r: CountRow) => {
    const v = edits[r.id];
    if (v == null || v === r.countedQty) return;
    try {
      await apiPut(`/stocktakings/${r.id}/count`, { countedQty: v, memo: r.memo });
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "입력 실패"); }
  };

  const doAdjust = async (r: CountRow) => {
    setBusy(true);
    try {
      await apiPost(`/stocktakings/${r.id}/adjust`, {});
      setNotice(`${r.itemCode} (LOT ${r.lotNo}) 재고조정 완료 — 차이 ${r.diff > 0 ? "+" : ""}${r.diff} 반영`);
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "조정 실패"); }
    finally { setBusy(false); }
  };

  const adjustAll = async () => {
    const targets = rows.filter((r) => r.status === "COUNTED" && r.diff !== 0);
    if (targets.length === 0) { setNotice("조정할 차이 건이 없습니다."); return; }
    setBusy(true);
    try {
      for (const r of targets) {
        await apiPost(`/stocktakings/${r.id}/adjust`, {});
      }
      setNotice(`차이 ${targets.length}건 일괄 재고조정 완료`);
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "일괄조정 실패"); }
    finally { setBusy(false); }
  };

  const exportCsv = () =>
    downloadCsv(
      `재고실사_${selDate}`,
      ["창고", "로케이션", "SKU", "품목명", "LOT", "전산수량", "실물수량", "차이", "상태"],
      rows.map((r) => [r.warehouseName, r.locationCode, r.itemCode, r.itemName, r.lotNo, r.systemQty, r.countedQty, r.diff, r.status === "ADJUSTED" ? "조정완료" : "실사중"])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="실사 요약">
        <article className="app-surface outbound-summary-card"><span>실사 건수</span><strong>{summary.total}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>차이 발생</span><strong style={{ color: summary.diffCount ? "var(--c-danger)" : undefined }}>{summary.diffCount}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>조정 완료</span><strong>{summary.adjusted}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="일일 재고 실사">
        <div className="outbound-filter-grid">
          <label>
            <span>실사일</span>
            <select value={selDate} onChange={(e) => setSelDate(e.target.value)}>
              {dates.map((d) => <option key={d} value={d}>{d}{d === today() ? " (오늘)" : ""}</option>)}
            </select>
          </label>
          <label>
            <span>창고</span>
            <select value={selWh} onChange={(e) => setSelWh(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">전체</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={doGenerate}>오늘 실사 생성</button>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>엑셀</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`실사 목록 (${rows.length}건) · ${selDate}`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "실물 수량을 입력하면 차이가 표시됩니다. 차이 건을 재고조정하면 재고에 반영되고 '조정' 이력이 남습니다."}</p>
          <div className="outbound-expand-actions">
            <button type="button" className="btn-secondary" disabled={busy || summary.diffCount === 0} onClick={adjustAll}>
              차이 {summary.diffCount}건 일괄조정
            </button>
          </div>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>창고</th>
                <th>로케이션</th>
                <th>SKU</th>
                <th>LOT</th>
                <th className="num">전산수량</th>
                <th className="num">실물수량</th>
                <th className="num">차이</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>실사 데이터가 없습니다. "오늘 실사 생성"으로 현재고를 스냅샷하세요.</td></tr>
              ) : (
                rows.map((r) => {
                  const editable = r.status === "COUNTED";
                  const cur = edits[r.id] ?? r.countedQty;
                  const diff = cur - r.systemQty;
                  return (
                    <tr key={r.id} className={editable && diff !== 0 ? "row-warning" : ""}>
                      <td>{r.warehouseName}</td>
                      <td>{r.locationCode}</td>
                      <td>{r.itemCode}<div style={{ fontSize: 12, color: "var(--ink-faint)" }}>{r.itemName}</div></td>
                      <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>{r.lotNo}</td>
                      <td className="num">{r.systemQty.toLocaleString()}</td>
                      <td className="num">
                        {editable ? (
                          <input
                            type="number"
                            min={0}
                            value={cur}
                            style={{ width: 88, textAlign: "right" }}
                            onChange={(e) => setEdits((p) => ({ ...p, [r.id]: Math.max(0, Number(e.target.value)) }))}
                            onBlur={() => saveCount({ ...r, countedQty: r.countedQty })}
                          />
                        ) : (
                          r.countedQty.toLocaleString()
                        )}
                      </td>
                      <td className={`num${diff !== 0 ? " is-short" : ""}`}>{diff > 0 ? `+${diff}` : diff}</td>
                      <td>{r.status === "ADJUSTED" ? <StatusBadge tone="success">조정완료</StatusBadge> : <StatusBadge tone="info">실사중</StatusBadge>}</td>
                      <td>
                        <div className="outbound-row-actions">
                          {editable ? (
                            <button type="button" className="btn-secondary" disabled={busy || diff === 0} title={diff === 0 ? "차이 없음" : undefined} onClick={() => doAdjust(r)}>재고조정</button>
                          ) : (
                            <span className="cell-mut">{r.adjustedAt ?? "조정됨"}</span>
                          )}
                        </div>
                      </td>
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
