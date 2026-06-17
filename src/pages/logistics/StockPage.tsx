import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "./StockPage.css";

type StockRow = {
  itemCode: string;
  itemName: string;
  warehouseName: string;
  warehouseType: string; // 일반 / 외주
  zoneCode: string;
  zoneName: string;
  locationCode: string;
  locationType: string; // PICKING/RESERVE/DEFECT/DAMAGED
  lotNo: string;
  stockStatus: string; // AVAILABLE/PUTAWAY_WAIT/DEFECT/RESERVED/MOVING
  receivedDate: string | null;
  onHand: number;
  allocated: number;
  available: number;
  safetyStock: number;
};

const stockStatusMeta: Record<string, { label: string; tone: "success" | "info" | "danger" | "warning" | "violet" }> = {
  AVAILABLE: { label: "가용", tone: "success" },
  PUTAWAY_WAIT: { label: "격납대기", tone: "info" },
  DEFECT: { label: "불량", tone: "danger" },
  RESERVED: { label: "예약", tone: "warning" },
  MOVING: { label: "이동중", tone: "violet" }
};

export const StockPage = () => {
  const [stockList, setStockList] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selWarehouse, setSelWarehouse] = useState("전체");
  const [selZone, setSelZone] = useState("전체");
  const [selStatus, setSelStatus] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileTab, setMobileTab] = useState<"summary" | "list">("list");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<StockRow[]>("/stocks")
      .then(setStockList)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const warehouses = useMemo(
    () => ["전체", ...Array.from(new Set(stockList.map((i) => i.warehouseName)))],
    [stockList]
  );

  const zones = useMemo(() => {
    const filtered = stockList.filter((i) => selWarehouse === "전체" || i.warehouseName === selWarehouse);
    return ["전체", ...Array.from(new Set(filtered.map((i) => i.zoneName)))];
  }, [stockList, selWarehouse]);

  const filteredStock = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return stockList.filter((item) => {
      const mW = selWarehouse === "전체" || item.warehouseName === selWarehouse;
      const mZ = selZone === "전체" || item.zoneName === selZone;
      const mT = selStatus === "전체" || item.stockStatus === selStatus;
      const mS =
        q === "" ||
        item.itemName.toLowerCase().includes(q) ||
        item.itemCode.toLowerCase().includes(q) ||
        item.locationCode.toLowerCase().includes(q) ||
        item.lotNo.toLowerCase().includes(q);
      return mW && mZ && mT && mS;
    });
  }, [stockList, selWarehouse, selZone, selStatus, searchQuery]);

  const stats = useMemo(() => {
    let normalQty = 0;
    let consignQty = 0;
    let shortages = 0;
    const skus = new Set<string>();
    filteredStock.forEach((it) => {
      skus.add(it.itemCode);
      if (it.warehouseType === "외주") consignQty += it.onHand;
      else normalQty += it.onHand;
      if (it.stockStatus === "AVAILABLE" && it.available < it.safetyStock) shortages += 1;
    });
    return { normalQty, consignQty, skuCount: skus.size, shortages };
  }, [filteredStock]);

  const zoneSummary = useMemo(() => {
    const map: Record<string, { warehouse: string; zone: string; consign: boolean; skus: Set<string>; qty: number }> = {};
    filteredStock.forEach((it) => {
      const key = `${it.warehouseName} - ${it.zoneName}`;
      if (!map[key]) {
        map[key] = { warehouse: it.warehouseName, zone: it.zoneName, consign: it.warehouseType === "외주", skus: new Set(), qty: 0 };
      }
      map[key].skus.add(it.itemCode);
      map[key].qty += it.onHand;
    });
    return Object.entries(map).map(([k, d]) => ({
      zoneKey: k,
      warehouse: d.warehouse,
      zoneName: d.zone,
      consign: d.consign,
      skuCount: d.skus.size,
      totalQty: d.qty
    }));
  }, [filteredStock]);

  const handleResetFilters = () => {
    setSelWarehouse("전체");
    setSelZone("전체");
    setSelStatus("전체");
    setSearchQuery("");
  };

  return (
    <section className="stock-page-container">
      <div className="stock-stats-grid">
        <DashboardCard className="stat-card">
          <div className="stat-icon primary">📦</div>
          <div className="stat-details">
            <span className="stat-label">총 보유 재고 (일반)</span>
            <span className="stat-value">{stats.normalQty.toLocaleString()} <small>EA</small></span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon info">🏷️</div>
          <div className="stat-details">
            <span className="stat-label">보유 SKU 품목 수</span>
            <span className="stat-value">{stats.skuCount} <small>종</small></span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon warning">⚠️</div>
          <div className="stat-details">
            <span className="stat-label">안전재고 부족 품목</span>
            <span className="stat-value text-danger">{stats.shortages} <small>건</small></span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon hold">🏭</div>
          <div className="stat-details">
            <span className="stat-label">외주 재고 (ERP 미연동)</span>
            <span className="stat-value text-hold">{stats.consignQty.toLocaleString()} <small>EA</small></span>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard className="stock-filter-card">
        <div className="filter-card-header">
          <strong className="filter-title">🔍 재고 상세 조건 검색</strong>
          <button type="button" className="mobile-filter-toggle-btn" onClick={load}>
            새로고침 ⟳
          </button>
        </div>
        <div className="filter-inputs-grid expanded">
          <label>
            <span>창고 구분</span>
            <select
              value={selWarehouse}
              onChange={(e) => {
                setSelWarehouse(e.target.value);
                setSelZone("전체");
              }}
            >
              {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label>
            <span>구역 (Zone)</span>
            <select value={selZone} onChange={(e) => setSelZone(e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label>
            <span>재고 상태</span>
            <select value={selStatus} onChange={(e) => setSelStatus(e.target.value)}>
              <option value="전체">전체</option>
              {Object.entries(stockStatusMeta).map(([code, meta]) => (
                <option key={code} value={code}>{meta.label}</option>
              ))}
            </select>
          </label>
          <label className="search-query-label">
            <span>통합 검색 (품명/SKU/로케이션/LOT)</span>
            <input type="text" placeholder="검색어 입력" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </label>
          <div className="filter-action-buttons">
            <button type="button" className="ghost" onClick={handleResetFilters}>초기화</button>
            <button
              type="button"
              className="ghost"
              disabled={filteredStock.length === 0}
              onClick={() =>
                downloadCsv(
                  `실시간재고_${new Date().toISOString().slice(0, 10)}`,
                  ["창고", "구역", "로케이션", "SKU", "품목명", "LOT", "입고일", "재고상태", "현재고", "가용", "안전재고"],
                  filteredStock.map((r) => [
                    r.warehouseName, r.zoneName, r.locationCode, r.itemCode, r.itemName,
                    r.lotNo, r.receivedDate ?? "", stockStatusMeta[r.stockStatus]?.label ?? r.stockStatus,
                    r.onHand, r.available, r.safetyStock
                  ])
                )
              }
            >
              엑셀
            </button>
          </div>
        </div>
      </DashboardCard>

      <div className="mobile-tabs-header">
        <button type="button" className={`tab-btn ${mobileTab === "list" ? "active" : ""}`} onClick={() => setMobileTab("list")}>
          품목별 재고 ({filteredStock.length})
        </button>
        <button type="button" className={`tab-btn ${mobileTab === "summary" ? "active" : ""}`} onClick={() => setMobileTab("summary")}>
          구역(Zone)별 요약 ({zoneSummary.length})
        </button>
      </div>

      {error ? (
        <div className="ds-callout danger" style={{ margin: "0 0 12px" }}>
          <span>불러오기 실패: {error} — 백엔드(8080)가 실행 중인지 확인하세요.</span>
        </div>
      ) : null}

      <div className={`stock-main-layout show-${mobileTab}`}>
        <DashboardCard className="stock-summary-panel" title="창고/구역별 재고 요약">
          <div className="summary-cards-container">
            {zoneSummary.map((sum) => (
              <div key={sum.zoneKey} className="zone-summary-card">
                <div className="zone-meta">
                  <span className="zone-badge">{sum.zoneName}</span>
                  <span className="wh-name">{sum.warehouse}</span>
                </div>
                <div className="zone-stats">
                  <div>
                    <span className="label">SKU 종류</span>
                    <span className="val">{sum.skuCount}종</span>
                  </div>
                  <div>
                    <span className="label">보유 재고</span>
                    <span className="val highlight">{sum.totalQty.toLocaleString()} EA</span>
                  </div>
                  {sum.consign && (
                    <div>
                      <span className="label text-hold">구분</span>
                      <span className="val text-hold">외주(ERP 미연동)</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {zoneSummary.length === 0 && <div className="empty-info">해당 구역의 요약 정보가 없습니다.</div>}
          </div>
        </DashboardCard>

        <DashboardCard className="stock-list-panel" title={`재고 세부 목록 (총 ${filteredStock.length}건)`}>
          <div className="stock-table-wrapper">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>SKU 코드</th>
                  <th>품목명</th>
                  <th>창고</th>
                  <th>구역(Zone)</th>
                  <th>로케이션</th>
                  <th>LOT</th>
                  <th>입고일</th>
                  <th className="text-right">현재고</th>
                  <th className="text-right">가용</th>
                  <th className="text-right">안전재고</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center empty-td">불러오는 중...</td></tr>
                ) : filteredStock.length === 0 ? (
                  <tr><td colSpan={11} className="text-center empty-td">검색 조건에 맞는 재고 데이터가 존재하지 않습니다.</td></tr>
                ) : (
                  filteredStock.map((item, idx) => {
                    const shortage = item.stockStatus === "AVAILABLE" && item.available < item.safetyStock;
                    const meta = stockStatusMeta[item.stockStatus];
                    return (
                      <tr key={`${item.itemCode}-${item.locationCode}-${item.lotNo}-${idx}`} className={shortage ? "row-warning" : ""}>
                        <td className="font-mono font-bold">{item.itemCode}</td>
                        <td className="item-name-cell">{item.itemName}</td>
                        <td>{item.warehouseName}</td>
                        <td>{item.zoneName}</td>
                        <td><span className="loc-badge">{item.locationCode}</span></td>
                        <td className="font-mono">{item.lotNo}</td>
                        <td className="text-muted">{item.receivedDate ?? "-"}</td>
                        <td className="text-right font-bold">{item.onHand.toLocaleString()}</td>
                        <td className="text-right">{item.available.toLocaleString()}</td>
                        <td className="text-right text-muted">{item.safetyStock.toLocaleString()}</td>
                        <td>
                          <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                            {meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : null}
                            {item.warehouseType === "외주" ? <StatusBadge tone="consign">외주</StatusBadge> : null}
                            {shortage ? <StatusBadge tone="warning">부족</StatusBadge> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="stock-mobile-cards">
            {filteredStock.map((item, idx) => {
              const shortage = item.stockStatus === "AVAILABLE" && item.available < item.safetyStock;
              const meta = stockStatusMeta[item.stockStatus];
              return (
                <div key={`m-${item.itemCode}-${item.locationCode}-${item.lotNo}-${idx}`} className={`mobile-stock-card ${shortage ? "warning" : ""}`}>
                  <div className="card-header">
                    <span className="card-sku">{item.itemCode}</span>
                    <div style={{ display: "inline-flex", gap: 4 }}>
                      {meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : null}
                      {item.warehouseType === "외주" ? <StatusBadge tone="consign">외주</StatusBadge> : null}
                      {shortage ? <StatusBadge tone="warning">부족</StatusBadge> : null}
                    </div>
                  </div>
                  <h4 className="card-title-text">{item.itemName}</h4>
                  <div className="card-location-details">
                    <span className="wh-zone">{item.warehouseName} / {item.zoneName}</span>
                    <span className="loc-tag">📍 {item.locationCode}</span>
                    <span className="loc-tag">LOT {item.lotNo}{item.receivedDate ? ` · ${item.receivedDate}` : ""}</span>
                  </div>
                  <div className="card-quantities">
                    <div className="qty-cell">
                      <span className="label">현재고</span>
                      <span className="val font-bold">{item.onHand.toLocaleString()} EA</span>
                    </div>
                    <div className="qty-cell">
                      <span className="label">가용</span>
                      <span className="val">{item.available.toLocaleString()} EA</span>
                    </div>
                    <div className="qty-cell">
                      <span className="label">안전재고</span>
                      <span className="val text-muted">{item.safetyStock.toLocaleString()} EA</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredStock.length === 0 && <div className="empty-info">조회 조건에 맞는 재고 데이터가 없습니다.</div>}
          </div>
        </DashboardCard>
      </div>
    </section>
  );
};
