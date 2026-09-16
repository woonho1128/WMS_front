import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { QrBox } from "../../components/ui/QrBox";
import { apiGet, apiPost } from "../../services/http";
import "./InboundConfirmPage.css";

/* ============================================================
   입고 확정 — 검수(예정 vs 실입고) → QR 입고라벨 → 격납대기 생성
   기준: DOCS/front 운영화면 재설계 (cf 화면)
   ============================================================ */

type InboundRow = {
  id: number;
  inboundNo: string;
  poNo: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  warehouseName: string | null;
  warehouseType: string | null;
  type: string;
  inTypeCode: string | null;
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
  trackingNo: string | null;
  inspected: boolean;
  expectedQty: number;
  receivedQty: number;
};

const num = (n: number) => n.toLocaleString("ko-KR");

/** ERP 전송 대상 구분 — 공장간이동·외주는 ERP 미연동 (프로세스 문서 §2, §5) */
const erpBadge = (row: InboundRow) => {
  if (row.inTypeCode === "MVR" || row.type === "이동") {
    return { label: "공장간이동 · ERP 미전송", tone: "teal" };
  }
  if (row.type === "외주" || row.warehouseType === "외주") {
    return { label: "외주 재고 · ERP 미연동", tone: "consign" };
  }
  return { label: "ERP 입고결과 전송 대상", tone: "info" };
};

