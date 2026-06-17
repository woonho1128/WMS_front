import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { PUTAWAY_STEPS } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type PutawayRow = {
  stockId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  warehouseId: number;
  warehouseName: string;
  warehouseType: string;
  locationCode: string; // 현재(입고) 로케이션
  locationType: string;
  lotNo: string;
  receivedDate: string | null;
  qty: number;
};

type LocationOption = { id: number; code: string; status: string; locationType: string; zoneName: string };

const LOC_TYPE_LABEL: Record<string, string> = {
  PICKING: "피킹",
  RESERVE: "보충",
  DEFECT: "불량",
  DAMAGED: "파손"
};

export const PutawayPage = () => {
  const [rows, setRows] = useState<PutawayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");

  // 격납 처리 모달
  const [target, setTarget] = useState<PutawayRow | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [toLocationId, setToLocationId] = useState<number | "">("");
  const [qrInput, setQrInput] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<PutawayRow[]>("/stocks/putaway")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) =>
      [r.itemCode, r.itemName, r.lotNo, r.warehouseName, r.locationCode]
        .some((v) => (v ?? "").toLowerCase().includes(kw))
    );
  }, [rows, keyword]);

  const summary = useMemo(() => {
    const totalQty = filtered.reduce((acc, r) => acc + r.qty, 0);
    const warehouses = new Set(filtered.map((r) => r.warehouseName));
    return { count: filtered.length, totalQty, warehouses: warehouses.size };
  }, [filtered]);

  const openPutaway = async (row: PutawayRow) => {
    setTarget(row);
    setToLocationId("");
    setQrInput("");
    try {
      const locs = await apiGet<LocationOption[]>(`/warehouses/${row.warehouseId}/locations`);
      // 격납 대상 = 피킹/보충 로케이션 (현재 로케이션 제외)
      setLocations(locs.filter((l) => (l.locationType === "PICKING" || l.locationType === "RESERVE") && l.code !== row.locationCode));
    } catch {
      setLocations([]);
    }
  };

  const selectedLoc = locations.find((l) => l.id === toLocationId);
  const qrVerified = selectedLoc != null && qrInput.trim().toUpperCase() === selectedLoc.code.toUpperCase();

  const doComplete = async () => {
    if (!target || !toLocationId) return;
    setBusy(true);
    try {
      await apiPost(`/stocks/putaway/${target.stockId}/complete`, { toLocationId });
      setNotice(`${target.lotNo} 격납 완료 — ${selectedLoc?.code}로 이동, 가용재고로 전환되었습니다.`);
      setTarget(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "격납 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="격납 처리 단계"
        steps={PUTAWAY_STEPS}
        current={1}
        note="입고확정으로 생성된 격납대기 재고를 피킹/보충 로케이션으로 적치 (QR 확인 후 확정)"
      />

      <section className="outbound-summary-grid" aria-label="격납 요약">
        <article className="app-surface outbound-summary-card"><span>격납대기</span><strong>{summary.count}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>대기 수량</span><strong>{summary.totalQty.toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>대상 창고</span><strong>{summary.warehouses}곳</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="격납 대기 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="SKU / 품목명 / LOT / 창고 / 로케이션"
            />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`격납 대기 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ?? "격납 버튼으로 피킹/보충 로케이션을 선택하고, 로케이션 QR(코드)을 확인하면 격납이 확정됩니다."}
          </p>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
          </div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>LOT</th>
                <th>SKU</th>
                <th>품목명</th>
                <th>창고</th>
                <th>현재 로케이션</th>
                <th>입고일</th>
                <th className="num">수량</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>
                  격납대기 재고가 없습니다. 입고관리 &gt; 입고 확정에서 확정하면 여기에 표시됩니다.
                </td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.stockId}>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{row.lotNo}</td>
                    <td>{row.itemCode}</td>
                    <td>{row.itemName}</td>
                    <td>
                      {row.warehouseName}
                      {row.warehouseType === "외주" ? <span className="outbound-consign-tag">외주</span> : null}
                    </td>
                    <td>{row.locationCode}</td>
                    <td>{row.receivedDate ?? "-"}</td>
                    <td className="num">{row.qty.toLocaleString()} {row.unit}</td>
                    <td><StatusBadge tone="info">격납대기</StatusBadge></td>
                    <td>
                      <div className="outbound-row-actions">
                        <button type="button" className="btn-secondary" disabled={busy} onClick={() => openPutaway(row)}>격납</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <Modal
        open={target !== null}
        title="격납 처리"
        desc={target ? `${target.lotNo} · ${target.itemCode} · ${target.qty.toLocaleString()}${target.unit}` : ""}
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy || !toLocationId || !qrVerified} onClick={doComplete}>
              격납 확정
            </button>
          </>
        }
      >
        <label className="ds-field">
          <span>격납 로케이션 (피킹/보충)</span>
          <select
            value={toLocationId}
            onChange={(e) => {
              setToLocationId(e.target.value === "" ? "" : Number(e.target.value));
              setQrInput("");
            }}
          >
            <option value="">로케이션 선택</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.zoneName} ({LOC_TYPE_LABEL[l.locationType] ?? l.locationType})
              </option>
            ))}
          </select>
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>로케이션 QR 확인 (스캔 또는 코드 입력)</span>
          <input
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder={selectedLoc ? `"${selectedLoc.code}" 스캔/입력` : "로케이션을 먼저 선택하세요"}
            disabled={!selectedLoc}
          />
        </label>
        {selectedLoc ? (
          qrVerified ? (
            <div className="ds-callout info" style={{ marginTop: 8 }}>
              <Icon name="check" size={18} />
              <span>QR 확인 완료 — <b>{selectedLoc.code}</b>로 격납하면 가용재고로 전환됩니다.</span>
            </div>
          ) : (
            <div className="ds-callout danger" style={{ marginTop: 8 }}>
              <span>선택한 로케이션 코드와 일치해야 격납 확정이 가능합니다.</span>
            </div>
          )
        ) : null}
      </Modal>
    </section>
  );
};
