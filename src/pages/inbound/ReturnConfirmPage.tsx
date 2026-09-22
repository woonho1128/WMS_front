import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable/ResponsiveTable";
import { apiGet, apiPost } from "../../services/http";
import "./ReturnConfirmPage.css";

/* ============================================================
   반품 확정 — OMS 반품오더 승인(격납대기 생성) / 반려(영업담당자 알림)
   기준: DOCS/front 운영화면 재설계 (rt 화면)
   · 반품 예정(반품오더 조회) 메뉴는 OMS2 소관 — WMS 에서는 이 화면의 처리 대기 목록이 수신 반품오더다
   ============================================================ */

type ReturnRow = {
  id: number;
  returnNo: string;
  omsOrderNo: string | null;
  customerCode: string | null;
  customerName: string | null;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  reason: string | null;
  manager: string | null;
  warehouseName: string;
  locationCode: string | null;
  status: string; // received/approved/rejected
  rejectReason: string | null;
  receivedAt: string | null;
  processedAt: string | null;
};

const RETURN_STATUS: Record<string, { label: string; tone: "gray" | "success" | "danger" }> = {
  received: { label: "수신", tone: "gray" },
  approved: { label: "승인", tone: "success" },
  rejected: { label: "반려", tone: "danger" }
};

const REJECT_REASONS = ["반품 기한 초과", "상품 상태 불량(고객 과실)", "반품 대상 아님", "기타"];

const num = (n: number) => n.toLocaleString("ko-KR");

/** 귀책 구분 — 단순변심은 고객, 그 외(초기불량·오배송 등)는 당사 */
const faultOf = (reason: string | null) =>
  reason === "단순변심" ? { label: "고객 귀책", tone: "warning" } : { label: "당사 귀책", tone: "danger" };

