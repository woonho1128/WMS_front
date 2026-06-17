import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCard } from "./components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge, type BadgeTone } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { INBOUND_STEPS } from "../../domain/wmsProcess";
import { apiGet, apiPost, apiPut } from "../../services/http";
import "./DashboardOutbound.css"; // 공용 테이블/필터/페이지네이션/펼침 스타일 재사용
import "./DashboardInbound.css";

type InboundRow = {
  id: number;
  inboundNo: string;
  poNo: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  warehouseType: string | null;
  type: string;
  inTypeCode: string | null;
  inTypeName: string | null;
  purchaseGroupCode: string | null;
  purchaseGroupName: string | null;
  remark: string | null;
  status: string;
  expectedAt: string | null;
  qty: number;
};

type InboundLine = {
  id: number;
  itemCode: string;
  itemName: string;
  spec: string | null;
  unit: string;
  consign: boolean;
  locationCode: string | null;
  locationId: number | null;
  trackingNo: string | null;
  inspected: boolean;
  expectedQty: number;
  receivedQty: number;
};

type WarehouseOption = { id: number; code: string; name: string; type: string };
type LocationOption = { id: number; code: string; status: string; zoneName: string };

const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  scheduled: { label: "입고예정", tone: "gray" },
  registered: { label: "입고등록", tone: "info" },
  located: { label: "로케이션 지정", tone: "warning" },
  confirmed: { label: "입고확정", tone: "success" }
};
const STATUS_OPTIONS = ["scheduled", "registered", "located", "confirmed"];

const PAGE_SIZE = 10;
// 로컬 기준 yyyy-MM-dd (UTC 밀림 방지)
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

