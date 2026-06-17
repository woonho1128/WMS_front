import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCard } from "./components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { QrBox } from "../../components/ui/QrBox";
import { OUTBOUND_STEPS, OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet } from "../../services/http";
import "./DashboardOutbound.css";

type OutboundRow = {
  id: number;
  outboundNo: string;
  scheduledDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  outType: string | null;
  qty: number;
  carrier: string | null;
  shipAddress: string | null;
  invoiceNo: string | null;
  status: OutboundScreenStatus;
  rejectReason: string | null;
};

type OutboundLine = {
  id: number;
  itemCode: string;
  itemName: string;
  unit: string;
  consign: boolean;
  locationCode: string | null;
  orderQty: number;
  pickedQty: number;
  availableQty: number | null;
};

const isFinal = (s: string) => s === "출고완료" || s === "거부";
const PAGE_SIZE = 10;

// 로컬 기준 yyyy-MM-dd 포맷 (toISOString 의 UTC 밀림 방지)
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// 오늘 기준 n일 이동한 날짜 문자열 (출고예정일 기본 범위용)
const shiftDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

/** 출고 요청서 — OMS 오더 수신 내역 조회 / 오더라벨 출력 / 단계별 상태관리 (피킹·확정은 전용 화면) */
export const DashboardOutbound = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => shiftDays(-15)); // 오늘 -15일
  const [dateTo, setDateTo] = useState(() => shiftDays(15));      // 오늘 +15일
  const [notice, setNotice] = useState("OMS 수신 오더 목록입니다. 피킹은 피킹 작업, 확정은 출고 확정 화면에서 진행하세요.");
  const [labelTarget, setLabelTarget] = useState<OutboundRow | null>(null);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [linesByOutbound, setLinesByOutbound] = useState<Record<number, OutboundLine[]>>({});
  const [linesLoadingIds, setLinesLoadingIds] = useState<number[]>([]);

  // 라인(상품) 로드 — 이미 캐시된 건 재요청 안 함
  const fetchLines = (id: number) => {
    if (linesByOutbound[id]) return;
    setLinesLoadingIds((p) => (p.includes(id) ? p : [...p, id]));
    apiGet<OutboundLine[]>(`/outbounds/${id}/lines`)
      .then((lines) => setLinesByOutbound((prev) => ({ ...prev, [id]: lines })))
      .catch((e) => setNotice(e instanceof Error ? e.message : "상품 정보 불러오기 실패"))
      .finally(() => setLinesLoadingIds((p) => p.filter((x) => x !== id)));
  };

  const reload = () => {
    setLoading(true);
    return apiGet<OutboundRow[]>("/outbounds")
      .then(setRows)
      .catch((e) => setNotice(`불러오기 실패: ${e instanceof Error ? e.message : e} (백엔드 8080 확인)`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  // 출고형태 옵션(데이터에서 도출)
  const outTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.outType).filter((v): v is string => !!v))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw) {
        const hay = [r.outboundNo, r.customerCode, r.customerName, r.shipAddress, r.invoiceNo]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.outType !== typeFilter) return false;
      // scheduledDate 는 "yyyy-MM-dd" 문자열 → ISO 사전식 비교로 기간 필터
      if (dateFrom && (r.scheduledDate ?? "") < dateFrom) return false;
      if (dateTo && (r.scheduledDate ?? "") > dateTo) return false;
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
      waiting: by("출고대기"),
      picking: by("피킹중"),
      picked: by("피킹완료"),
      done: by("출고완료"),
      rejected: by("거부")
    };
  }, [filtered]);

  // 페이지네이션
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // 필터 변경 시 1페이지로, 페이지 수가 줄면 범위 보정
  useEffect(() => setPage(1), [keyword, statusFilter, typeFilter, dateFrom, dateTo]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // 디폴트: 현재 페이지의 행들을 펼치고 라인 미리 로드 (페이지 이동 시 매번 적용)
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

  // 행 클릭 시 펼침/접힘. 단, 입력·버튼 등 조작 요소 클릭은 제외.
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: number) => {
    if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
    toggleExpand(id);
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="출고 처리 단계"
        steps={OUTBOUND_STEPS}
        current={0}
        note="이 화면: OMS 오더 수신 조회·오더라벨 — 피킹은 피킹 작업, 송장·확정은 출고 확정 화면에서"
      />

      <section className="outbound-summary-grid" aria-label="출고 요약">
        <article className="app-surface outbound-summary-card"><span>조회 건수</span><strong>{summary.total}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>출고대기</span><strong>{summary.waiting}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹중</span><strong>{summary.picking}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹완료</span><strong>{summary.picked}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>출고완료</span><strong>{summary.done}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>거부</span><strong>{summary.rejected}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="출고 요청 조회 조건">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="출하번호 / 납품처 / 주소 / 송장번호"
            />
          </label>
          <label>
            <span>출고상태</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">전체</option>
              <option value="출고대기">출고대기</option>
              <option value="피킹중">피킹중</option>
              <option value="피킹완료">피킹완료</option>
              <option value="출고완료">출고완료</option>
              <option value="거부">거부</option>
            </select>
          </label>
          <label>
            <span>출고형태</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">전체</option>
              {outTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span>출고예정일(시작)</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            <span>출고예정일(종료)</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={resetFilters}>초기화</button>
            <button type="button" className="btn-secondary" onClick={reload}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`출고 요청 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice}</p>
          <div className="outbound-expand-actions">
            <button type="button" className="btn-secondary" onClick={expandAll}>상품 전체 펼치기</button>
            <button type="button" className="btn-secondary" onClick={collapseAll}>전체 숨기기</button>
          </div>
        </div>
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>출하번호</th>
                <th>출고예정일</th>
                <th>납품처</th>
                <th>출고형태</th>
                <th className="num">수량</th>
                <th>운송정보</th>
                <th>송장번호</th>
                <th>배송주소</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>데이터가 없습니다.</td></tr>
              ) : (
                paged.map((row) => {
                  const final = isFinal(row.status);
                  const expanded = expandedIds.includes(row.id);
                  const lines = linesByOutbound[row.id];
                  return (
                    <Fragment key={row.id}>
                    <tr
                      className={`outbound-master-row${expanded ? " is-expanded" : ""}`}
                      onClick={(e) => onRowClick(e, row.id)}
                    >
                      <td>
                        <span className="outbound-expand-caret" aria-hidden>{expanded ? "▾" : "▸"}</span>
                        {row.outboundNo}
                      </td>
                      <td>{row.scheduledDate ?? "-"}</td>
                      <td>{`${row.customerCode ?? ""} / ${row.customerName ?? ""}`}</td>
                      <td>{row.outType ?? "-"}</td>
                      <td className="num">{row.qty.toLocaleString()}</td>
                      <td>{row.carrier ?? "-"}</td>
                      <td><span className="cell-mut">{row.invoiceNo ?? "-"}</span></td>
                      <td>
                        <span className="outbound-addr-cell" title={row.shipAddress ?? ""}>
                          {row.shipAddress ?? "-"}
                        </span>
                      </td>
                      <td>
                        <StatusBadge tone={OUTBOUND_STATUS_TONE[row.status]}>{row.status}</StatusBadge>
                      </td>
                      <td>
                        <div className="outbound-row-actions">
                          <button type="button" className="btn-secondary" onClick={() => { fetchLines(row.id); setLabelTarget(row); }}>
                            오더라벨
                          </button>
                          {row.status === "출고대기" || row.status === "피킹중" ? (
                            <button type="button" className="btn-secondary" onClick={() => navigate("/outbound/picking")}>
                              피킹 작업으로
                            </button>
                          ) : row.status === "피킹완료" ? (
                            <button type="button" className="btn-secondary" onClick={() => navigate("/outbound/outbound-confirm")}>
                              출고 확정으로
                            </button>
                          ) : (
                            <span className="cell-mut">{final ? "처리 완료" : ""}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="outbound-detail-row">
                        <td colSpan={10}>
                          <div className="outbound-detail">
                            <div className="outbound-detail-head">
                              <strong>{row.outboundNo} · 출고 상품 {lines ? `(${lines.length}건)` : ""}</strong>
                              <span>
                                {`${row.customerCode ?? ""} / ${row.customerName ?? ""}`}
                                {row.shipAddress ? ` · 배송 ${row.shipAddress}` : ""} · 주문 합계 {row.qty.toLocaleString()}
                              </span>
                            </div>
                            {linesLoadingIds.includes(row.id) ? (
                              <p className="outbound-detail-empty">상품 정보를 불러오는 중...</p>
                            ) : !lines || lines.length === 0 ? (
                              <p className="outbound-detail-empty">등록된 상품 라인이 없습니다.</p>
                            ) : (
                              <table className="outbound-detail-table">
                                <thead>
                                  <tr>
                                    <th>SKU</th>
                                    <th>상품명</th>
                                    <th>로케이션</th>
                                    <th className="num">주문수량</th>
                                    <th className="num">피킹수량</th>
                                    <th className="num">가용재고</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((ln) => {
                                    const short = ln.availableQty != null && ln.availableQty < ln.orderQty;
                                    return (
                                      <tr key={ln.id}>
                                        <td>
                                          {ln.itemCode}
                                          {ln.consign && <span className="outbound-consign-tag">외주</span>}
                                        </td>
                                        <td>{ln.itemName}</td>
                                        <td>{ln.locationCode ?? "-"}</td>
                                        <td className="num">{ln.orderQty.toLocaleString()} {ln.unit}</td>
                                        <td className="num">{ln.pickedQty.toLocaleString()}</td>
                                        <td className={`num${short ? " is-short" : ""}`}>
                                          {ln.availableQty != null ? ln.availableQty.toLocaleString() : "-"}
                                        </td>
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

      {/* 오더라벨 (A4/라벨 출력 미리보기) */}
      <Modal
        open={labelTarget !== null}
        title="오더라벨"
        desc={labelTarget ? `${labelTarget.outboundNo} · ${labelTarget.customerName ?? ""}` : ""}
        icon="checkCircle"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setLabelTarget(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setLabelTarget(null)}>닫기</button>
        }
      >
        {labelTarget ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ border: "1px solid var(--line, #ddd)", borderRadius: 8, padding: 10, background: "#fff" }}>
              <QrBox value={`WMS-OUT|${labelTarget.outboundNo}`} />
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>데모 QR</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div><b>출하번호</b> {labelTarget.outboundNo}</div>
              <div><b>납품처</b> {`${labelTarget.customerCode ?? ""} / ${labelTarget.customerName ?? "-"}`}</div>
              <div><b>배송주소</b> {labelTarget.shipAddress ?? "-"}</div>
              <div><b>출고형태</b> {labelTarget.outType ?? "-"} · <b>수량</b> {labelTarget.qty.toLocaleString()}</div>
              <div><b>품목</b> {(linesByOutbound[labelTarget.id] ?? []).map((l) => l.itemCode).join(", ") || "..."}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
