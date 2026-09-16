import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { QrBox } from "../../components/ui/QrBox";
import { apiGet, apiPost, apiPut } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import { shiftDays } from "../../shared/appDate";
import "./DashboardInbound.css";

/* ============================================================
   입고 예정 — 단계 파이프라인 + 리스트/보드/도크 3뷰 + 마스터-디테일
   기준: DOCS/front 운영화면 재설계 HTML
   ============================================================ */

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

type DockBlock = {
  inboundNo: string;
  partner: string;
  from: number;
  to: number;
  status: string;
  pct: number;
  warn?: boolean;
};
type DockSchedule = {
  now: string;
  nowMin: number;
  startMin: number;
  endMin: number;
  lanes: Array<{ name: string; sub: string; tone: string; blocks: DockBlock[] }>;
};

type StageKey = "scheduled" | "registered" | "located" | "confirmed";

const STAGES: Array<{ key: StageKey; label: string; tone: string }> = [
  { key: "scheduled", label: "입고예정", tone: "gray" },
  { key: "registered", label: "입고등록", tone: "info" },
  { key: "located", label: "로케이션 지정", tone: "warning" },
  { key: "confirmed", label: "입고확정", tone: "success" }
];
const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));

const KIND_TONE: Record<string, string> = { 일반: "gray", 외주: "consign", 이동: "teal" };

