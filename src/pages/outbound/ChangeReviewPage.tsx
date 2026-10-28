import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable/ResponsiveTable";
import { StatusBadge, type BadgeTone } from "../../components/ui/StatusBadge";
import { useUiStore } from "../../app/store/uiStore";
import { OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "./ChangeReviewPage.css";

/* ============================================================
   변경·취소 확인 — 피킹이 시작된 뒤 주문 시스템에서 온 변경·취소를 물류팀이 승인 · 거절한다
   · 승인: 집어 둔 물건을 피킹한 LOT 그대로 되돌려 놓고, 변경은 출고대기로(다시 피킹) · 취소는 '취소' 로
   · 거절: 출고는 그대로 — 사유가 주문 시스템에 전해진다
   · 확인을 기다리는 건이 있으면 출고 확정이 막힌다
   ============================================================ */

type ChangeKind = "CHANGE" | "CANCEL";
type ChangeStatus = "PENDING" | "APPLIED" | "REJECTED" | "SUPERSEDED";

type ChangeRow = {
  id: number;
  outboundId: number;
  requestNo: string;
  orderNo: string | null;
  kind: ChangeKind;
  status: ChangeStatus;
  revision: number;
  appliedRevision: number | null;
  outboundStatus: string;
  customerName: string | null;
  scheduledDate: string | null;
  source: string | null;
  messageId: string;
  /** 주문 시스템이 보낸 취소 사유 */
  reason: string | null;
  /** 물류팀 거절 사유 */
  decisionReason: string | null;
  receivedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  /** 지금 집어 둔 수량 — 승인하면 되돌려 놓는다 */
  pickedQty: number;
};

type ChangeField = { label: string; before: string | null; after: string | null };
type LineMark = "SAME" | "QTY" | "ADDED" | "REMOVED";
type ChangeLine = {
  lineNo: number;
  productCode: string | null;
  productName: string | null;
  erpItemCode: string | null;
  beforeQty: number | null;
  afterQty: number | null;
  pickedQty: number | null;
  mark: LineMark;
};
type PickLot = { itemCode: string; itemName: string; locationCode: string | null; lotNo: string; receivedDate: string | null; qty: number };
type ChangeDetail = {
  change: ChangeRow;
  fields: ChangeField[];
  lines: ChangeLine[];
  lots: PickLot[];
  canApprove: boolean;
  blockReason: string | null;
};
type Decision = { message: string; outboundStatus: string; putBackQty: number };

const KIND_LABEL: Record<ChangeKind, string> = { CHANGE: "변경", CANCEL: "취소" };
const STATUS_VIEW: Record<ChangeStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "확인 대기", tone: "warning" },
  APPLIED: { label: "승인", tone: "success" },
  REJECTED: { label: "거절", tone: "danger" },
  SUPERSEDED: { label: "새 요청이 대신함", tone: "gray" }
};
const MARK_VIEW: Record<LineMark, { label: string; tone: BadgeTone }> = {
  SAME: { label: "그대로", tone: "gray" },
  QTY: { label: "수량 변경", tone: "warning" },
  ADDED: { label: "추가", tone: "info" },
  REMOVED: { label: "빠짐", tone: "danger" }
};
const REJECT_REASONS = ["이미 포장 · 상차 완료", "출고 일정상 반영 불가", "재고 확인 필요 — 전화 협의", "기타"];
/** 승인 · 거절은 관리자 · 물류 담당자만 (서버도 막는다) */
const MANAGER_ROLES = new Set(["admin", "logistics"]);

const num = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ko-KR"));
const outboundTone = (status: string) => OUTBOUND_STATUS_TONE[status as OutboundScreenStatus] ?? "gray";

