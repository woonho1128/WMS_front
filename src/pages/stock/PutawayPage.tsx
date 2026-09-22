import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { PUTAWAY_STEPS } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용
import "./PutawayPage.css"; // 격납 분할 배정 모달 레이아웃

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

/** 로케이션에 지금 든 재고 한 줄 */
type LocationStock = { itemCode: string; itemName: string; lotNo: string; onHand: number; unit: string };

type LocationOption = {
  id: number;
  code: string;
  status: string;
  locationType: string;
  zoneName: string;
  /** 든 품목 종류 수 · 지금 든 재고 — 옛 서버면 없다(그때는 아무것도 표시하지 않는다. '빈 칸'으로 넘겨짚지 않는다) */
  skuCount?: number;
  stocks?: LocationStock[];
};

/**
 * 격납할 칸에 지금 무엇이 들어 있나 — 이미 재고가 있어도 넣을 수 있다(막지 않음).
 * 다른 품목이 있으면 혼적이 된다는 것만 미리 알린다 (2026-09-22 현업 회의 9번).
 */
const contentsOf = (loc: LocationOption | undefined, itemCode: string) => {
  const stocks = loc?.stocks ?? [];
  const otherKinds = new Set(stocks.filter((stock) => stock.itemCode !== itemCode).map((stock) => stock.itemCode)).size;
  const sameItem = stocks.filter((stock) => stock.itemCode === itemCode);
  return { known: loc?.stocks != null, stocks, otherKinds, sameItem };
};

/** 선택 목록 한 줄 끝에 붙는 내용 요약 — "이미 섞인 칸"과 "넣으면 섞이는 칸"을 가른다 */
const optionNote = (loc: LocationOption, itemCode: string) => {
  const { known, stocks, otherKinds } = contentsOf(loc, itemCode);
  if (!known) return "";
  if (!stocks.length) return " — 빈 칸";
  if (!otherKinds) return " — 같은 품목";
  const kinds = new Set(stocks.map((stock) => stock.itemCode)).size;
  return kinds >= 2 ? ` — 이미 혼적 ${kinds}종` : " — 다른 품목 · 넣으면 혼적";
};

/** 격납 대상으로 배정 가능한 로케이션 유형 (직출 포함) */
const PUTAWAY_TARGET_TYPES = ["PICKING", "RESERVE", "CROSS_DOCK"];

const LOC_TYPE_LABEL: Record<string, string> = {
  PICKING: "피킹",
  RESERVE: "보충",
  CROSS_DOCK: "직출",
  DEFECT: "불량",
  DAMAGED: "파손"
};

/** 격납 배정 1행 (로케이션 + 수량 + QR 확인) */
type AssignRow = { lid: number | ""; qty: number | ""; qr: string };

