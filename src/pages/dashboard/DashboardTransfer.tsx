import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "./components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import { TRANSFER_STEPS } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "./DashboardTransfer.css";

type StockRow = {
  stockId: number;
  itemCode: string;
  itemName: string;
  warehouseName: string;
  warehouseType: string;
  locationCode: string;
  lotNo: string;
  stockStatus: string;
  onHand: number;
  available: number;
};

type LocationRow = {
  id: number;
  code: string;
  warehouseName: string;
  locationType: string;
};

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
  type: string | null;
  erpLinked: boolean;
  status: string;
  reason: string | null;
  createdAt: string | null;
};

export const DashboardTransfer = () => {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stockQuery, setStockQuery] = useState("");

  // 이동 폼 상태
  const [source, setSource] = useState<StockRow | null>(null);
  const [toLocationId, setToLocationId] = useState<number | "">("");
  const [qty, setQty] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [fromQr, setFromQr] = useState("");
  const [toQr, setToQr] = useState("");

  const load = () => {
    setError(null);
    Promise.all([
      apiGet<StockRow[]>("/stocks"),
      apiGet<TransferRow[]>("/transfers"),
      apiGet<LocationRow[]>("/locations")
    ])
      .then(([s, t, l]) => { setStocks(s); setTransfers(t); setLocations(l); })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"));
  };
  useEffect(load, []);

  // 이동 가능한 재고 = 가용(AVAILABLE) + 잔량 > 0
  const movableStocks = useMemo(
    () => stocks.filter((s) => s.stockStatus === "AVAILABLE" && s.available > 0),
    [stocks]
  );

  const filteredStocks = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    if (!q) return movableStocks;
    return movableStocks.filter(
      (s) => `${s.itemName} ${s.itemCode} ${s.locationCode} ${s.lotNo}`.toLowerCase().includes(q)
    );
  }, [movableStocks, stockQuery]);

  // 도착 후보 = 출발과 다른 로케이션 (동일 창고 우선 정렬)
  const destLocations = useMemo(() => {
    if (!source) return locations;
    return [...locations]
      .filter((l) => l.code !== source.locationCode)
      .sort((a, b) => Number(b.warehouseName === source.warehouseName) - Number(a.warehouseName === source.warehouseName));
  }, [locations, source]);

  const selectedDest = locations.find((l) => l.id === toLocationId);
  const fromOk = source != null && fromQr.trim().toUpperCase() === source.locationCode.toUpperCase();
  const toOk = selectedDest != null && toQr.trim().toUpperCase() === selectedDest.code.toUpperCase();
  const qtyOk = typeof qty === "number" && qty > 0 && source != null && qty <= source.available;

  const kpis = useMemo(() => {
    const done = transfers.filter((t) => t.status === "done").length;
    const consign = transfers.filter((t) => !t.erpLinked).length;
    return { total: transfers.length, done, consign };
  }, [transfers]);

  const pickSource = (s: StockRow) => {
    setSource(s);
    setQty(s.available);
    setToLocationId("");
    setFromQr("");
    setToQr("");
  };

  const resetForm = () => {
    setSource(null); setToLocationId(""); setQty(""); setReason(""); setFromQr(""); setToQr("");
  };

  const doMove = async () => {
    if (!source || toLocationId === "" || !qtyOk) return;
    setBusy(true);
    try {
      await apiPost("/transfers/move", { sourceStockId: source.stockId, toLocationId, qty, reason });
      setNotice(`이동 완료 — ${source.itemCode}(LOT ${source.lotNo}) ${source.locationCode} → ${selectedDest?.code} ${qty}`);
      resetForm();
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "이동 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="transfer-page">
      <header className="transfer-head app-surface">
        <div>
          <h2>재고 이동 (일반)</h2>
          <p>가용 재고(LOT)를 선택해 도착 로케이션으로 이동합니다. 출발/도착 QR 검증 후 확정. (백엔드 연동)</p>
        </div>
        <button type="button" className="btn-primary" onClick={load}>새로고침</button>
      </header>

      <ProcessBanner
        title="재고이동 단계"
        steps={TRANSFER_STEPS}
        current={1}
        note="일반→일반: ERP 반영 · 외주→외주: ERP 미연동 · 일반↔외주 이동 불가"
      />

      <section className="transfer-kpis">
        <article className="app-surface"><span>총 이동 건수</span><strong>{kpis.total}건</strong></article>
        <article className="app-surface"><span>완료</span><strong>{kpis.done}건</strong></article>
        <article className="app-surface"><span>외주 이동(ERP 미연동)</span><strong>{kpis.consign}건</strong></article>
      </section>

      {error ? <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div> : null}
      {notice ? <div className="ds-callout info" style={{ marginBottom: 12 }}><Icon name="check" size={18} /><span>{notice}</span></div> : null}

      <div className="transfer-main-grid">
        <DashboardCard className="transfer-stock-card" title={`이동 가능 재고 (${filteredStocks.length})`}>
          <div className="transfer-filters">
            <input placeholder="로케이션/품목/LOT 검색" value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} />
          </div>
          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 520 }}>
              <thead>
                <tr><th>로케이션</th><th>품목</th><th>LOT</th><th className="num">가용</th><th /></tr>
              </thead>
              <tbody>
                {filteredStocks.map((s) => (
                  <tr key={s.stockId} className={source?.stockId === s.stockId ? "is-selected" : ""}>
                    <td><span className="loc-chip">{s.locationCode}</span>{s.warehouseType === "외주" ? <span className="outbound-consign-tag">외주</span> : null}</td>
                    <td>{s.itemCode}<div style={{ fontSize: 12, color: "var(--ink-faint)" }}>{s.itemName}</div></td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>{s.lotNo}</td>
                    <td className="num">{s.available.toLocaleString()}</td>
                    <td><button type="button" className="btn-secondary" onClick={() => pickSource(s)}>선택</button></td>
                  </tr>
                ))}
                {filteredStocks.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>이동 가능한 가용 재고 없음</td></tr>}
              </tbody>
            </table>
          </div>
        </DashboardCard>

        <DashboardCard className="transfer-form-card" title="이동 처리">
          <div className="ds-callout info" style={{ marginBottom: 14 }}>
            <Icon name="alert" size={18} />
            <span><b>외주창고</b> 이동은 <b>ERP 미연동</b>, <b>일반↔외주 이동은 불가</b>합니다.</span>
          </div>
          {!source ? (
            <p className="outbound-detail-empty">왼쪽 재고 목록에서 이동할 LOT을 <b>선택</b>하세요.</p>
          ) : (
            <>
              <div className="transfer-form-grid">
                <label><span>출발 재고</span><input value={`${source.locationCode} · ${source.itemCode} · LOT ${source.lotNo}`} readOnly /></label>
                <label>
                  <span>도착 로케이션</span>
                  <select value={toLocationId} onChange={(e) => { setToLocationId(e.target.value === "" ? "" : Number(e.target.value)); setToQr(""); }}>
                    <option value="">도착 로케이션 선택</option>
                    {destLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.warehouseName} · {l.code}</option>
                    ))}
                  </select>
                </label>
                <label><span>이동 수량 (가용 {source.available.toLocaleString()})</span><input type="number" min={1} max={source.available} value={qty} onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))} /></label>
                <label><span>사유 (선택)</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="이동 사유" /></label>
                <label><span>출발 QR 확인 ({source.locationCode})</span><input value={fromQr} onChange={(e) => setFromQr(e.target.value)} placeholder={`"${source.locationCode}" 스캔/입력`} /></label>
                <label><span>도착 QR 확인 {selectedDest ? `(${selectedDest.code})` : ""}</span><input value={toQr} onChange={(e) => setToQr(e.target.value)} placeholder={selectedDest ? `"${selectedDest.code}" 스캔/입력` : "도착 로케이션을 먼저 선택"} disabled={!selectedDest} /></label>
              </div>
              <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
                <StatusBadge tone={fromOk ? "success" : "gray"}>출발 {fromOk ? "확인" : "대기"}</StatusBadge>
                <StatusBadge tone={toOk ? "success" : "gray"}>도착 {toOk ? "확인" : "대기"}</StatusBadge>
                <StatusBadge tone={qtyOk ? "success" : "gray"}>수량 {qtyOk ? "확인" : "확인필요"}</StatusBadge>
              </div>
              <div className="transfer-form-actions">
                <button type="button" className="btn-secondary" onClick={resetForm}>초기화</button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || !fromOk || !toOk || !qtyOk}
                  title={!fromOk || !toOk ? "출발/도착 QR을 확인하세요" : !qtyOk ? "수량을 확인하세요" : undefined}
                  onClick={doMove}
                >
                  이동 완료 처리
                </button>
              </div>
            </>
          )}
        </DashboardCard>
      </div>

      <DashboardCard className="transfer-history-card" title={`이동 이력 (${transfers.length})`}>
        <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", minWidth: 820 }}>
            <thead>
              <tr><th>이동번호</th><th>품목</th><th>이동 경로</th><th className="num">수량</th><th>구분</th><th>상태</th><th>처리시각</th></tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="cell-strong">{t.transferNo}</td>
                  <td>{t.itemName}</td>
                  <td>
                    <span className="loc-chip">{t.fromLocation ?? t.fromWarehouse}</span>
                    {" → "}
                    <span className="loc-chip">{t.toLocation ?? t.toWarehouse}</span>
                  </td>
                  <td className="num">{t.qty.toLocaleString()}</td>
                  <td>{t.erpLinked ? <StatusBadge tone="info">ERP 반영</StatusBadge> : <StatusBadge tone="consign">외주(미연동)</StatusBadge>}</td>
                  <td><StatusBadge tone={t.status === "done" ? "success" : "gray"}>{t.status === "done" ? "완료" : t.status}</StatusBadge></td>
                  <td>{t.createdAt ?? "-"}</td>
                </tr>
              ))}
              {transfers.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>이동 이력 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </section>
  );
};