export const ChangeReviewPage = () => {
  const navigate = useNavigate();
  const role = useUiStore((state) => state.currentRole);
  const canDecide = MANAGER_ROLES.has(role);

  const [tab, setTab] = useState<"wait" | "done">("wait");
  const [pending, setPending] = useState<ChangeRow[]>([]);
  const [done, setDone] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ChangeDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mode, setMode] = useState<"" | "approve" | "reject">("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    return Promise.all([
      apiGet<ChangeRow[]>("/outbound-requests/changes"),
      apiGet<ChangeRow[]>("/outbound-requests/changes?state=done")
    ])
      .then(([wait, finished]) => {
        setPending(wait);
        setDone(finished);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const listed = tab === "wait" ? pending : done;

  useEffect(() => {
    if (!listed.length) {
      setSelId(null);
      return;
    }
    setSelId((prev) => (prev && listed.some((r) => r.id === prev) ? prev : listed[0].id));
  }, [listed]);

  useEffect(() => {
    setMode("");
    setRejectNote("");
    setDetail(null);
    setDetailError(null);
    if (selId == null) return;
    let alive = true;
    apiGet<ChangeDetail>(`/outbound-requests/changes/${selId}`)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setDetailError(e instanceof Error ? e.message : "상세 조회 실패"));
    return () => {
      alive = false;
    };
  }, [selId]);

  const head = useMemo(
    () => ({
      wait: pending.length,
      changes: pending.filter((r) => r.kind === "CHANGE").length,
      cancels: pending.filter((r) => r.kind === "CANCEL").length,
      putBack: pending.reduce((sum, r) => sum + (r.pickedQty ?? 0), 0),
      done: done.length
    }),
    [pending, done]
  );

  const selected = detail?.change.id === selId ? detail : null;
  const change = selected?.change ?? null;
  const isPending = change?.status === "PENDING";

  const decide = async (action: "approve" | "reject") => {
    if (!change) return;
    const reason = rejectNote.trim() ? `${rejectReason} · ${rejectNote.trim()}` : rejectReason;
    setBusy(true);
    try {
      const result = await apiPost<Decision>(
        `/outbound-requests/changes/${change.id}/${action}`,
        action === "reject" ? { reason } : {}
      );
      setNotice({ tone: "success", text: result?.message ?? "처리했습니다." });
      setMode("");
      setRejectNote("");
      await load();
    } catch (e) {
      setNotice({ tone: "danger", text: e instanceof Error ? e.message : "처리 실패" });
    } finally {
      setBusy(false);
    }
  };

  const linesTitle = change?.kind === "CANCEL" ? "취소되는 품목" : "품목 줄 비교";

  return (
    <section className="chg-page">
      {/* ---------- 헤더 요약 ---------- */}
      <header className="card chg-head">
        <div className="chg-head-top">
          <span className="nx-sect-title">주문 변경 · 취소 확인</span>
          <span className="chg-flow">피킹이 시작된 뒤 온 요청 → 승인(집은 재고 되돌림 · 다시 피킹) / 거절(그대로 출고)</span>
        </div>
        <div className="chg-kpis">
          <div className="chg-kpi">
            <span>확인 대기</span>
            <b className={head.wait > 0 ? "is-warn" : undefined}>
              {loading ? "—" : head.wait}
              <small>건</small>
            </b>
          </div>
          <div className="chg-kpi">
            <span>변경 · 취소</span>
            <b className="is-qty">
              {head.changes} · {head.cancels}
            </b>
          </div>
          <div className="chg-kpi">
            <span>승인하면 되돌릴 수량</span>
            <b>
              {num(head.putBack)}
              <small>개</small>
            </b>
          </div>
          <div className="chg-kpi">
            <span>처리 완료</span>
            <b className="is-ok">
              {head.done}
              <small>건</small>
            </b>
          </div>
        </div>
      </header>

      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className={`ds-callout ${notice.tone}`}>
          <Icon name={notice.tone === "success" ? "check" : "alert"} size={18} />
          <span>{notice.text}</span>
        </div>
      ) : null}

      <div className="chg-main">
        {/* ---------- 요청 목록 ---------- */}
        <section className="card chg-list">
          <div className="chg-card-head">
            <span className="nx-sect-title">받은 요청</span>
            <div className="chg-tabs">
              {(["wait", "done"] as const).map((k) => (
                <button key={k} type="button" className={`chg-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
                  {k === "wait" ? "확인 대기" : "처리 완료"}
                  <span>{k === "wait" ? head.wait : head.done}</span>
                </button>
              ))}
              <button type="button" className="chg-tab" onClick={() => load()} title="새로고침">
                <Icon name="refresh" size={14} />
              </button>
            </div>
          </div>

          <ResponsiveTable className="chg-table-wrap" cardsBelow="fit">
            <table className="data-table chg-table">
              <thead>
                <tr>
                  <th className="rt-title">출하번호</th>
                  <th>요청</th>
                  <th>납품처</th>
                  <th>출고 상태</th>
                  <th className="num">집은 수량</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r) => {
                  const st = STATUS_VIEW[r.status] ?? { label: r.status, tone: "gray" as const };
                  return (
                    <tr
                      key={r.id}
                      className={`chg-row${selId === r.id ? " is-sel" : ""}`}
                      onClick={() => setSelId(r.id)}
                      title={`${r.requestNo} · ${r.orderNo ?? "-"} · 개정 ${r.revision}`}
                    >
                      <td>
                        <div className="chg-no">{r.requestNo}</div>
                        <div className="chg-sub chg-mono">{r.status === "PENDING" ? r.receivedAt : (r.decidedAt ?? r.receivedAt)}</div>
                      </td>
                      <td>
                        <span className={`ds-badge ${r.kind === "CANCEL" ? "danger" : "info"}`}>{KIND_LABEL[r.kind]}</span>
                        <div className="chg-sub">개정 {r.revision}</div>
                      </td>
                      <td>
                        <div className="chg-cust">{r.customerName ?? "-"}</div>
                        <div className="chg-sub">{r.scheduledDate ?? "-"}</div>
                      </td>
                      <td>
                        <StatusBadge tone={outboundTone(r.outboundStatus)}>{r.outboundStatus}</StatusBadge>
                      </td>
                      <td className="num">{num(r.pickedQty)}</td>
                      <td>
                        <StatusBadge tone={st.tone} variant="dot">
                          {st.label}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
                {!listed.length && !loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="nx-empty">
                        {tab === "wait" ? "확인을 기다리는 변경 · 취소가 없습니다." : "처리한 요청이 없습니다."}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
        </section>

        {/* ---------- 상세 / 처리 ---------- */}
        <aside className="card chg-detail">
          {selId == null ? (
            <div className="nx-empty">왼쪽에서 요청을 고르세요.</div>
          ) : detailError ? (
            <div className="ds-callout danger chg-note">
              <Icon name="alert" size={16} />
              <span>{detailError}</span>
            </div>
          ) : !selected || !change ? (
            <div className="nx-empty">불러오는 중...</div>
          ) : (
            <>
              <div className="chg-detail-head">
                <div>
                  <div className="chg-detail-no">
                    {change.requestNo}
                    <span className={`ds-badge ${change.kind === "CANCEL" ? "danger" : "info"}`}>{KIND_LABEL[change.kind]} 요청</span>
                    <StatusBadge tone={STATUS_VIEW[change.status]?.tone ?? "gray"} variant="dot">
                      {STATUS_VIEW[change.status]?.label ?? change.status}
                    </StatusBadge>
                  </div>
                  <div className="chg-sub">
                    주문 {change.orderNo ?? "-"} · {change.customerName ?? "-"} · 보낸 곳 {change.source ?? "-"}
                  </div>
                </div>
                <StatusBadge tone={outboundTone(change.outboundStatus)}>{change.outboundStatus}</StatusBadge>
              </div>

              <dl className="chg-meta">
                <div>
                  <dt>받은 시각</dt>
                  <dd className="chg-mono">{change.receivedAt ?? "-"}</dd>
                </div>
                <div>
                  <dt>개정 (요청 / 지금 반영)</dt>
                  <dd className="chg-mono">
                    {change.revision} / {change.appliedRevision ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt>출고 예정일</dt>
                  <dd className="chg-mono">{change.scheduledDate ?? "-"}</dd>
                </div>
                <div>
                  <dt>집어 둔 수량</dt>
                  <dd className="chg-mono">{num(change.pickedQty)}개</dd>
                </div>
                {!isPending ? (
                  <>
                    <div>
                      <dt>처리</dt>
                      <dd className="chg-mono">
                        {change.decidedAt ?? "-"} · {change.decidedBy ?? "-"}
                      </dd>
                    </div>
                    {change.decisionReason ? (
                      <div>
                        <dt>거절 사유</dt>
                        <dd title={change.decisionReason}>{change.decisionReason}</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </dl>

              {change.kind === "CANCEL" ? (
                <div className="ds-callout danger chg-note">
                  <Icon name="ban" size={16} />
                  <span>주문 취소 요청 — 사유: {change.reason ?? "(없음)"}</span>
                </div>
              ) : null}

              {/* 바뀌는 머리 칸 */}
              {change.kind === "CHANGE" ? (
                <div className="chg-block">
                  <span className="nx-eyebrow">바뀌는 칸</span>
                  {selected.fields.length ? (
                    <table className="chg-diff">
                      <tbody>
                        {selected.fields.map((f) => (
                          <tr key={f.label}>
                            <th>{f.label}</th>
                            <td className="is-before">{f.before ?? "(없음)"}</td>
                            <td className="chg-arrow" aria-hidden>
                              →
                            </td>
                            <td className="is-after">{f.after ?? "(없음)"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="chg-sub">머리 칸(일정 · 받는 곳 · 메모)은 그대로입니다.</p>
                  )}
                </div>
              ) : null}

              {/* 줄 비교 */}
              <div className="chg-block">
                <span className="nx-eyebrow">{linesTitle}</span>
                <table className="chg-lines">
                  <thead>
                    <tr>
                      <th>줄</th>
                      <th>상품</th>
                      <th className="num">지금</th>
                      <th className="num">요청</th>
                      <th className="num">집음</th>
                      <th>구분</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((ln, idx) => {
                      const mark = change.kind === "CANCEL" ? { label: "취소", tone: "danger" as const } : MARK_VIEW[ln.mark];
                      return (
                        <tr key={`${ln.lineNo}-${ln.mark}-${idx}`} className={ln.mark === "SAME" ? "is-same" : undefined}>
                          <td className="chg-mono">{ln.lineNo}</td>
                          <td>
                            <div className="chg-cust">{ln.productName ?? "-"}</div>
                            <div className="chg-sub chg-mono">{ln.productCode ?? ln.erpItemCode ?? ""}</div>
                          </td>
                          <td className="num">{num(ln.beforeQty)}</td>
                          <td className="num">{change.kind === "CANCEL" ? 0 : num(ln.afterQty)}</td>
                          <td className="num">{num(ln.pickedQty)}</td>
                          <td>
                            <StatusBadge tone={mark.tone}>{mark.label}</StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 승인하면 되돌려 놓을 재고 */}
              {isPending ? (
                <div className="chg-block">
                  <span className="nx-eyebrow">승인하면 되돌려 놓을 재고</span>
                  {selected.lots.length ? (
                    <table className="chg-lines">
                      <thead>
                        <tr>
                          <th>로케이션</th>
                          <th>품목</th>
                          <th>LOT · 입고일</th>
                          <th className="num">수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.lots.map((lot, idx) => (
                          <tr key={`${lot.lotNo}-${idx}`}>
                            <td className="chg-mono">{lot.locationCode ?? "-"}</td>
                            <td>
                              <div className="chg-cust">{lot.itemName}</div>
                              <div className="chg-sub chg-mono">{lot.itemCode}</div>
                            </td>
                            <td className="chg-mono">
                              {lot.lotNo}
                              <div className="chg-sub">{lot.receivedDate ?? "-"}</div>
                            </td>
                            <td className="num">{num(lot.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="chg-sub">집어 둔 물건이 없습니다 (피킹 완료 전) — 재고는 그대로입니다.</p>
                  )}
                </div>
              ) : null}

              {isPending && !selected.canApprove && selected.blockReason ? (
                <div className="ds-callout warning chg-note">
                  <Icon name="alert" size={16} />
                  <span>{selected.blockReason}</span>
                </div>
              ) : null}
              {isPending && !canDecide ? (
                <div className="ds-callout info chg-note">
                  <Icon name="lock" size={16} />
                  <span>승인 · 거절은 관리자 · 물류 담당자만 할 수 있습니다.</span>
                </div>
              ) : null}

              {/* 처리 영역 */}
              {!isPending ? (
                <div className="chg-actions">
                  <button type="button" className="chg-btn is-block" onClick={() => navigate("/outbound/outbound-order")}>
                    출고 요청서로
                  </button>
                </div>
              ) : mode === "" ? (
                <div className="chg-actions">
                  <button type="button" className="chg-btn is-reject" disabled={!canDecide} onClick={() => setMode("reject")}>
                    거절
                  </button>
                  <button
                    type="button"
                    className="btn-primary chg-cta"
                    disabled={!canDecide || !selected.canApprove}
                    onClick={() => setMode("approve")}
                  >
                    승인
                    <Icon name="arrowR" size={15} />
                  </button>
                </div>
              ) : mode === "approve" ? (
                <div className="chg-confirm">
                  <div className="ds-callout success">
                    <Icon name="checkCircle" size={16} />
                    <span>
                      {change.kind === "CANCEL"
                        ? `${change.requestNo} — 출고를 취소합니다.`
                        : `${change.requestNo} — 요청대로 바꾸고 출고대기로 돌립니다. 송장 · 배차는 지워지고, 출고요청서를 다시 뽑아 피킹합니다.`}
                      {selected.lots.length
                        ? ` 집어 둔 ${num(selected.lots.reduce((s, l) => s + l.qty, 0))}개는 위 로케이션 · LOT 로 되돌려 놓습니다 — 실물도 제자리에 놓으세요.`
                        : ""}
                    </span>
                  </div>
                  <div className="chg-actions">
                    <button type="button" className="chg-btn" onClick={() => setMode("")}>
                      돌아가기
                    </button>
                    <button type="button" className="btn-primary chg-cta" disabled={busy} onClick={() => decide("approve")}>
                      승인 확정
                    </button>
                  </div>
                </div>
              ) : (
                <div className="chg-confirm">
                  <span className="nx-eyebrow">거절 사유 (주문 시스템에 그대로 전해집니다)</span>
                  <div className="chg-reasons">
                    {REJECT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        className={`chg-reason${rejectReason === reason ? " is-on" : ""}`}
                        onClick={() => setRejectReason(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="chg-note-input"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="덧붙일 말 (선택)"
                    maxLength={150}
                    rows={2}
                  />
                  <div className="ds-callout danger">
                    <Icon name="alert" size={16} />
                    <span>
                      거절하면 출고는 지금대로 진행하고, 주문 시스템은 이 {change.kind === "CANCEL" ? "취소를" : "변경을"} 되돌립니다.
                    </span>
                  </div>
                  <div className="chg-actions">
                    <button type="button" className="chg-btn" onClick={() => setMode("")}>
                      돌아가기
                    </button>
                    <button type="button" className="chg-btn is-reject is-solid" disabled={busy} onClick={() => decide("reject")}>
                      거절 확정
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
};
