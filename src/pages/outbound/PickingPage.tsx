import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { OUTBOUND_STEPS, OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터/펼침 스타일 재사용

type OutboundRow = {
  id: number;
  outboundNo: string;
  scheduledDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  outType: string | null;
  qty: number;
  status: OutboundScreenStatus;
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

export const PickingPage = () => {
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanInput, setScanInput] = useState("");

  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [linesByOutbound, setLinesByOutbound] = useState<Record<number, OutboundLine[]>>({});
  // 품목 QR 확인 입력: outboundId → lineId → 입력값
  const [qrChecks, setQrChecks] = useState<Record<number, Record<number, string>>>({});
  const [completeTarget, setCompleteTarget] = useState<OutboundRow | null>(null);

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

  const fetchLines = (id: number) => {
    if (linesByOutbound[id]) return;
    apiGet<OutboundLine[]>(`/outbounds/${id}/lines`)
      .then((lines) => setLinesByOutbound((prev) => ({ ...prev, [id]: lines })))
      .catch((e) => setNotice(e instanceof Error ? e.message : "상품 정보 불러오기 실패"));
  };

  const invalidate = (id: number) =>
    setLinesByOutbound((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });

  const targets = useMemo(
    () => rows.filter((r) => r.status === "출고대기" || r.status === "피킹중"),
    [rows]
  );

  const summary = useMemo(
    () => ({
      waiting: rows.filter((r) => r.status === "출고대기").length,
      picking: rows.filter((r) => r.status === "피킹중").length,
      picked: rows.filter((r) => r.status === "피킹완료").length
    }),
    [rows]
  );

  useEffect(() => {
    const ids = targets.map((r) => r.id);
    setExpandedIds(ids);
    ids.forEach(fetchLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.map((r) => r.id).join(",")]);

  const toggleExpand = (id: number) => {
    const willExpand = !expandedIds.includes(id);
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (willExpand) fetchLines(id);
  };

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: number) => {
    if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
    toggleExpand(id);
  };

  /** 오더 QR 스캔(출하번호 입력) → 피킹 시작 */
  const scanStart = async () => {
    const no = scanInput.trim();
    if (!no) return;
    const row = rows.find((r) => r.outboundNo.toLowerCase() === no.toLowerCase());
    if (!row) {
      setNotice(`'${no}' 출하번호를 찾을 수 없습니다.`);
      return;
    }
    if (row.status !== "출고대기") {
      setNotice(`${row.outboundNo}는 ${row.status} 상태입니다 — 출고대기 건만 피킹 시작할 수 있습니다.`);
      return;
    }
    await pickStart(row.id);
    setScanInput("");
  };

  const pickStart = async (id: number) => {
    setBusy(true);
    try {
      await apiPost(`/outbounds/${id}/pick-start`, {});
      setNotice("피킹 시작 — 라인별 로케이션 안내에 따라 품목 QR을 확인하세요.");
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "피킹 시작 실패");
    } finally {
      setBusy(false);
    }
  };

  const setQr = (outboundId: number, lineId: number, v: string) =>
    setQrChecks((prev) => ({ ...prev, [outboundId]: { ...(prev[outboundId] ?? {}), [lineId]: v } }));

  const lineVerified = (outboundId: number, ln: OutboundLine) =>
    (qrChecks[outboundId]?.[ln.id] ?? "").trim().toLowerCase() === ln.itemCode.toLowerCase();

  const allVerified = (row: OutboundRow) => {
    const lines = linesByOutbound[row.id] ?? [];
    return lines.length > 0 && lines.every((ln) => lineVerified(row.id, ln));
  };

  const doComplete = async () => {
    if (!completeTarget) return;
    setBusy(true);
    try {
      await apiPost(`/outbounds/${completeTarget.id}/pick-complete`, {});
      setNotice(`${completeTarget.outboundNo} 피킹 완료 — 피킹재고(FIFO) 차감. 출고 확정 화면에서 송장 입력 후 확정하세요.`);
      invalidate(completeTarget.id);
      setCompleteTarget(null);
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "피킹 완료 실패");
      setCompleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="피킹 작업 단계"
        steps={OUTBOUND_STEPS}
        current={1}
        note="오더 QR 스캔 → 로케이션 안내 → 품목 QR 확인(수량 검증) → 피킹 완료 시 피킹재고 차감"
      />

      <section className="outbound-summary-grid" aria-label="피킹 요약">
        <article className="app-surface outbound-summary-card"><span>출고대기(피킹 전)</span><strong>{summary.waiting}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹중</span><strong>{summary.picking}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹완료</span><strong>{summary.picked}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="오더 QR 스캔 (피킹 시작)">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>출하번호 스캔/입력</span>
            <input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") scanStart(); }}
              placeholder="오더 QR 스캔 또는 출하번호 입력 후 Enter"
            />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={scanStart}>피킹 시작</button>
            <button type="button" className="btn-secondary" onClick={reload}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`피킹 대상 (${targets.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ?? "출고대기 건은 피킹 시작으로, 피킹중 건은 라인별 품목 QR 확인 후 피킹 완료하세요. (전량 피킹 원칙)"}
          </p>
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
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : targets.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>피킹 대상이 없습니다.</td></tr>
              ) : (
                targets.map((row) => {
                  const expanded = expandedIds.includes(row.id);
                  const lines = linesByOutbound[row.id];
                  const verified = allVerified(row);
                  return (
                    <Fragment key={row.id}>
                      <tr className={`outbound-master-row${expanded ? " is-expanded" : ""}`} onClick={(e) => onRowClick(e, row.id)}>
                        <td>
                          <span className="outbound-expand-caret" aria-hidden>{expanded ? "▾" : "▸"}</span>
                          {row.outboundNo}
                        </td>
                        <td>{row.scheduledDate ?? "-"}</td>
                        <td>{`${row.customerCode ?? ""} / ${row.customerName ?? ""}`}</td>
                        <td>{row.outType ?? "-"}</td>
                        <td className="num">{row.qty.toLocaleString()}</td>
                        <td><StatusBadge tone={OUTBOUND_STATUS_TONE[row.status]}>{row.status}</StatusBadge></td>
                        <td>
                          <div className="outbound-row-actions">
                            {row.status === "출고대기" ? (
                              <button type="button" className="btn-secondary" disabled={busy} onClick={() => pickStart(row.id)}>
                                피킹 시작
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy || !verified}
                                title={verified ? undefined : "모든 라인의 품목 QR을 확인하세요"}
                                onClick={() => setCompleteTarget(row)}
                              >
                                피킹 완료
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="outbound-detail-row">
                          <td colSpan={7}>
                            <div className="outbound-detail">
                              <div className="outbound-detail-head">
                                <strong>{row.outboundNo} · 피킹 라인 {lines ? `(${lines.length}건)` : ""}</strong>
                                <span>
                                  {row.status === "피킹중"
                                    ? `품목 QR 확인 ${lines ? lines.filter((ln) => lineVerified(row.id, ln)).length : 0}/${lines?.length ?? 0}`
                                    : "피킹 시작 후 QR 확인이 가능합니다"}
                                </span>
                              </div>
                              {!lines ? (
                                <p className="outbound-detail-empty">상품 정보를 불러오는 중...</p>
                              ) : (
                                <table className="outbound-detail-table">
                                  <thead>
                                    <tr>
                                      <th>피킹 로케이션</th>
                                      <th>SKU</th>
                                      <th>상품명</th>
                                      <th className="num">지시수량</th>
                                      <th className="num">가용재고</th>
                                      <th>품목 QR 확인</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((ln) => {
                                      const ok = lineVerified(row.id, ln);
                                      const short = ln.availableQty != null && ln.availableQty < ln.orderQty;
                                      return (
                                        <tr key={ln.id}>
                                          <td><b>{ln.locationCode ?? "-"}</b></td>
                                          <td>
                                            {ln.itemCode}
                                            {ln.consign && <span className="outbound-consign-tag">외주</span>}
                                          </td>
                                          <td>{ln.itemName}</td>
                                          <td className="num">{ln.orderQty.toLocaleString()} {ln.unit}</td>
                                          <td className={`num${short ? " is-short" : ""}`}>
                                            {ln.availableQty != null ? ln.availableQty.toLocaleString() : "-"}
                                          </td>
                                          <td>
                                            {row.status === "피킹중" ? (
                                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                <input
                                                  value={qrChecks[row.id]?.[ln.id] ?? ""}
                                                  onChange={(e) => setQr(row.id, ln.id, e.target.value)}
                                                  placeholder={`${ln.itemCode} 스캔/입력`}
                                                  style={{ width: 150 }}
                                                />
                                                {ok ? <StatusBadge tone="success">확인</StatusBadge> : <StatusBadge tone="gray">대기</StatusBadge>}
                                              </span>
                                            ) : (
                                              <span className="cell-mut">-</span>
                                            )}
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
      </DashboardCard>

      <Modal
        open={completeTarget !== null}
        title="피킹 완료"
        desc={completeTarget ? `${completeTarget.outboundNo} · 지시 합계 ${completeTarget.qty.toLocaleString()}` : ""}
        icon="checkCircle"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success)"
        onClose={() => setCompleteTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCompleteTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doComplete}>피킹 완료</button>
          </>
        }
      >
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>전량 피킹으로 처리되며, 각 라인의 <b>피킹재고가 FIFO(LOT 입고일자순)로 차감</b>됩니다. 가용재고 부족 시 실패 — 거부 처리 대상입니다.</span>
        </div>
      </Modal>
    </section>
  );
};