export const DashboardInbound = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => shiftDays(-15)); // 오늘 -15일
  const [dateTo, setDateTo] = useState(() => shiftDays(15)); // 오늘 +15일

  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [linesByInbound, setLinesByInbound] = useState<Record<number, InboundLine[]>>({});
  const [linesLoadingIds, setLinesLoadingIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  // 입고 처리(등록/지정/확정) 상태
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [assignTarget, setAssignTarget] = useState<InboundRow | null>(null);
  const [assignWh, setAssignWh] = useState<number | null>(null);
  const [whLocations, setWhLocations] = useState<LocationOption[]>([]);
  const [assignLocs, setAssignLocs] = useState<Record<number, number | "">>({}); // lineId -> locationId

  // 라인(품목) 로드 — 캐시된 건 재요청 안 함
  const fetchLines = (id: number) => {
    if (linesByInbound[id]) return;
    setLinesLoadingIds((p) => (p.includes(id) ? p : [...p, id]));
    apiGet<InboundLine[]>(`/inbounds/${id}/lines`)
      .then((lines) => setLinesByInbound((prev) => ({ ...prev, [id]: lines })))
      .catch((e) => setError(e instanceof Error ? e.message : "품목 정보 불러오기 실패"))
      .finally(() => setLinesLoadingIds((p) => p.filter((x) => x !== id)));
  };

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<InboundRow[]>("/inbounds")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  // 창고 목록(지정 모달용) 1회 로드
  useEffect(() => {
    apiGet<WarehouseOption[]>("/warehouses").then(setWarehouses).catch(() => {});
  }, []);

  // 라인 캐시 무효화(지정/확정 후 로케이션·입고수량 변경됨)
  const invalidateLines = (id: number) =>
    setLinesByInbound((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });

  // 입고등록: scheduled → registered
  const doRegister = async (id: number) => {
    setBusy(true);
    try {
      await apiPost(`/inbounds/${id}/register`, {});
      setNotice("입고등록 완료 — 창고·로케이션을 지정하세요.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "입고등록 실패");
    } finally {
      setBusy(false);
    }
  };

  // 창고·로케이션 지정 모달 열기
  const openAssign = async (row: InboundRow) => {
    setAssignTarget(row);
    const wh = row.warehouseId ?? warehouses[0]?.id ?? null;
    setAssignWh(wh);
    let lines = linesByInbound[row.id];
    if (!lines) {
      lines = await apiGet<InboundLine[]>(`/inbounds/${row.id}/lines`);
      setLinesByInbound((p) => ({ ...p, [row.id]: lines! }));
    }
    const init: Record<number, number | ""> = {};
    lines.forEach((ln) => { init[ln.id] = ln.locationId ?? ""; });
    setAssignLocs(init);
    if (wh != null) {
      try { setWhLocations(await apiGet<LocationOption[]>(`/warehouses/${wh}/locations`)); }
      catch { setWhLocations([]); }
    }
  };

  const onAssignWhChange = async (whId: number) => {
    setAssignWh(whId);
    let locs: LocationOption[] = [];
    try { locs = await apiGet<LocationOption[]>(`/warehouses/${whId}/locations`); } catch { /* noop */ }
    setWhLocations(locs);
    const valid = new Set(locs.map((l) => l.id));
    setAssignLocs((prev) => {
      const next: Record<number, number | ""> = {};
      Object.keys(prev).forEach((k) => {
        const v = prev[Number(k)];
        next[Number(k)] = typeof v === "number" && valid.has(v) ? v : "";
      });
      return next;
    });
  };

  const doAssign = async () => {
    if (!assignTarget || assignWh == null) return;
    const lines = linesByInbound[assignTarget.id] ?? [];
    if (lines.some((ln) => !assignLocs[ln.id])) {
      setNotice("모든 라인의 로케이션을 선택하세요.");
      return;
    }
    setBusy(true);
    try {
      await apiPut(`/inbounds/${assignTarget.id}/assign`, {
        warehouseId: assignWh,
        lines: lines.map((ln) => ({ lineId: ln.id, locationId: assignLocs[ln.id] }))
      });
      setNotice("창고·로케이션 지정 완료 — 입고 확정 화면에서 검수 후 확정하세요.");
      invalidateLines(assignTarget.id);
      setAssignTarget(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "지정 실패");
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw) {
        const hay = [r.inboundNo, r.poNo, r.supplierCode, r.supplierName, r.warehouseName, r.inTypeName, r.purchaseGroupName]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (dateFrom && (r.expectedAt ?? "") < dateFrom) return false;
      if (dateTo && (r.expectedAt ?? "") > dateTo) return false;
      return true;
    });
  }, [rows, keyword, statusFilter, typeFilter, dateFrom, dateTo]);

  const resetFilters = () => {
    setKeyword("");
    setStatusFilter("");
    setTypeFilter("");
    setDateFrom(shiftDays(-15));
    setDateTo(shiftDays(15));
  };

  const summary = useMemo(() => {
    const by = (s: string) => filtered.filter((r) => r.status === s).length;
    return {
      total: filtered.length,
      scheduled: by("scheduled"),
      registered: by("registered"),
      located: by("located"),
      confirmed: by("confirmed")
    };
  }, [filtered]);

  // 페이지네이션
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => setPage(1), [keyword, statusFilter, typeFilter, dateFrom, dateTo]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // 디폴트: 현재 페이지 행 펼침 + 라인 미리 로드
  useEffect(() => {
    const ids = paged.map((r) => r.id);
    setExpandedIds(ids);
    ids.forEach(fetchLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged]);

  const toggleExpand = (id: number) => {
    const willExpand = !expandedIds.includes(id);
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (willExpand) fetchLines(id);
  };
  const expandAll = () => {
    const ids = paged.map((r) => r.id);
    setExpandedIds(ids);
    ids.forEach(fetchLines);
  };
  const collapseAll = () => setExpandedIds([]);

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: number) => {
    if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
    toggleExpand(id);
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="입고 처리 단계"
        steps={INBOUND_STEPS}
        current={0}
        note="이 화면: 입고예정 조회·등록·창고/로케이션 지정 — 검수·확정은 입고 확정, 적치는 격납 대기 화면에서"
      />

      <section className="outbound-summary-grid" aria-label="입고 요약">
        <article className="app-surface outbound-summary-card"><span>조회 건수</span><strong>{summary.total}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>입고예정</span><strong>{summary.scheduled}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>입고등록</span><strong>{summary.registered}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>로케이션 지정</span><strong>{summary.located}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>입고확정</span><strong>{summary.confirmed}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="입고 조회 조건">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="입고번호 / PO / 공급처 / 입고형태 / 구매그룹 / 창고"
            />
          </label>
          <label>
            <span>입고상태</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">전체</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_MAP[s].label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>구분</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">전체</option>
              <option value="일반">일반</option>
              <option value="외주">외주</option>
            </select>
          </label>
          <label>
            <span>입고예정일(시작)</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            <span>입고예정일(종료)</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={resetFilters}>초기화</button>
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`입고 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "입고번호 행을 클릭하면 품목이 펼쳐집니다. 처리: 입고등록 → 창고·로케이션 지정 → (입고 확정 화면에서 검수·확정)."}</p>
          <div className="outbound-expand-actions">
            <button type="button" className="btn-secondary" onClick={expandAll}>품목 전체 펼치기</button>
            <button type="button" className="btn-secondary" onClick={collapseAll}>전체 숨기기</button>
          </div>
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
                <th>입고번호</th>
                <th>입고형태</th>
                <th>공급처</th>
                <th>창고</th>
                <th>구분</th>
                <th>예정일</th>
                <th className="num">수량</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>데이터가 없습니다.</td></tr>
              ) : (
                paged.map((row) => {
                  const st = STATUS_MAP[row.status] ?? { label: row.status, tone: "gray" as BadgeTone };
                  const expanded = expandedIds.includes(row.id);
                  const lines = linesByInbound[row.id];
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`outbound-master-row${expanded ? " is-expanded" : ""}`}
                        onClick={(e) => onRowClick(e, row.id)}
                      >
                        <td>
                          <span className="outbound-expand-caret" aria-hidden>{expanded ? "▾" : "▸"}</span>
                          {row.inboundNo}
                        </td>
                        <td>{row.inTypeName ?? "-"}{row.inTypeCode ? ` (${row.inTypeCode})` : ""}</td>
                        <td>{`${row.supplierCode ?? ""}${row.supplierCode ? " / " : ""}${row.supplierName ?? "-"}`}</td>
                        <td>{row.warehouseName ?? "-"}</td>
                        <td>
                          {row.type === "외주"
                            ? <StatusBadge tone="consign">외주</StatusBadge>
                            : <StatusBadge tone="gray">일반</StatusBadge>}
                        </td>
                        <td>{row.expectedAt ?? "-"}</td>
                        <td className="num">{row.qty.toLocaleString()}</td>
                        <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                        <td>
                          <div className="outbound-row-actions">
                            {row.status === "scheduled" && (
                              <button type="button" className="btn-secondary" disabled={busy} onClick={() => doRegister(row.id)}>입고등록</button>
                            )}
                            {row.status === "registered" && (
                              <button type="button" className="btn-secondary" disabled={busy} onClick={() => openAssign(row)}>창고·로케이션 지정</button>
                            )}
                            {row.status === "located" && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => navigate("/inbound/inbound-confirm")}
                                title="검수·QR라벨·확정은 입고 확정 화면에서 처리합니다"
                              >
                                입고확정 화면으로
                              </button>
                            )}
                            {row.status === "confirmed" && <span className="cell-mut">입고완료</span>}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="outbound-detail-row">
                          <td colSpan={9}>
                            <div className="outbound-detail">
                              <div className="outbound-detail-head">
                                <strong>{row.inboundNo} · 입고 품목 {lines ? `(${lines.length}건)` : ""}</strong>
                                <span>
                                  공급처 {`${row.supplierCode ?? ""}/${row.supplierName ?? "-"}`}
                                  {" · "}입고형태 {`${row.inTypeCode ?? "-"}/${row.inTypeName ?? "-"}`}
                                  {" · "}구매그룹 {`${row.purchaseGroupCode ?? "-"}/${row.purchaseGroupName ?? "-"}`}
                                  {row.poNo ? ` · PO ${row.poNo}` : ""}
                                  {" · "}{row.warehouseName ?? "-"}
                                  {" · "}예정 합계 {row.qty.toLocaleString()}
                                  {row.remark ? ` · 비고: ${row.remark}` : ""}
                                </span>
                              </div>
                              {linesLoadingIds.includes(row.id) ? (
                                <p className="outbound-detail-empty">품목 정보를 불러오는 중...</p>
                              ) : !lines || lines.length === 0 ? (
                                <p className="outbound-detail-empty">등록된 품목 라인이 없습니다.</p>
                              ) : (
                                <table className="outbound-detail-table">
                                  <thead>
                                    <tr>
                                      <th>SKU</th>
                                      <th>품목명</th>
                                      <th>품목규격</th>
                                      <th>로케이션</th>
                                      <th>Tracking No</th>
                                      <th>검사품</th>
                                      <th className="num">예정수량</th>
                                      <th className="num">입고(재고처리)</th>
                                      <th>단위</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((ln) => {
                                      const short = ln.receivedQty > 0 && ln.receivedQty < ln.expectedQty;
                                      return (
                                        <tr key={ln.id}>
                                          <td>
                                            {ln.itemCode}
                                            {ln.consign && <span className="outbound-consign-tag">외주</span>}
                                          </td>
                                          <td>{ln.itemName}</td>
                                          <td>{ln.spec ?? "-"}</td>
                                          <td>{ln.locationCode ?? "-"}</td>
                                          <td>{ln.trackingNo ?? "-"}</td>
                                          <td>{ln.inspected ? <span className="outbound-consign-tag">검사</span> : "-"}</td>
                                          <td className="num">{ln.expectedQty.toLocaleString()}</td>
                                          <td className={`num${short ? " is-short" : ""}`}>{ln.receivedQty.toLocaleString()}</td>
                                          <td>{ln.unit}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="outbound-pagination">
          <span className="outbound-pagination-info">
            총 {filtered.length}건 중 {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} 표시 · {page}/{pageCount} 페이지
          </span>
          <div className="outbound-pagination-controls">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              이전
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                className={`outbound-page-btn${n === page ? " is-active" : ""}`}
                onClick={() => setPage(n)}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              다음
            </button>
          </div>
        </div>
      </DashboardCard>

      <Modal
        open={assignTarget !== null}
        title="창고·로케이션 지정"
        desc={assignTarget ? `${assignTarget.inboundNo} · ${assignTarget.supplierName ?? ""}` : ""}
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setAssignTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssignTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doAssign}>지정 완료</button>
          </>
        }
      >
        <label className="ds-field">
          <span>창고</span>
          <select value={assignWh ?? ""} onChange={(e) => onAssignWhChange(Number(e.target.value))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
            ))}
          </select>
        </label>
        <div className="inb-assign-lines">
          <div className="inb-assign-row inb-assign-head">
            <span>품목</span>
            <span>로케이션</span>
          </div>
          {(assignTarget ? linesByInbound[assignTarget.id] ?? [] : []).map((ln) => (
            <div className="inb-assign-row" key={ln.id}>
              <span>{ln.itemCode} · {ln.itemName}</span>
              <select
                value={assignLocs[ln.id] ?? ""}
                onChange={(e) =>
                  setAssignLocs((p) => ({ ...p, [ln.id]: e.target.value === "" ? "" : Number(e.target.value) }))
                }
              >
                <option value="">로케이션 선택</option>
                {whLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.code} · {l.zoneName}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Modal>

    </section>
  );
};