export const ReturnConfirmPage = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done">("wait");
  const [selId, setSelId] = useState<number | null>(null);
  /** 상세 패널 하단 인라인 처리 모드 */
  const [mode, setMode] = useState<"" | "approve" | "reject">("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<ReturnRow[]>("/returns")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const listed = useMemo(
    () => rows.filter((r) => (tab === "wait" ? r.status === "received" : r.status !== "received")),
    [rows, tab]
  );

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
  }, [selId]);

  const selected = rows.find((r) => r.id === selId) ?? null;
  const done = selected ? selected.status !== "received" : false;

  const head = useMemo(() => {
    const wait = rows.filter((r) => r.status === "received");
    const byUnit = new Map<string, number>();
    wait.forEach((r) => byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) + r.qty));
    return {
      wait: wait.length,
      qty: Array.from(byUnit.entries()).map(([u, q]) => `${num(q)} ${u}`).join(" · ") || "0",
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length
    };
  }, [rows]);

  const doApprove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiPost(`/returns/${selected.id}/approve`, {});
      setNotice(`${selected.returnNo} 승인 — 반품재고(LOT-${selected.returnNo})가 격납대기로 생성되었습니다.`);
      setMode("");
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "승인 실패");
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!selected) return;
    const reason = rejectNote.trim() ? `${rejectReason} · ${rejectNote.trim()}` : rejectReason;
    setBusy(true);
    try {
      await apiPost(`/returns/${selected.id}/reject`, { reason });
      setNotice(`${selected.returnNo} 반려 — 영업담당자(${selected.manager ?? "-"})에게 작업 알림이 전송됩니다.`);
      setMode("");
      setRejectNote("");
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "반려 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rtn-page">
      {/* ---------- 헤더 요약 ---------- */}
      <header className="card rtn-head">
        <div className="rtn-head-top">
          <span className="nx-sect-title">반품 승인 · 반려</span>
          <span className="rtn-flow">OMS 반품오더 자동수신 → 승인(격납대기 생성) / 반려(영업담당자 알림)</span>
        </div>
        <div className="rtn-kpis">
          <div className="rtn-kpi">
            <span>처리 대기</span>
            <b>
              {loading ? "—" : head.wait}
              <small>건</small>
            </b>
          </div>
          <div className="rtn-kpi">
            <span>반품 수량</span>
            <b className="is-qty">{head.qty}</b>
          </div>
          <div className="rtn-kpi">
            <span>승인 · 격납대기</span>
            <b className="is-ok">
              {head.approved}
              <small>건</small>
            </b>
          </div>
          <div className="rtn-kpi">
            <span>반려 · 알림 발송</span>
            <b className="is-bad">
              {head.rejected}
              <small>건</small>
            </b>
          </div>
        </div>
      </header>

      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
        </div>
      ) : null}
      {notice ? (
        <div className="ds-callout success">
          <Icon name="check" size={18} />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="rtn-main">
        {/* ---------- 반품 오더 목록 ---------- */}
        <section className="card rtn-list">
          <div className="rtn-card-head">
            <span className="nx-sect-title">반품 오더</span>
            <div className="rtn-tabs">
              {(["wait", "done"] as const).map((k) => (
                <button key={k} type="button" className={`rtn-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
                  {k === "wait" ? "처리 대기" : "처리 완료"}
                  <span>{k === "wait" ? head.wait : head.approved + head.rejected}</span>
                </button>
              ))}
            </div>
          </div>

          <ResponsiveTable className="rtn-table-wrap" cardsBelow="fit">
            <table className="data-table rtn-table">
              <thead>
                <tr>
                  <th className="rt-title">반품번호</th>
                  <th>거래처 · 품목</th>
                  <th className="num">수량</th>
                  <th>반품사유</th>
                  <th>귀책</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r) => {
                  const st = RETURN_STATUS[r.status] ?? { label: r.status, tone: "gray" as const };
                  const fault = faultOf(r.reason);
                  return (
                    <tr
                      key={r.id}
                      className={`rtn-row${selId === r.id ? " is-sel" : ""}`}
                      onClick={() => setSelId(r.id)}
                      title={`${r.returnNo} · ${r.omsOrderNo} · ${r.customerCode} / ${r.customerName} · ${r.warehouseName} / ${r.locationCode}`}
                    >
                      <td>
                        <div className="rtn-no">{r.returnNo}</div>
                        <div className="rtn-sub rtn-mono">
                          {r.status === "received" ? r.receivedAt : (r.processedAt ?? "처리됨")}
                        </div>
                      </td>
                      <td>
                        <div className="rtn-cust">{r.customerName}</div>
                        <div className="rtn-sub">
                          {r.itemCode} · {r.itemName}
                        </div>
                      </td>
                      <td className="num">
                        {/* 수량과 단위를 한 덩어리로 — 폰 카드에서 단위가 다음 줄로 떨어지지 않게 */}
                        <span>
                          {num(r.qty)} <small>{r.unit}</small>
                        </span>
                      </td>
                      <td>{r.reason ?? "-"}</td>
                      <td>
                        <span className={`ds-badge ${fault.tone}`}>{fault.label}</span>
                      </td>
                      <td>
                        <span className={`ds-badge ${st.tone}`}>
                          <i className="bdot" />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!listed.length && !loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="nx-empty">
                        {tab === "wait" ? "처리 대기 중인 반품 오더가 없습니다." : "처리 완료 건이 없습니다."}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
        </section>

        {/* ---------- 상세 / 처리 ---------- */}
        <aside className="card rtn-detail">
          {!selected ? (
            <div className="nx-empty">좌측에서 반품 오더를 선택하세요.</div>
          ) : (
            <>
              <div className="rtn-detail-head">
                <div>
                  <div className="rtn-detail-no">
                    {selected.returnNo}
                    <span className={`ds-badge ${RETURN_STATUS[selected.status]?.tone ?? "gray"}`}>
                      <i className="bdot" />
                      {RETURN_STATUS[selected.status]?.label ?? selected.status}
                    </span>
                  </div>
                  <div className="rtn-sub">
                    {selected.omsOrderNo} · {selected.customerCode} / {selected.customerName}
                  </div>
                </div>
                <span className={`ds-badge ${faultOf(selected.reason).tone}`}>{faultOf(selected.reason).label}</span>
              </div>

              <div className="rtn-item">
                <div className="rtn-item-sku">{selected.itemCode}</div>
                <div className="rtn-item-name">{selected.itemName}</div>
                <div className="rtn-item-qty">
                  {num(selected.qty)} <small>{selected.unit}</small>
                </div>
              </div>

              <dl className="rtn-meta">
                <div>
                  <dt>반품사유</dt>
                  <dd>{selected.reason ?? "-"}</dd>
                </div>
                <div>
                  <dt>영업담당자</dt>
                  <dd>{selected.manager ?? "-"}</dd>
                </div>
                <div>
                  <dt>입고 창고 · 로케이션</dt>
                  <dd>
                    {selected.warehouseName} · {selected.locationCode ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt>반품 LOT</dt>
                  <dd className="rtn-mono">LOT-{selected.returnNo}</dd>
                </div>
                <div>
                  <dt>수신 시각</dt>
                  <dd className="rtn-mono">{selected.receivedAt ?? "-"}</dd>
                </div>
                <div>
                  <dt>처리 시각</dt>
                  <dd className="rtn-mono">{selected.processedAt ?? "—"}</dd>
                </div>
              </dl>

              {selected.status === "rejected" && selected.rejectReason ? (
                <div className="ds-callout danger rtn-note">
                  <Icon name="alert" size={16} />
                  <span>반려 사유 — {selected.rejectReason}</span>
                </div>
              ) : (
                <div className={`ds-callout ${done ? "success" : "info"} rtn-note`}>
                  <Icon name="check" size={16} />
                  <span>
                    {done
                      ? `승인 완료 — 반품재고(LOT-${selected.returnNo})가 격납대기로 생성되었습니다. 재고관리 → 격납 대기에서 격납하세요.`
                      : "승인 시 반품재고가 격납대기 상태로 생성됩니다 (LOT = LOT-반품번호). 격납 완료 시 가용재고로 전환됩니다."}
                  </span>
                </div>
              )}

              {/* 처리 영역 */}
              {done ? (
                <div className="rtn-actions">
                  {selected.status === "approved" ? (
                    <button type="button" className="btn-primary rtn-cta" onClick={() => navigate("/stock/putaway")}>
                      격납 대기로 이동
                      <Icon name="arrowR" size={15} />
                    </button>
                  ) : (
                    <button type="button" className="rtn-btn is-block" onClick={() => navigate("/dashboard/work-alerts")}>
                      작업 알림 보기
                    </button>
                  )}
                </div>
              ) : mode === "" ? (
                <div className="rtn-actions">
                  <button type="button" className="rtn-btn is-reject" onClick={() => setMode("reject")}>
                    반려
                  </button>
                  <button type="button" className="btn-primary rtn-cta" onClick={() => setMode("approve")}>
                    승인 · 격납대기 생성
                    <Icon name="arrowR" size={15} />
                  </button>
                </div>
              ) : mode === "approve" ? (
                <div className="rtn-confirm">
                  <div className="ds-callout success">
                    <Icon name="checkCircle" size={16} />
                    <span>
                      {selected.returnNo} 승인 — 반품재고 {num(selected.qty)} {selected.unit} 가 격납대기로 생성됩니다.
                    </span>
                  </div>
                  <div className="rtn-actions">
                    <button type="button" className="rtn-btn" onClick={() => setMode("")}>
                      취소
                    </button>
                    <button type="button" className="btn-primary rtn-cta" disabled={busy} onClick={doApprove}>
                      승인 확정
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rtn-confirm">
                  <span className="nx-eyebrow">반려 사유</span>
                  <div className="rtn-reasons">
                    {REJECT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        className={`rtn-reason${rejectReason === reason ? " is-on" : ""}`}
                        onClick={() => setRejectReason(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="rtn-note-input"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="추가 메모 (선택) — 영업담당자에게 함께 전달됩니다"
                    rows={2}
                  />
                  <div className="ds-callout danger">
                    <Icon name="alert" size={16} />
                    <span>반려 시 영업담당자({selected.manager ?? "-"})에게 작업 알림(반품반려)이 전송됩니다.</span>
                  </div>
                  <div className="rtn-actions">
                    <button type="button" className="rtn-btn" onClick={() => setMode("")}>
                      취소
                    </button>
                    <button type="button" className="rtn-btn is-reject is-solid" disabled={busy} onClick={doReject}>
                      반려 확정
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