const VIEWS = [
  { key: "list", label: "리스트", icon: "menu", note: "파이프라인으로 걸러 목록·상세로 처리합니다." },
  { key: "board", label: "보드", icon: "grid", note: "단계가 열입니다. 카드를 눌러 상세를 확인합니다." },
  { key: "dock", label: "도크 스케줄", icon: "truck", note: "도크·검수라인의 시간 점유입니다. 빨간 선이 현재 시각." }
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

const PAGE_SIZE = 10;
const num = (n: number) => n.toLocaleString("ko-KR");
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const DashboardInbound = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<InboundRow[]>([]);
  const [dock, setDock] = useState<DockSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<ViewKey>("list");
  const [stage, setStage] = useState<StageKey | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => shiftDays(-15));
  const [dateTo, setDateTo] = useState(() => shiftDays(15));
  const [page, setPage] = useState(1);
  const [selId, setSelId] = useState<number | null>(null);

  const [linesById, setLinesById] = useState<Record<number, InboundLine[]>>({});
  const [linesLoading, setLinesLoading] = useState<number[]>([]);

  // 창고·로케이션 지정 모달
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [assignTarget, setAssignTarget] = useState<InboundRow | null>(null);
  const [assignWh, setAssignWh] = useState<number | null>(null);
  const [whLocations, setWhLocations] = useState<LocationOption[]>([]);
  const [assignLocs, setAssignLocs] = useState<Record<number, number | "">>({});
  const [labelTarget, setLabelTarget] = useState<InboundRow | null>(null);

  const fetchLines = (id: number) => {
    if (linesById[id] || linesLoading.includes(id)) return;
    setLinesLoading((p) => [...p, id]);
    apiGet<InboundLine[]>(`/inbounds/${id}/lines`)
      .then((lines) => setLinesById((prev) => ({ ...prev, [id]: lines })))
      .catch((e) => setError(e instanceof Error ? e.message : "품목 정보 불러오기 실패"))
      .finally(() => setLinesLoading((p) => p.filter((x) => x !== id)));
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
  useEffect(() => {
    apiGet<WarehouseOption[]>("/warehouses").then(setWarehouses).catch(() => {});
    apiGet<DockSchedule>("/inbounds/dock-schedule").then(setDock).catch(() => {});
  }, []);

  const invalidateLines = (id: number) =>
    setLinesById((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });

  /* ---------- 필터 / 파이프라인 ---------- */
  const searched = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw) {
        const hay = [r.inboundNo, r.poNo, r.supplierCode, r.supplierName, r.warehouseName, r.inTypeName, r.purchaseGroupName]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      if (typeFilter && r.type !== typeFilter) return false;
      if (dateFrom && (r.expectedAt ?? "") < dateFrom) return false;
      if (dateTo && (r.expectedAt ?? "") > dateTo) return false;
      return true;
    });
  }, [rows, keyword, typeFilter, dateFrom, dateTo]);

  const filtered = useMemo(
    () => (stage === "all" ? searched : searched.filter((r) => r.status === stage)),
    [searched, stage]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => setPage(1), [keyword, typeFilter, dateFrom, dateTo, stage]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // 선택 행 유지 — 목록에서 빠지면 첫 행으로
  useEffect(() => {
    if (!filtered.length) {
      setSelId(null);
      return;
    }
    setSelId((prev) => (prev && filtered.some((r) => r.id === prev) ? prev : filtered[0].id));
  }, [filtered]);

  const selected = rows.find((r) => r.id === selId) ?? null;
  useEffect(() => {
    if (selected) fetchLines(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);
  // 보드 뷰는 카드마다 진행률을 그리므로 현재 목록의 라인을 미리 읽는다
  useEffect(() => {
    if (view === "board") filtered.forEach((r) => fetchLines(r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filtered]);

  const stageCards = useMemo(() => {
    const total = searched.length || 1;
    const all = [
      { key: "all" as const, label: "전체", tone: "ink", count: searched.length },
      ...STAGES.map((s) => ({ key: s.key, label: s.label, tone: s.tone, count: searched.filter((r) => r.status === s.key).length }))
    ];
    return all.map((s) => ({ ...s, pct: Math.round((s.count / total) * 100) }));
  }, [searched]);

  /* ---------- 처리 액션 ---------- */
  const doRegister = async (id: number) => {
    setBusy(true);
    try {
      await apiPost(`/inbounds/${id}/register`, {});
      setNotice("입고등록 완료 — 창고·로케이션을 지정하세요.");
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "입고등록 실패");
    } finally {
      setBusy(false);
    }
  };

  const openAssign = async (row: InboundRow) => {
    setAssignTarget(row);
    const wh = row.warehouseId ?? warehouses[0]?.id ?? null;
    setAssignWh(wh);
    let lines = linesById[row.id];
    if (!lines) {
      lines = await apiGet<InboundLine[]>(`/inbounds/${row.id}/lines`);
      setLinesById((p) => ({ ...p, [row.id]: lines as InboundLine[] }));
    }
    const init: Record<number, number | ""> = {};
    lines.forEach((ln) => {
      init[ln.id] = ln.locationId ?? "";
    });
    setAssignLocs(init);
    if (wh != null) {
      try {
        setWhLocations(await apiGet<LocationOption[]>(`/warehouses/${wh}/locations`));
      } catch {
        setWhLocations([]);
      }
    }
  };

  const onAssignWhChange = async (whId: number) => {
    setAssignWh(whId);
    let locs: LocationOption[] = [];
    try {
      locs = await apiGet<LocationOption[]>(`/warehouses/${whId}/locations`);
    } catch {
      /* noop */
    }
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
    const lines = linesById[assignTarget.id] ?? [];
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
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "지정 실패");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `입고예정_${dateFrom}_${dateTo}`,
      ["입고번호", "PO", "공급처", "창고", "구분", "입고형태", "구매그룹", "예정일", "예정수량", "상태"],
      filtered.map((r) => [
        r.inboundNo, r.poNo, r.supplierName, r.warehouseName, r.type, r.inTypeName,
        r.purchaseGroupName, r.expectedAt, r.qty, STAGE_MAP[r.status]?.label ?? r.status
      ])
    );

  /* ---------- 선택 건 상세 ---------- */
  const selLines = selected ? linesById[selected.id] ?? [] : [];
  const shortLine = selLines.find((l) => l.receivedQty > 0 && l.receivedQty < l.expectedQty);
  const unlocated = selLines.filter((l) => !l.locationCode).length;

  const cta = useMemo(() => {
    if (!selected) return null;
    switch (selected.status) {
      case "scheduled":
        return {
          label: "입고 등록",
          tone: "info" as const,
          hint: "ERP PO 수량 기준으로 수신된 예정 건입니다. 입고 등록 후 창고·로케이션을 지정하세요.",
          run: () => doRegister(selected.id)
        };
      case "registered":
        return {
          label: "창고 · 로케이션 지정",
          tone: unlocated ? ("warning" as const) : ("info" as const),
          hint: unlocated
            ? `로케이션 미지정 라인이 ${unlocated}건 있습니다. 전 라인 지정 후 검수로 넘어갑니다.`
            : "전 라인 로케이션이 지정되었습니다. 검수로 넘어갈 수 있습니다.",
          run: () => openAssign(selected)
        };
      case "located":
        return {
          label: "검수 · 입고확정",
          tone: shortLine ? ("danger" as const) : ("info" as const),
          hint: shortLine
            ? `${shortLine.itemCode} 입고수량이 예정보다 ${num(shortLine.expectedQty - shortLine.receivedQty)} 부족합니다 (쇼트). 확정 시 차이내역이 ERP로 전송됩니다.`
            : "검수 수량을 확인하고 입고확정하면 격납대기 재고가 생성됩니다.",
          run: () => navigate("/inbound/inbound-confirm")
        };
      default:
        return {
          label: "격납 지시 생성",
          tone: "success" as const,
          hint: "입고확정 완료 · 격납대기 재고가 생성되었습니다. 격납 대기 화면으로 넘어갑니다.",
          run: () => navigate("/stock/putaway")
        };
    }
  }, [selected, unlocated, shortLine, navigate]);

  const viewNote = VIEWS.find((v) => v.key === view)?.note ?? "";

  return (
    <section className="inb-page">
      {/* ---------- 뷰 전환 + 조회 기간 ---------- */}
      <header className="inb-toolbar card">
        <div className="inb-views" role="tablist" aria-label="보기 방식">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={`inb-view${view === v.key ? " is-on" : ""}`}
              onClick={() => setView(v.key)}
            >
              <Icon name={v.icon} size={15} />
              {v.label}
            </button>
          ))}
          <span className="inb-view-note">{viewNote}</span>
        </div>
        <div className="inb-period">
          <span className="nx-eyebrow">조회기간</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="시작일" />
          <span className="inb-period-dash">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="종료일" />
          <button type="button" className="nx-iconbtn" onClick={load} title="새로고침" aria-label="새로고침">
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </header>

      {/* ---------- 단계 파이프라인 ---------- */}
      <div className="inb-stages">
        {stageCards.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`inb-stage card${stage === s.key ? " is-on" : ""}`}
            onClick={() => setStage(s.key as StageKey | "all")}
          >
            <span className="inb-stage-head">
              <i className={`inb-dot tone-${s.tone}`} />
              {s.label}
            </span>
            <span className="inb-stage-num">
              {loading ? "—" : s.count}
              <small>건</small>
            </span>
            <span className="inb-stage-bar">
              <i className={`tone-${s.tone}`} style={{ width: `${s.pct}%` }} />
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
        </div>
      ) : null}
      {notice ? (
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* ---------- 리스트 뷰 ---------- */}
      {view === "list" ? (
        <div className="inb-main">
          <section className="card inb-list">
            <div className="inb-card-head">
              <div className="nx-sect">
                <span className="nx-sect-title">입고 목록</span>
                <span className="inb-count">{filtered.length}건</span>
              </div>
              <div className="inb-head-tools">
                <div className="inb-search">
                  <Icon name="search" size={15} />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="입고번호 · PO · 공급처 · 창고"
                    aria-label="입고 검색"
                  />
                </div>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="구분">
                  <option value="">전체 구분</option>
                  <option value="일반">일반</option>
                  <option value="외주">외주</option>
                  <option value="이동">이동</option>
                </select>
                <button type="button" className="inb-btn" onClick={exportCsv}>
                  <Icon name="download" size={14} />
                  내보내기
                </button>
                <button
                  type="button"
                  className="inb-btn is-primary"
                  disabled
                  title="입고예정은 ERP PO 수신 기준입니다. WMS 직접 등록 여부는 미확정(프로세스 문서 §12-1)"
                >
                  <Icon name="plus" size={14} />
                  입고 등록
                </button>
              </div>
            </div>

            <div className="inb-table-wrap">
              <table className="data-table inb-table">
                <thead>
                  <tr>
                    <th>입고번호</th>
                    <th>공급처</th>
                    <th>구분</th>
                    <th>예정일</th>
                    <th className="num">예정수량</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const st = STAGE_MAP[r.status];
                    return (
                      <tr
                        key={r.id}
                        className={`inb-row${selId === r.id ? " is-sel" : ""}`}
                        onClick={() => setSelId(r.id)}
                      >
                        <td>
                          <div className="inb-no">{r.inboundNo}</div>
                          <div className="inb-sub">{r.poNo ? `PO ${r.poNo}` : "PO —"}</div>
                        </td>
                        <td>{r.supplierName}</td>
                        <td>
                          <span className={`ds-badge ${KIND_TONE[r.type] ?? "gray"}`}>{r.type}</span>
                        </td>
                        <td className="inb-date">{(r.expectedAt ?? "").slice(5)}</td>
                        <td className="num">{num(r.qty)}</td>
                        <td>
                          <span className={`ds-badge ${st?.tone ?? "gray"}`}>
                            <i className="bdot" />
                            {st?.label ?? r.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!paged.length && !loading ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="nx-empty">조건에 맞는 입고 예정이 없습니다.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="inb-pager">
              <span>
                총 {filtered.length}건 · {page}/{pageCount} 페이지
              </span>
              <div className="inb-pager-btns">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  이전
                </button>
                <span className="inb-pager-now">{page}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
                  다음
                </button>
              </div>
            </div>
          </section>

          {/* ---------- 상세 패널 ---------- */}
          <aside className="card inb-detail">
            {!selected ? (
              <div className="nx-empty">좌측 목록에서 입고 건을 선택하세요.</div>
            ) : (
              <>
                <div className="inb-detail-head">
                  <div>
                    <div className="inb-detail-no">{selected.inboundNo}</div>
                    <div className="inb-sub">
                      {selected.supplierCode ? `${selected.supplierCode} · ` : ""}
                      {selected.supplierName}
                    </div>
                  </div>
                  <span className={`ds-badge ${STAGE_MAP[selected.status]?.tone ?? "gray"}`}>
                    <i className="bdot" />
                    {STAGE_MAP[selected.status]?.label ?? selected.status}
                  </span>
                </div>

                <dl className="inb-meta">
                  <div>
                    <dt>창고</dt>
                    <dd>{selected.warehouseName ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>입고형태</dt>
                    <dd>
                      {selected.inTypeName ?? "-"}
                      {selected.inTypeCode ? ` (${selected.inTypeCode})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>구매그룹</dt>
                    <dd>
                      {selected.purchaseGroupCode ? `${selected.purchaseGroupCode} ` : ""}
                      {selected.purchaseGroupName ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>예정일</dt>
                    <dd>{selected.expectedAt ?? "-"}</dd>
                  </div>
                </dl>

                <div className="inb-lines-head">
                  <span>품목 {selLines.length}건</span>
                  <b>예정 {num(selected.qty)} EA</b>
                </div>

                <div className="inb-lines">
                  {selLines.map((ln) => {
                    const pct = ln.expectedQty ? Math.round((ln.receivedQty / ln.expectedQty) * 100) : 0;
                    const short = ln.receivedQty > 0 && ln.receivedQty < ln.expectedQty;
                    const none = ln.receivedQty === 0;
                    return (
                      <article key={ln.id} className={`inb-line${short ? " is-short" : ""}`}>
                        <div className="inb-line-top">
                          <span className="inb-line-sku">{ln.itemCode}</span>
                          <span className={`inb-line-qty${short ? " is-short" : none ? " is-none" : " is-done"}`}>
                            {num(ln.receivedQty)} / {num(ln.expectedQty)}
                          </span>
                        </div>
                        <div className="inb-line-name">{ln.itemName}</div>
                        <div className="inb-line-tags">
                          {ln.spec ? <span className="inb-chip">{ln.spec}</span> : null}
                          <span className={`inb-chip${ln.locationCode ? "" : " is-warn"}`}>
                            {ln.locationCode ?? "로케이션 미지정"}
                          </span>
                          {ln.trackingNo ? <span className="inb-chip is-mono">{ln.trackingNo}</span> : null}
                          {ln.consign ? <span className="ds-badge consign">외주</span> : null}
                          {ln.inspected ? <span className="ds-badge info">검사</span> : null}
                        </div>
                        <div className={`nx-bar ${short ? "is-danger" : none ? "" : "is-ok"} inb-line-bar`}>
                          <i style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </article>
                    );
                  })}
                  {!selLines.length ? <div className="nx-empty">품목 라인을 불러오는 중…</div> : null}
                </div>

                {cta ? (
                  <>
                    <div className={`ds-callout ${cta.tone} inb-hint`}>
                      <Icon name={cta.tone === "danger" ? "alert" : "check"} size={16} />
                      <span>{cta.hint}</span>
                    </div>
                    <div className="inb-detail-actions">
                      <button type="button" className="inb-btn" onClick={() => setLabelTarget(selected)}>
                        <Icon name="grid" size={14} />
                        QR 라벨
                      </button>
                      <button type="button" className="btn-primary inb-cta" disabled={busy} onClick={cta.run}>
                        {cta.label}
                        <Icon name="arrowR" size={15} />
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </aside>
        </div>
      ) : null}

      {/* ---------- 보드 뷰 ---------- */}
      {view === "board" ? (
        <div className="inb-board">
          {STAGES.map((s) => {
            const list = searched.filter((r) => r.status === s.key);
            return (
              <section key={s.key} className="card inb-col">
                <div className="inb-col-head">
                  <span className="inb-col-title">
                    <i className={`inb-dot tone-${s.tone}`} />
                    {s.label}
                  </span>
                  <span className="inb-col-meta">
                    {list.length}건 · {num(list.reduce((a, r) => a + r.qty, 0))} EA
                  </span>
                </div>
                <div className="inb-col-body">
                  {list.map((r) => {
                    const lines = linesById[r.id] ?? [];
                    const done = lines.filter((l) => l.expectedQty > 0 && l.receivedQty === l.expectedQty).length;
                    const short = lines.find((l) => l.receivedQty > 0 && l.receivedQty < l.expectedQty);
                    const pct = lines.length ? Math.round((done / lines.length) * 100) : 0;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`inb-card${short ? " is-short" : ""}${selId === r.id ? " is-sel" : ""}`}
                        onClick={() => {
                          setSelId(r.id);
                          setView("list");
                        }}
                      >
                        <span className="inb-card-top">
                          <b>{r.inboundNo}</b>
                          <span className={`ds-badge ${KIND_TONE[r.type] ?? "gray"}`}>{r.type}</span>
                        </span>
                        <span className="inb-sub">{r.supplierName}</span>
                        <span className="inb-card-foot">
                          <span>품목 {lines.length}건</span>
                          <b>{num(r.qty)} EA</b>
                        </span>
                        <span className={`nx-bar ${short ? "is-danger" : pct === 100 ? "is-ok" : "is-info"}`}>
                          <i style={{ width: `${short ? 100 : pct}%` }} />
                        </span>
                        {short ? (
                          <span className="inb-card-warn">
                            <Icon name="alert" size={13} />
                            {short.itemCode} 쇼트 −{num(short.expectedQty - short.receivedQty)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {!list.length ? <div className="nx-empty">해당 단계 없음</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {/* ---------- 도크 스케줄 뷰 ---------- */}
      {view === "dock" ? (
        <section className="card inb-dock">
          <div className="inb-card-head">
            <div className="nx-sect">
              <span className="nx-sect-title">도크 · 검수라인 점유</span>
              <span className="nx-sect-sub">08:00 ~ 18:00 · 현재 {dock?.now ?? "--:--"}</span>
            </div>
            <div className="inb-legend">
              {STAGES.map((s) => (
                <span key={s.key}>
                  <i className={`inb-dot tone-${s.tone}`} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {dock ? (
            <div className="inb-gantt">
              <div className="inb-gantt-hours">
                <span className="inb-lane-label" />
                <div className="inb-gantt-track">
                  {Array.from({ length: 11 }, (_, i) => dock.startMin + i * 60).map((min) => (
                    <span
                      key={min}
                      className="inb-hour"
                      style={{ left: `${((min - dock.startMin) / (dock.endMin - dock.startMin)) * 100}%` }}
                    >
                      {hhmm(min)}
                    </span>
                  ))}
                </div>
              </div>

              {dock.lanes.map((lane) => (
                <div key={lane.name} className="inb-lane">
                  <div className="inb-lane-label">
                    <b>{lane.name}</b>
                    <span>{lane.sub}</span>
                  </div>
                  <div className="inb-gantt-track">
                    {Array.from({ length: 11 }, (_, i) => i).map((i) => (
                      <span key={i} className="inb-grid-line" style={{ left: `${(i / 10) * 100}%` }} />
                    ))}
                    <span
                      className="inb-now"
                      style={{ left: `${((dock.nowMin - dock.startMin) / (dock.endMin - dock.startMin)) * 100}%` }}
                      title={`현재 ${dock.now}`}
                    />
                    {lane.blocks.map((b) => {
                      const st = STAGE_MAP[b.status];
                      const row = rows.find((r) => r.inboundNo === b.inboundNo);
                      return (
                        <button
                          key={b.inboundNo + b.from}
                          type="button"
                          className={`inb-block tone-${st?.tone ?? "gray"}${b.warn ? " is-warn" : ""}`}
                          style={{
                            left: `${((b.from - dock.startMin) / (dock.endMin - dock.startMin)) * 100}%`,
                            width: `${((b.to - b.from) / (dock.endMin - dock.startMin)) * 100}%`
                          }}
                          title={`${b.inboundNo} · ${b.partner} · ${hhmm(b.from)}~${hhmm(b.to)}`}
                          onClick={() => {
                            if (!row) return;
                            setSelId(row.id);
                            setView("list");
                          }}
                        >
                          <span className="inb-block-no">{b.inboundNo.slice(-8)}</span>
                          <span className="inb-block-sub">{b.partner}</span>
                          <span className={`nx-bar ${b.warn ? "is-danger" : b.pct === 100 ? "is-ok" : "is-info"}`}>
                            <i style={{ width: `${b.pct}%` }} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="nx-empty">도크 스케줄을 불러오는 중…</div>
          )}
        </section>
      ) : null}

      {/* ---------- 창고·로케이션 지정 ---------- */}
      <Modal
        open={assignTarget !== null}
        title="창고 · 로케이션 지정"
        desc={assignTarget ? `${assignTarget.inboundNo} · 예정 ${num(assignTarget.qty)}` : ""}
        icon="pin"
        iconBg="var(--c-warning-bg)"
        iconColor="var(--c-warning-ink)"
        onClose={() => setAssignTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssignTarget(null)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doAssign}>
              지정 완료
            </button>
          </>
        }
      >
        <label className="ds-field">
          <span>입고 창고</span>
          <select value={assignWh ?? ""} onChange={(e) => onAssignWhChange(Number(e.target.value))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.type})
              </option>
            ))}
          </select>
        </label>
        {(assignTarget ? linesById[assignTarget.id] ?? [] : []).map((ln) => (
          <label key={ln.id} className="ds-field">
            <span>
              {ln.itemCode} · {ln.itemName}
            </span>
            <select
              value={assignLocs[ln.id] ?? ""}
              onChange={(e) =>
                setAssignLocs((p) => ({ ...p, [ln.id]: e.target.value === "" ? "" : Number(e.target.value) }))
              }
            >
              <option value="">로케이션 선택</option>
              {whLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.zoneName}
                </option>
              ))}
            </select>
          </label>
        ))}
      </Modal>

      {/* ---------- QR 입고라벨 ---------- */}
      <Modal
        open={labelTarget !== null}
        title="QR 입고라벨"
        desc={labelTarget ? `${labelTarget.inboundNo} · LOT-${labelTarget.inboundNo}` : ""}
        icon="grid"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        onClose={() => setLabelTarget(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setLabelTarget(null)}>
            닫기
          </button>
        }
      >
        {labelTarget ? (
          <div className="inb-label">
            <div className="inb-label-qr">
              <QrBox value={`WMS-IN|${labelTarget.inboundNo}|LOT-${labelTarget.inboundNo}`} />
              <span>스캔용 QR</span>
            </div>
            <dl className="inb-meta">
              <div>
                <dt>입고번호</dt>
                <dd>{labelTarget.inboundNo}</dd>
              </div>
              <div>
                <dt>LOT</dt>
                <dd>LOT-{labelTarget.inboundNo}</dd>
              </div>
              <div>
                <dt>공급처</dt>
                <dd>{labelTarget.supplierName}</dd>
              </div>
              <div>
                <dt>예정수량</dt>
                <dd>{num(labelTarget.qty)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