export const PutawayPage = () => {
  const [rows, setRows] = useState<PutawayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");

  // 격납 처리 모달 — 다중(분할) 로케이션 배정
  const [target, setTarget] = useState<PutawayRow | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [assigns, setAssigns] = useState<AssignRow[]>([]);

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
    setAssigns([{ lid: "", qty: row.qty, qr: "" }]); // 기본 1행 = 전량
    try {
      const locs = await apiGet<LocationOption[]>(`/warehouses/${row.warehouseId}/locations`);
      // 격납 대상 = 피킹/보충/직출 로케이션 (현재 로케이션 제외)
      setLocations(locs.filter((l) => PUTAWAY_TARGET_TYPES.includes(l.locationType) && l.code !== row.locationCode));
    } catch {
      setLocations([]);
    }
  };

  // ---- 배정 행 조작/검증 ----
  const setAssign = (i: number, patch: Partial<AssignRow>) =>
    setAssigns((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const addRow = () =>
    setAssigns((prev) => [...prev, { lid: "", qty: "", qr: "" }]);
  const removeRow = (i: number) =>
    setAssigns((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const assignedQty = assigns.reduce((s, a) => s + (Number(a.qty) || 0), 0);
  const remaining = (target?.qty ?? 0) - assignedQty;
  const usedLids = assigns.map((a) => a.lid).filter((v): v is number => v !== "");
  const hasDupLoc = new Set(usedLids).size !== usedLids.length;

  const rowVerified = (a: AssignRow) => {
    const loc = locations.find((l) => l.id === a.lid);
    return loc != null && (Number(a.qty) || 0) > 0 && a.qr.trim().toUpperCase() === loc.code.toUpperCase();
  };
  const allValid =
    target != null &&
    assigns.length > 0 &&
    assignedQty === target.qty &&
    !hasDupLoc &&
    assigns.every((a) => a.lid !== "" && (Number(a.qty) || 0) > 0 && rowVerified(a));

  const doComplete = async () => {
    if (!target || !allValid) return;
    setBusy(true);
    try {
      const assignments = assigns.map((a) => ({ toLocationId: a.lid, qty: Number(a.qty) }));
      await apiPost(`/stocks/putaway/${target.stockId}/complete`, { assignments });
      const summaryText = assignments
        .map((a) => `${locations.find((l) => l.id === a.toLocationId)?.code} ${a.qty}`)
        .join(" / ");
      setNotice(
        assignments.length > 1
          ? `${target.lotNo} 격납 완료 — ${summaryText}로 분할 적치, 가용재고로 전환되었습니다.`
          : `${target.lotNo} 격납 완료 — ${summaryText}로 이동, 가용재고로 전환되었습니다.`
      );
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
        note="격납대기 재고를 피킹/보충/직출 로케이션으로 적치 — 하나 또는 여러 로케이션으로 수량 분할 가능 (QR 확인 후 확정)"
      />

      <section className="outbound-summary-grid is-3" aria-label="격납 요약">
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
            {notice ?? "격납 버튼으로 피킹/보충/직출 로케이션을 선택하고, 여러 로케이션에 수량을 나눠 배정할 수 있습니다. 각 로케이션 QR을 확인하면 격납이 확정됩니다."}
          </p>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(18080) 확인</span>
          </div>
        ) : null}
        <ResponsiveTable>
          <table className="outbound-table">
            <thead>
              <tr>
                <th className="rt-title">LOT</th>
                <th>SKU</th>
                <th>품목명</th>
                <th>창고</th>
                <th>현재 로케이션</th>
                <th>입고일</th>
                <th className="num">수량</th>
                {/* 이 목록은 전부 격납대기라 폰 카드에서는 뺀다 (카드 한 장이 줄 하나만큼 짧아진다) */}
                <th className="rt-hide">상태</th>
                <th className="rt-actions">처리</th>
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
        </ResponsiveTable>
      </DashboardCard>

      <Modal
        open={target !== null}
        title="격납 처리 (로케이션 배정)"
        desc={target ? `${target.lotNo} · ${target.itemCode} · 대기 ${target.qty.toLocaleString()}${target.unit}` : ""}
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy || !allValid} onClick={doComplete}>
              격납 확정
            </button>
          </>
        }
      >
        {/* 배정 합계 요약 */}
        <div
          className="ds-callout"
          style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
        >
          <span>대기 수량 <b>{target?.qty.toLocaleString()}</b></span>
          <span>배정 합계 <b>{assignedQty.toLocaleString()}</b></span>
          <span style={{ color: remaining === 0 ? "var(--c-success)" : "var(--c-danger)" }}>
            잔여 <b>{remaining.toLocaleString()}</b>
          </span>
        </div>

        {assigns.map((a, i) => {
          const loc = locations.find((l) => l.id === a.lid);
          const verified = rowVerified(a);
          return (
            <div key={i} className="pa-assign">
              <div className="pa-assign-line">
                <label className="ds-field pa-assign-loc">
                  <span>로케이션 #{i + 1} (피킹/보충/직출)</span>
                  <select
                    value={a.lid}
                    onChange={(e) => setAssign(i, { lid: e.target.value === "" ? "" : Number(e.target.value), qr: "" })}
                  >
                    <option value="">로케이션 선택</option>
                    {locations.map((l) => {
                      const takenByOther = a.lid !== l.id && usedLids.includes(l.id);
                      return (
                        <option key={l.id} value={l.id} disabled={takenByOther}>
                          {l.code} · {l.zoneName} ({LOC_TYPE_LABEL[l.locationType] ?? l.locationType})
                          {takenByOther ? " — 이 격납에서 이미 고름" : target ? optionNote(l, target.itemCode) : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="ds-field pa-assign-qty">
                  <span>수량</span>
                  <input
                    type="number"
                    min={0}
                    value={a.qty}
                    onChange={(e) => setAssign(i, { qty: e.target.value === "" ? "" : Number(e.target.value) })}
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary pa-assign-del"
                  style={{ color: "var(--c-danger)" }}
                  disabled={assigns.length <= 1}
                  onClick={() => removeRow(i)}
                  title={assigns.length <= 1 ? "최소 1개 배정 필요" : "이 배정 삭제"}
                >
                  삭제
                </button>
              </div>
              {loc && target ? <LocationContents loc={loc} itemCode={target.itemCode} /> : null}
              <label className="ds-field">
                <span>로케이션 QR 확인 (스캔 또는 코드 입력)</span>
                <input
                  value={a.qr}
                  onChange={(e) => setAssign(i, { qr: e.target.value })}
                  placeholder={loc ? `"${loc.code}" 스캔/입력` : "로케이션을 먼저 선택하세요"}
                  disabled={!loc}
                />
              </label>
              {loc ? (
                verified ? (
                  <div className="ds-callout info" style={{ margin: 0 }}>
                    <Icon name="check" size={16} />
                    <span><b>{loc.code}</b> QR 확인 완료 — {Number(a.qty) || 0}{target?.unit} 격납</span>
                  </div>
                ) : (
                  <div className="ds-callout danger" style={{ margin: 0 }}>
                    <span>선택한 로케이션 코드와 QR이 일치하고, 수량이 1 이상이어야 합니다.</span>
                  </div>
                )
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          className="btn-secondary"
          onClick={addRow}
          disabled={remaining <= 0}
          title={remaining <= 0 ? "잔여 수량이 없습니다" : "다른 로케이션에 나눠 담기"}
        >
          + 분할 로케이션 추가
        </button>

        {hasDupLoc ? (
          <div className="ds-callout danger" style={{ marginTop: 8 }}>
            <span>같은 로케이션이 중복 선택되었습니다. 로케이션은 배정마다 달라야 합니다.</span>
          </div>
        ) : remaining !== 0 ? (
          <div className="ds-callout warning" style={{ marginTop: 8 }}>
            <span>배정 합계가 대기 수량과 일치해야 격납 확정이 가능합니다. (잔여 {remaining.toLocaleString()})</span>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};

/** 고른 칸에 지금 든 것 + 혼적 안내 (막지 않는다) */
const LocationContents = ({ loc, itemCode }: { loc: LocationOption; itemCode: string }) => {
  const { known, stocks, otherKinds, sameItem } = contentsOf(loc, itemCode);
  if (!known) return null;
  return (
    <div className="pa-contents">
      <div className="pa-contents-list">
        <span className="pa-contents-head">지금 든 것</span>
        {stocks.length === 0 ? (
          <span className="pa-contents-empty">빈 칸</span>
        ) : (
          stocks.map((stock, idx) => (
            // 같은 품목 · LOT 이 상태(가용/불량)만 달리 두 줄일 수 있어 순번을 섞는다
            <span key={`${stock.itemCode}-${stock.lotNo}-${idx}`} className={`pa-contents-row${stock.itemCode === itemCode ? " is-same" : ""}`}>
              <span className="pa-contents-name">{stock.itemName}</span>
              <span className="pa-contents-lot">{stock.lotNo}</span>
              <b>
                {stock.onHand.toLocaleString()} <small>{stock.unit}</small>
              </b>
            </span>
          ))
        )}
      </div>
      {otherKinds > 0 ? (
        <div className="ds-callout warning" style={{ margin: 0 }}>
          <Icon name="alert" size={16} />
          <span>
            <b>혼적</b> — 다른 품목 {otherKinds}종이 든 칸입니다. 넣을 수는 있고, 넣으면 한 칸에 {otherKinds + 1}종이 섞입니다
            (3D · 로케이션 목록에 혼적으로 표시).
          </span>
        </div>
      ) : sameItem.length > 0 ? (
        <div className="ds-callout info" style={{ margin: 0 }}>
          <span>같은 품목이 이미 있습니다 — LOT 이 같으면 합쳐지고, 다르면 LOT 별로 따로 쌓입니다.</span>
        </div>
      ) : null}
    </div>
  );
};
