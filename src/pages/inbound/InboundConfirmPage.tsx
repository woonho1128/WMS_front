import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge, type BadgeTone } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { QrBox } from "../../components/ui/QrBox";
import { INBOUND_STEPS } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터/펼침 스타일 재사용

type InboundRow = {
  id: number;
  inboundNo: string;
  poNo: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  type: string;
  inTypeName: string | null;
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
  expectedQty: number;
  receivedQty: number;
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const InboundConfirmPage = () => {
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done">("wait");
  const [keyword, setKeyword] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);

  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [linesByInbound, setLinesByInbound] = useState<Record<number, InboundLine[]>>({});
  // 검수(실입고) 수량: inboundId → lineId → qty
  const [inspect, setInspect] = useState<Record<number, Record<number, number>>>({});

  const [labelTarget, setLabelTarget] = useState<InboundRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<InboundRow | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<InboundRow[]>("/inbounds")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const fetchLines = (id: number) => {
    if (linesByInbound[id]) return;
    apiGet<InboundLine[]>(`/inbounds/${id}/lines`)
      .then((lines) => {
        setLinesByInbound((prev) => ({ ...prev, [id]: lines }));
        // 검수 기본값 = 예정수량
        setInspect((prev) => ({
          ...prev,
          [id]: prev[id] ?? Object.fromEntries(lines.map((ln) => [ln.id, ln.expectedQty]))
        }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "품목 정보 불러오기 실패"));
  };

  const invalidate = (id: number) => {
    setLinesByInbound((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setInspect((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  };

  const today = fmtDate(new Date());
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const status = tab === "wait" ? "located" : "confirmed";
    return rows.filter((r) => {
      if (r.status !== status) return false;
      if (todayOnly && r.expectedAt !== today) return false;
      if (kw) {
        const hay = [r.inboundNo, r.poNo, r.supplierCode, r.supplierName, r.warehouseName]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((x) => x.includes(kw))) return false;
      }
      return true;
    });
  }, [rows, tab, keyword, todayOnly, today]);

  const summary = useMemo(() => {
    const located = rows.filter((r) => r.status === "located");
    return {
      wait: located.length,
      waitToday: located.filter((r) => r.expectedAt === today).length,
      done: rows.filter((r) => r.status === "confirmed").length
    };
  }, [rows, today]);

  // 목록 디폴트 펼침 + 라인 로드
  useEffect(() => {
    const ids = filtered.map((r) => r.id);
    setExpandedIds(ids);
    ids.forEach(fetchLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map((r) => r.id).join(",")]);

  const toggleExpand = (id: number) => {
    const willExpand = !expandedIds.includes(id);
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (willExpand) fetchLines(id);
  };

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: number) => {
    if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
    toggleExpand(id);
  };

  const setQty = (inboundId: number, lineId: number, qty: number) =>
    setInspect((prev) => ({
      ...prev,
      [inboundId]: { ...(prev[inboundId] ?? {}), [lineId]: Math.max(0, qty) }
    }));

  const mismatchOf = (row: InboundRow) => {
    const lines = linesByInbound[row.id] ?? [];
    const q = inspect[row.id] ?? {};
    return lines.filter((ln) => (q[ln.id] ?? ln.expectedQty) !== ln.expectedQty);
  };

  const doConfirm = async () => {
    if (!confirmTarget) return;
    const lines = linesByInbound[confirmTarget.id] ?? [];
    const q = inspect[confirmTarget.id] ?? {};
    setBusy(true);
    try {
      await apiPost(`/inbounds/${confirmTarget.id}/confirm`, {
        lines: lines.map((ln) => ({ lineId: ln.id, receivedQty: q[ln.id] ?? ln.expectedQty }))
      });
      setNotice(
        `${confirmTarget.inboundNo} 입고확정 완료 — 검수 수량이 격납대기 재고로 생성되었습니다. 재고관리 > 격납 대기에서 격납을 진행하세요.`
      );
      invalidate(confirmTarget.id);
      setConfirmTarget(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "입고확정 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="입고 확정 단계"
        steps={INBOUND_STEPS}
        current={3}
        note="검수(예정 vs 실입고) → QR 입고라벨 → 입고확정 시 격납대기 재고 생성"
      />

      <section className="outbound-summary-grid" aria-label="입고확정 요약">
        <article className="app-surface outbound-summary-card"><span>확정 대기</span><strong>{summary.wait}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>당일 입고예정</span><strong>{summary.waitToday}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>확정 완료</span><strong>{summary.done}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="입고 확정 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="입고번호 / PO / 공급처 / 창고"
            />
          </label>
          <label>
            <span>구분</span>
            <select value={tab} onChange={(e) => setTab(e.target.value as "wait" | "done")}>
              <option value="wait">확정 대기 (로케이션 지정 완료)</option>
              <option value="done">확정 완료</option>
            </select>
          </label>
          <label>
            <span>당일만</span>
            <select value={todayOnly ? "1" : "0"} onChange={(e) => setTodayOnly(e.target.value === "1")}>
              <option value="0">전체 기간</option>
              <option value="1">당일 입고예정만</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`${tab === "wait" ? "확정 대기" : "확정 완료"} 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ?? "행을 펼쳐 검수 수량(실입고)을 입력한 뒤 입고확정하세요. 확정 시 재고는 격납대기 상태로 생성됩니다."}
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
                <th>입고번호</th>
                <th>입고형태</th>
                <th>공급처</th>
                <th>창고</th>
                <th>예정일</th>
                <th className="num">예정수량</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>
                  {tab === "wait" ? "확정 대기 건이 없습니다. 입고 예정 화면에서 등록·로케이션 지정을 먼저 진행하세요." : "확정 완료 건이 없습니다."}
                </td></tr>
              ) : (
                filtered.map((row) => {
                  const expanded = expandedIds.includes(row.id);
                  const lines = linesByInbound[row.id];
                  const mismatch = mismatchOf(row);
                  const tone: BadgeTone = row.status === "confirmed" ? "success" : "warning";
                  return (
                    <Fragment key={row.id}>
                      <tr className={`outbound-master-row${expanded ? " is-expanded" : ""}`} onClick={(e) => onRowClick(e, row.id)}>
                        <td>
                          <span className="outbound-expand-caret" aria-hidden>{expanded ? "▾" : "▸"}</span>
                          {row.inboundNo}
                        </td>
                        <td>{row.inTypeName ?? "-"}</td>
                        <td>{`${row.supplierCode ?? ""}${row.supplierCode ? " / " : ""}${row.supplierName ?? "-"}`}</td>
                        <td>{row.warehouseName ?? "-"}</td>
                        <td>{row.expectedAt ?? "-"}</td>
                        <td className="num">{row.qty.toLocaleString()}</td>
                        <td><StatusBadge tone={tone}>{row.status === "confirmed" ? "입고확정" : "확정대기"}</StatusBadge></td>
                        <td>
                          <div className="outbound-row-actions">
                            <button type="button" className="btn-secondary" onClick={() => { fetchLines(row.id); setLabelTarget(row); }}>
                              QR라벨
                            </button>
                            {row.status === "located" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled
                                  title="수량 불일치 수정요청 — ERP 연동 후 제공"
                                >
                                  수정요청
                                </button>
                                <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmTarget(row)}>
                                  입고확정
                                </button>
                              </>
                            ) : (
                              <span className="cell-mut">격납대기 생성됨</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="outbound-detail-row">
                          <td colSpan={8}>
                            <div className="outbound-detail">
                              <div className="outbound-detail-head">
                                <strong>{row.inboundNo} · 검수 {lines ? `(${lines.length}개 라인)` : ""}</strong>
                                <span>
                                  {row.poNo ? `PO ${row.poNo} · ` : ""}
                                  {row.warehouseName ?? "-"} · 예정 합계 {row.qty.toLocaleString()}
                                  {mismatch.length > 0 ? ` · ⚠ 수량 불일치 ${mismatch.length}건` : ""}
                                </span>
                              </div>
                              {!lines ? (
                                <p className="outbound-detail-empty">품목 정보를 불러오는 중...</p>
                              ) : (
                                <table className="outbound-detail-table">
                                  <thead>
                                    <tr>
                                      <th>SKU</th>
                                      <th>품목명</th>
                                      <th>로케이션</th>
                                      <th className="num">예정수량</th>
                                      <th className="num">실입고(검수)</th>
                                      <th className="num">차이</th>
                                      <th>단위</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((ln) => {
                                      const q = inspect[row.id]?.[ln.id] ?? ln.expectedQty;
                                      const diff = q - ln.expectedQty;
                                      const editable = row.status === "located";
                                      return (
                                        <tr key={ln.id}>
                                          <td>
                                            {ln.itemCode}
                                            {ln.consign && <span className="outbound-consign-tag">외주</span>}
                                          </td>
                                          <td>{ln.itemName}</td>
                                          <td>{ln.locationCode ?? "-"}</td>
                                          <td className="num">{ln.expectedQty.toLocaleString()}</td>
                                          <td className="num">
                                            {editable ? (
                                              <input
                                                type="number"
                                                min={0}
                                                value={q}
                                                style={{ width: 90, textAlign: "right" }}
                                                onChange={(e) => setQty(row.id, ln.id, Number(e.target.value))}
                                              />
                                            ) : (
                                              ln.receivedQty.toLocaleString()
                                            )}
                                          </td>
                                          <td className={`num${diff !== 0 ? " is-short" : ""}`}>
                                            {editable ? (diff === 0 ? "0" : diff > 0 ? `+${diff}` : `${diff}`) :
                                              (ln.receivedQty - ln.expectedQty === 0 ? "0" : ln.receivedQty - ln.expectedQty)}
                                          </td>
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
      </DashboardCard>

      {/* QR 입고라벨 미리보기 */}
      <Modal
        open={labelTarget !== null}
        title="QR 입고라벨"
        desc={labelTarget ? `${labelTarget.inboundNo} · LOT-${labelTarget.inboundNo}` : ""}
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
              <QrBox value={`WMS-IN|${labelTarget.inboundNo}|LOT-${labelTarget.inboundNo}`} />
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>데모 QR</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div><b>입고번호</b> {labelTarget.inboundNo}</div>
              <div><b>LOT</b> LOT-{labelTarget.inboundNo}</div>
              {labelTarget.poNo ? <div><b>PO</b> {labelTarget.poNo}</div> : null}
              <div><b>공급처</b> {labelTarget.supplierName ?? "-"}</div>
              <div><b>창고</b> {labelTarget.warehouseName ?? "-"}</div>
              <div><b>품목</b> {(linesByInbound[labelTarget.id] ?? []).map((l) => l.itemCode).join(", ") || "..."}</div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 입고확정 */}
      <Modal
        open={confirmTarget !== null}
        title="입고확정 (격납대기 생성)"
        desc={confirmTarget ? `${confirmTarget.inboundNo} · 예정 합계 ${confirmTarget.qty.toLocaleString()}` : ""}
        icon="checkCircle"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success)"
        onClose={() => setConfirmTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doConfirm}>입고확정</button>
          </>
        }
      >
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>검수 수량(실입고)만큼 <b>격납대기 재고</b>가 생성됩니다. 격납 완료 시 가용재고로 전환됩니다. (중계서버 입고결과 전송 대상)</span>
        </div>
        {confirmTarget && mismatchOf(confirmTarget).length > 0 ? (
          <div className="ds-callout danger" style={{ marginTop: 8 }}>
            <span>
              예정 수량과 다른 라인이 {mismatchOf(confirmTarget).length}건 있습니다 — 검수 결과대로 확정되며, 차이는 수정요청(ERP) 대상입니다.
            </span>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