export const InboundConfirmPage = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<InboundRow[]>([]);
  const [linesById, setLinesById] = useState<Record<number, InboundLine[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done">("wait");
  const [selId, setSelId] = useState<number | null>(null);
  /** 검수 입력값: inboundId → lineId → 실입고 수량 */
  const [inspect, setInspect] = useState<Record<number, Record<number, number>>>({});
  const [confirmTarget, setConfirmTarget] = useState<InboundRow | null>(null);
  const [labelTarget, setLabelTarget] = useState<InboundRow | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<InboundRow[]>("/inbounds")
      .then((data) => {
        const target = data.filter((r) => r.status === "located" || r.status === "confirmed");
        setRows(target);
        target.forEach((r) => {
          apiGet<InboundLine[]>(`/inbounds/${r.id}/lines`)
            .then((lines) => setLinesById((prev) => ({ ...prev, [r.id]: lines })))
            .catch(() => {});
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  /** 라인의 현재 검수 수량 (입력값 없으면 서버값, 서버도 0이면 예정수량) */
  const qtyOf = (inboundId: number, line: InboundLine) => {
    const entered = inspect[inboundId]?.[line.id];
    if (entered != null) return entered;
    return line.receivedQty > 0 ? line.receivedQty : line.expectedQty;
  };
  const setQty = (inboundId: number, lineId: number, qty: number) =>
    setInspect((prev) => ({
      ...prev,
      [inboundId]: { ...(prev[inboundId] ?? {}), [lineId]: Math.max(0, Number.isFinite(qty) ? qty : 0) }
    }));

  const listed = useMemo(
    () => rows.filter((r) => (tab === "wait" ? r.status === "located" : r.status === "confirmed")),
    [rows, tab]
  );

  useEffect(() => {
    if (!listed.length) {
      setSelId(null);
      return;
    }
    setSelId((prev) => (prev && listed.some((r) => r.id === prev) ? prev : listed[0].id));
  }, [listed]);

  const selected = rows.find((r) => r.id === selId) ?? null;
  const selLines = selected ? linesById[selected.id] ?? [] : [];

  const sums = (row: InboundRow) => {
    const lines = linesById[row.id] ?? [];
    const exp = lines.reduce((a, l) => a + l.expectedQty, 0);
    const rec = lines.reduce((a, l) => a + qtyOf(row.id, l), 0);
    const bad = lines.filter((l) => qtyOf(row.id, l) !== l.expectedQty).length;
    return { exp, rec, bad, lineCount: lines.length };
  };

  const head = useMemo(() => {
    const wait = rows.filter((r) => r.status === "located");
    const done = rows.filter((r) => r.status === "confirmed");
    const mismatch = wait.filter((r) => sums(r).bad > 0).length;
    const qty = wait.reduce((a, r) => a + sums(r).exp, 0);
    return { wait: wait.length, done: done.length, mismatch, qty };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, linesById, inspect]);

  const doConfirm = async () => {
    if (!confirmTarget) return;
    const lines = linesById[confirmTarget.id] ?? [];
    setBusy(true);
    try {
      await apiPost(`/inbounds/${confirmTarget.id}/confirm`, {
        lines: lines.map((ln) => ({ lineId: ln.id, receivedQty: qtyOf(confirmTarget.id, ln) }))
      });
      setNotice(`${confirmTarget.inboundNo} 입고확정 완료 — 검수 수량이 격납대기 재고로 생성되었습니다.`);
      setConfirmTarget(null);
      setLinesById((prev) => {
        const next = { ...prev };
        delete next[confirmTarget.id];
        return next;
      });
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "입고확정 실패");
    } finally {
      setBusy(false);
    }
  };

  const selSums = selected ? sums(selected) : { exp: 0, rec: 0, bad: 0, lineCount: 0 };
  const diff = selSums.rec - selSums.exp;
  const erp = selected ? erpBadge(selected) : null;
  const confirmed = selected?.status === "confirmed";

  return (
    <section className="cfm-page">
      {/* ---------- 헤더 요약 ---------- */}
      <header className="card cfm-head">
        <div className="cfm-head-top">
          <div className="nx-sect">
            <span className="nx-sect-title">검수 · 입고확정</span>
            <span className="ds-badge info">4단계 / 5</span>
          </div>
          <span className="cfm-flow">검수(예정 vs 실입고) → QR 입고라벨 → 확정 시 격납대기 재고 생성</span>
        </div>
        <div className="cfm-kpis">
          <div className="cfm-kpi">
            <span>확정 대기</span>
            <b>
              {loading ? "—" : head.wait}
              <small>건</small>
            </b>
          </div>
          <div className="cfm-kpi">
            <span>검수 대상 수량</span>
            <b>
              {num(head.qty)}
              <small>EA</small>
            </b>
          </div>
          <div className="cfm-kpi">
            <span>수량 불일치</span>
            <b className={head.mismatch ? "is-bad" : ""}>
              {head.mismatch}
              <small>건</small>
            </b>
          </div>
          <div className="cfm-kpi">
            <span>금일 확정 완료</span>
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
          <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
        </div>
      ) : null}
      {notice ? (
        <div className="ds-callout success">
          <Icon name="check" size={18} />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="cfm-main">
        {/* ---------- 입고 건 목록 ---------- */}
        <section className="card cfm-list">
          <div className="cfm-card-head">
            <span className="nx-sect-title">입고 건</span>
            <div className="cfm-tabs">
              {(["wait", "done"] as const).map((k) => (
                <button key={k} type="button" className={`cfm-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
                  {k === "wait" ? "확정 대기" : "확정 완료"}
                  <span>{k === "wait" ? head.wait : head.done}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cfm-table-wrap">
            <table className="data-table cfm-table">
              <thead>
                <tr>
                  <th>입고번호 · 공급처</th>
                  <th className="num">예정</th>
                  <th className="num">실입고</th>
                  <th>검수</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r) => {
                  const s = sums(r);
                  const flag =
                    s.bad > 0
                      ? { label: `불일치 ${s.bad}`, tone: "danger" }
                      : r.status === "confirmed"
                        ? { label: "격납대기 생성", tone: "success" }
                        : { label: "일치", tone: "gray" };
                  return (
                    <tr
                      key={r.id}
                      className={`cfm-row${selId === r.id ? " is-sel" : ""}`}
                      onClick={() => setSelId(r.id)}
                      title={`${r.inboundNo} · ${r.supplierName} · ${r.inTypeName} · ${r.warehouseName}`}
                    >
                      <td>
                        <div className="cfm-no">
                          {r.inboundNo}
                          <span className="cfm-lines-tag">{s.lineCount}L</span>
                        </div>
                        <div className="cfm-sub">
                          {r.supplierName} · {(r.expectedAt ?? "").slice(5)}
                        </div>
                      </td>
                      <td className="num">{num(s.exp)}</td>
                      <td className="num cfm-rec">{num(s.rec)}</td>
                      <td>
                        <span className={`ds-badge ${flag.tone}`}>{flag.label}</span>
                      </td>
                    </tr>
                  );
                })}
                {!listed.length && !loading ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="nx-empty">
                        {tab === "wait"
                          ? "확정 대기 건이 없습니다. 입고 예정에서 등록·로케이션 지정을 먼저 진행하세요."
                          : "확정 완료 건이 없습니다."}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- 검수 상세 ---------- */}
        <section className="card cfm-detail">
          {!selected ? (
            <div className="nx-empty">좌측에서 입고 건을 선택하세요.</div>
          ) : (
            <>
              <div className="cfm-detail-head">
                <div>
                  <div className="cfm-detail-no">
                    {selected.inboundNo}
                    <span className={`ds-badge ${confirmed ? "success" : "warning"}`}>
                      {confirmed ? "입고확정" : "확정대기"}
                    </span>
                    {erp ? <span className={`ds-badge ${erp.tone}`}>{erp.label}</span> : null}
                  </div>
                  <div className="cfm-sub">
                    {selected.supplierName} · {selected.inTypeName} · {selected.warehouseName} · PO{" "}
                    {selected.poNo ?? "—"}
                  </div>
                </div>
                <button type="button" className="cfm-btn" onClick={() => setLabelTarget(selected)}>
                  <Icon name="grid" size={14} />
                  QR 입고라벨
                </button>
              </div>

              <div className="cfm-lines">
                {selLines.map((ln) => {
                  const q = qtyOf(selected.id, ln);
                  const d = q - ln.expectedQty;
                  return (
                    <article key={ln.id} className={`cfm-line${d === 0 ? "" : " is-diff"}`}>
                      <div className="cfm-line-info">
                        <div className="cfm-line-sku">
                          {ln.itemCode}
                          {ln.consign ? <span className="ds-badge consign">외주</span> : null}
                          {ln.inspected ? <span className="ds-badge info">검사</span> : null}
                        </div>
                        <div className="cfm-line-name">{ln.itemName}</div>
                        <div className="cfm-line-meta">
                          <span className={`cfm-chip${ln.locationCode ? "" : " is-warn"}`}>
                            {ln.locationCode ?? "로케이션 미지정"}
                          </span>
                          {ln.trackingNo ? <span className="cfm-chip is-mono">{ln.trackingNo}</span> : null}
                          <span className="cfm-chip">예정 {num(ln.expectedQty)} {ln.unit}</span>
                        </div>
                      </div>

                      <div className="cfm-line-input">
                        {confirmed ? (
                          <div className="cfm-qty-fixed">{num(ln.receivedQty || q)}</div>
                        ) : (
                          <div className="cfm-stepper">
                            <button type="button" onClick={() => setQty(selected.id, ln.id, q - 1)} aria-label="수량 감소">
                              <Icon name="minus" size={13} />
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={q}
                              onChange={(e) => setQty(selected.id, ln.id, Number(e.target.value))}
                              aria-label={`${ln.itemCode} 실입고 수량`}
                            />
                            <button type="button" onClick={() => setQty(selected.id, ln.id, q + 1)} aria-label="수량 증가">
                              <Icon name="plus" size={13} />
                            </button>
                          </div>
                        )}
                        <div className="cfm-line-foot">
                          <span className={`ds-badge ${d === 0 ? "gray" : d > 0 ? "info" : "danger"}`}>
                            {d === 0 ? "0" : d > 0 ? `+${num(d)}` : num(d)}
                          </span>
                          {!confirmed && d !== 0 ? (
                            <button
                              type="button"
                              className="cfm-same"
                              onClick={() => setQty(selected.id, ln.id, ln.expectedQty)}
                            >
                              예정과 동일
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!selLines.length ? <div className="nx-empty">품목 라인을 불러오는 중…</div> : null}
              </div>

              <div className="cfm-total">
                <div>
                  <dt>예정 합계</dt>
                  <dd>{num(selSums.exp)}</dd>
                </div>
                <div>
                  <dt>실입고 합계</dt>
                  <dd>{num(selSums.rec)}</dd>
                </div>
                <div>
                  <dt>차이</dt>
                  <dd className={diff === 0 ? "is-ok" : diff > 0 ? "is-over" : "is-short"}>
                    {diff === 0 ? "0" : diff > 0 ? `+${num(diff)}` : num(diff)}
                  </dd>
                </div>
              </div>

              <div className={`ds-callout ${confirmed ? "success" : selSums.bad ? "danger" : "info"} cfm-note`}>
                <Icon name={selSums.bad && !confirmed ? "alert" : "check"} size={16} />
                <span>
                  {confirmed
                    ? "격납대기 재고가 생성되었습니다. 재고관리 → 격납 대기에서 격납을 진행하세요."
                    : selSums.bad
                      ? `예정과 다른 라인이 ${selSums.bad}건입니다. 검수 결과대로 확정되며 차이는 수정요청(ERP) 대상입니다.`
                      : "전 라인 수량이 예정과 일치합니다. 확정하면 검수 수량만큼 격납대기 재고가 생성됩니다."}
                </span>
              </div>

              <div className="cfm-actions">
                {confirmed ? (
                  <button type="button" className="btn-primary cfm-cta" onClick={() => navigate("/stock/putaway")}>
                    격납 대기로 이동
                    <Icon name="arrowR" size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary cfm-cta"
                    disabled={busy || !selLines.length}
                    onClick={() => setConfirmTarget(selected)}
                  >
                    입고확정 · 격납대기 생성
                    <Icon name="arrowR" size={15} />
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ---------- 확정 확인 ---------- */}
      <Modal
        open={confirmTarget !== null}
        title="입고확정 (격납대기 생성)"
        desc={confirmTarget ? `${confirmTarget.inboundNo} · 실입고 합계 ${num(selSums.rec)}` : ""}
        icon="checkCircle"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success-ink)"
        onClose={() => setConfirmTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmTarget(null)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doConfirm}>
              입고확정
            </button>
          </>
        }
      >
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>
            검수 수량만큼 <b>격납대기 재고</b>가 생성됩니다. 격납 완료 시 가용재고로 전환됩니다.
            {confirmTarget ? ` (${erpBadge(confirmTarget).label})` : ""}
          </span>
        </div>
        {selSums.bad ? (
          <div className="ds-callout danger" style={{ marginTop: 8 }}>
            <Icon name="alert" size={18} />
            <span>예정과 다른 라인 {selSums.bad}건 — 차이내역은 수정요청(ERP) 대상입니다.</span>
          </div>
        ) : null}
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
          <div className="cfm-label">
            <div className="cfm-label-qr">
              <QrBox value={`WMS-IN|${labelTarget.inboundNo}|LOT-${labelTarget.inboundNo}`} />
              <span>스캔용 QR</span>
            </div>
            <dl className="cfm-label-meta">
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
                <dt>창고</dt>
                <dd>{labelTarget.warehouseName}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
