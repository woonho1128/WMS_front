import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { INBOUND_WORKERS, can } from "../../app/permissions";
import { useUiStore } from "../../app/store/uiStore";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { QrBox } from "../../components/ui/QrBox";
import { apiGet, apiPost } from "../../services/http";
import "./InboundConfirmPage.css";

/* ============================================================
   입고 확정 — 검수(이번에 받은 수량) → QR 입고라벨 → 격납대기 생성
   기준: DOCS/front 운영화면 재설계 (cf 화면)
   나눠 입고: 확정 한 번이 입고 회차 하나(LOT 하나). 덜 오면 남은 수량은 입고예정으로 돌아가 다음 도착을 기다린다.
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
  receivedQty: number;
  closedQty: number;
  remainingQty: number;
  receiptCount: number;
  nextLotNo: string | null;
  lastLotNo: string | null;
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
  closedQty: number;
  remainingQty: number;
};

type ConfirmResult = { status: string; receiptSeq: number; lotNo: string; receivedQty: number; remainingQty: number; overQty: number };

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

/** 받은 적이 있고 남은 수량을 기다리는 건 — 확정 완료 탭에 '부분 입고'로 */
const isPartial = (r: InboundRow) => r.status === "scheduled" && r.receivedQty > 0 && r.remainingQty > 0;
const isWaiting = (r: InboundRow) => r.status === "located";
const isDone = (r: InboundRow) => r.status === "confirmed" || isPartial(r);
const lotOf = (r: InboundRow) => (isWaiting(r) ? r.nextLotNo : r.lastLotNo) ?? `LOT-${r.inboundNo}`;

export const InboundConfirmPage = () => {
  const navigate = useNavigate();
  const role = useUiStore((state) => state.currentRole);
  const canWork = can(role, INBOUND_WORKERS);

  const [rows, setRows] = useState<InboundRow[]>([]);
  const [linesById, setLinesById] = useState<Record<number, InboundLine[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done">("wait");
  const [selId, setSelId] = useState<number | null>(null);
  /** 검수 입력값: inboundId → lineId → 이번에 받은 수량 */
  const [inspect, setInspect] = useState<Record<number, Record<number, number>>>({});
  const [confirmTarget, setConfirmTarget] = useState<InboundRow | null>(null);
  const [labelTarget, setLabelTarget] = useState<InboundRow | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<InboundRow[]>("/inbounds")
      .then((data) => {
        const target = data.filter((r) => isWaiting(r) || isDone(r));
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

  /** 검수 기준 — 확정 대기는 이번에 올 남은 수량, 끝난 건은 예정 수량 */
  const targetOf = (row: InboundRow, line: InboundLine) => (isWaiting(row) ? line.remainingQty : line.expectedQty);
  /** 라인의 수량 — 확정 대기는 입력값(없으면 남은 수량), 끝난 건은 받은 수량 */
  const qtyOf = (row: InboundRow, line: InboundLine) => {
    if (!isWaiting(row)) return line.receivedQty;
    const entered = inspect[row.id]?.[line.id];
    return entered != null ? entered : line.remainingQty;
  };
  const setQty = (inboundId: number, lineId: number, qty: number) =>
    setInspect((prev) => ({
      ...prev,
      [inboundId]: { ...(prev[inboundId] ?? {}), [lineId]: Math.max(0, Number.isFinite(qty) ? Math.floor(qty) : 0) }
    }));

  const listed = useMemo(() => rows.filter((r) => (tab === "wait" ? isWaiting(r) : isDone(r))), [rows, tab]);

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
    const exp = lines.reduce((a, l) => a + targetOf(row, l), 0);
    const rec = lines.reduce((a, l) => a + qtyOf(row, l), 0);
    const short = lines.filter((l) => qtyOf(row, l) < targetOf(row, l)).length;
    const over = lines.filter((l) => qtyOf(row, l) > targetOf(row, l)).length;
    return { exp, rec, short, over, lineCount: lines.length };
  };

  const head = useMemo(() => {
    const wait = rows.filter(isWaiting);
    const done = rows.filter((r) => r.status === "confirmed");
    const partial = rows.filter(isPartial);
    const qty = wait.reduce((a, r) => a + sums(r).exp, 0);
    return { wait: wait.length, done: done.length, partial: partial.length, doneTab: done.length + partial.length, qty };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, linesById, inspect]);

  const doConfirm = async () => {
    if (!confirmTarget) return;
    const lines = linesById[confirmTarget.id] ?? [];
    setBusy(true);
    try {
      const r = await apiPost<ConfirmResult>(`/inbounds/${confirmTarget.id}/confirm`, {
        lines: lines.map((ln) => ({ lineId: ln.id, receivedQty: qtyOf(confirmTarget, ln) }))
      });
      const over = r.overQty > 0 ? ` 예정보다 ${num(r.overQty)} 많이 받았습니다.` : "";
      setNotice(
        r.status === "scheduled"
          ? {
              tone: "info",
              text: `${confirmTarget.inboundNo} ${r.receiptSeq}회차 입고확정 — 격납대기 재고 생성 (${r.lotNo}). 남은 수량(${num(r.remainingQty)})은 입고예정으로 다음 도착을 기다립니다.${over}`
            }
          : {
              tone: "success",
              text: `${confirmTarget.inboundNo} 입고확정 완료 — 격납대기 재고 생성 (${r.lotNo}).${over}`
            }
      );
      setConfirmTarget(null);
      setInspect((prev) => {
        const next = { ...prev };
        delete next[confirmTarget.id];
        return next;
      });
      setLinesById((prev) => {
        const next = { ...prev };
        delete next[confirmTarget.id];
        return next;
      });
      load();
    } catch (e) {
      setNotice({ tone: "danger", text: e instanceof Error ? e.message : "입고확정 실패" });
      setConfirmTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const selSums = selected ? sums(selected) : { exp: 0, rec: 0, short: 0, over: 0, lineCount: 0 };
  const diff = selSums.rec - selSums.exp;
  const erp = selected ? erpBadge(selected) : null;
  const waiting = selected ? isWaiting(selected) : false;
  const partial = selected ? isPartial(selected) : false;
  const seq = selected ? (waiting ? selected.receiptCount + 1 : selected.receiptCount) : 0;

  const listFlag = (r: InboundRow) => {
    if (isPartial(r)) return { label: `남음 ${num(r.remainingQty)} 대기`, tone: "info" };
    if (r.status === "confirmed") return r.closedQty > 0 ? { label: `끝 · 닫음 ${num(r.closedQty)}`, tone: "success" } : { label: "격납대기 생성", tone: "success" };
    const s = sums(r);
    if (s.over) return { label: `초과 ${s.over}`, tone: "warning" };
    if (s.short) return { label: `덜 옴 ${s.short}`, tone: "info" };
    return { label: "일치", tone: "gray" };
  };

  const detailNote = () => {
    if (!selected) return { tone: "info", icon: "check", text: "" };
    if (partial) {
      return {
        tone: "info",
        icon: "clock",
        text: `${selected.receiptCount}회 받았습니다 (받음 ${num(selected.receivedQty)} / 예정 ${num(selected.qty)}). 남은 수량(${num(selected.remainingQty)})은 입고예정으로 기다립니다 — 다음 도착은 입고 예정 화면에서 등록하고, 끝내 안 오면 거기서 남은 수량을 닫습니다.`
      };
    }
    if (selected.status === "confirmed") {
      return { tone: "success", icon: "check", text: "격납대기 재고가 생성되었습니다. 재고관리 → 격납 대기에서 격납을 진행하세요." };
    }
    if (selLines.length && selSums.rec === 0) {
      return {
        tone: "warning",
        icon: "alert",
        text: "받은 수량이 없습니다 — 아무것도 오지 않았으면 입고 예정 화면에서 '도착 취소'로 입고예정에 되돌리세요."
      };
    }
    if (selSums.over) {
      return {
        tone: "warning",
        icon: "alert",
        text: `예정(남은 수량)보다 많은 줄이 ${selSums.over}개입니다. 초과 입고 규칙은 아직 정하지 않았습니다 — 받은 그대로 확정됩니다.`
      };
    }
    if (selSums.short) {
      return {
        tone: "info",
        icon: "clock",
        text: `덜 온 줄이 ${selSums.short}개입니다. 확정하면 받은 만큼 격납대기 재고가 생기고, 남은 수량(${num(selSums.exp - selSums.rec)})은 입고예정으로 돌아가 다음 도착을 기다립니다.`
      };
    }
    return { tone: "info", icon: "check", text: "모든 줄이 남은 수량대로 왔습니다. 확정하면 받은 수량만큼 격납대기 재고가 생성됩니다." };
  };
  const note = detailNote();

  return (
    <section className="cfm-page">
      {/* ---------- 헤더 요약 ---------- */}
      <header className="card cfm-head">
        <div className="cfm-head-top">
          <div className="nx-sect">
            <span className="nx-sect-title">검수 · 입고확정</span>
            <span className="ds-badge info">4단계 / 5</span>
          </div>
          <span className="cfm-flow">검수(이번에 받은 수량) → QR 입고라벨 → 확정 시 격납대기 재고 생성 · 덜 오면 남은 수량은 대기</span>
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
            <span>남은 수량 대기</span>
            <b className={head.partial ? "is-wait" : ""}>
              {head.partial}
              <small>건</small>
            </b>
          </div>
          <div className="cfm-kpi">
            <span>확정 완료</span>
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
        <div className={`ds-callout ${notice.tone}`}>
          <Icon name={notice.tone === "danger" ? "alert" : "check"} size={18} />
          <span>{notice.text}</span>
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
                  <span>{k === "wait" ? head.wait : head.doneTab}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cfm-table-wrap">
            <table className="data-table cfm-table">
              <thead>
                <tr>
                  <th>입고번호 · 공급처</th>
                  <th className="num">{tab === "wait" ? "이번 예정" : "예정"}</th>
                  <th className="num">{tab === "wait" ? "실입고" : "받음"}</th>
                  <th>검수</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r) => {
                  const s = sums(r);
                  const flag = listFlag(r);
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
                          {isWaiting(r) && r.receiptCount > 0 ? (
                            <span className="cfm-lines-tag is-seq">{r.receiptCount + 1}회차</span>
                          ) : null}
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
                    <span className={`ds-badge ${waiting ? "warning" : partial ? "info" : "success"}`}>
                      {waiting ? "확정대기" : partial ? "부분 입고" : "입고확정"}
                    </span>
                    {seq > 1 || partial ? <span className="ds-badge gray">{seq}회차</span> : null}
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
                  const q = qtyOf(selected, ln);
                  const t = targetOf(selected, ln);
                  const d = q - t;
                  const doneLine = waiting && ln.remainingQty === 0 && ln.receivedQty > 0;
                  return (
                    <article key={ln.id} className={`cfm-line${d > 0 ? " is-diff" : d < 0 ? " is-wait" : ""}`}>
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
                          {ln.receivedQty > 0 && waiting ? <span className="cfm-chip">받음 {num(ln.receivedQty)}</span> : null}
                          {waiting && ln.receivedQty > 0 && ln.remainingQty > 0 ? (
                            <span className="cfm-chip is-wait">남음 {num(ln.remainingQty)}</span>
                          ) : null}
                          {!waiting && ln.remainingQty > 0 ? <span className="cfm-chip is-wait">남음 {num(ln.remainingQty)}</span> : null}
                          {ln.closedQty > 0 ? <span className="cfm-chip">닫음 {num(ln.closedQty)}</span> : null}
                          {doneLine ? <span className="cfm-chip">이 줄은 다 받음</span> : null}
                        </div>
                      </div>

                      <div className="cfm-line-input">
                        {!waiting || doneLine ? (
                          <div className="cfm-qty-fixed">{num(q)}</div>
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
                              aria-label={`${ln.itemCode} 이번에 받은 수량`}
                            />
                            <button type="button" onClick={() => setQty(selected.id, ln.id, q + 1)} aria-label="수량 증가">
                              <Icon name="plus" size={13} />
                            </button>
                          </div>
                        )}
                        <div className="cfm-line-foot">
                          <span className={`ds-badge ${d === 0 ? "gray" : d > 0 ? "warning" : "info"}`}>
                            {d === 0 ? "0" : d > 0 ? `+${num(d)} 초과` : `${num(d)} 대기`}
                          </span>
                          {waiting && !doneLine && d !== 0 ? (
                            <button type="button" className="cfm-same" onClick={() => setQty(selected.id, ln.id, t)}>
                              {ln.receivedQty > 0 ? "남은 수량 그대로" : "예정과 동일"}
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
                  <dt>{waiting ? "이번 예정" : "예정 합계"}</dt>
                  <dd>{num(selSums.exp)}</dd>
                </div>
                <div>
                  <dt>{waiting ? "실입고 합계" : "받은 합계"}</dt>
                  <dd>{num(selSums.rec)}</dd>
                </div>
                <div>
                  <dt>{waiting ? "차이" : "남음"}</dt>
                  {waiting ? (
                    <dd className={diff === 0 ? "is-ok" : diff > 0 ? "is-over" : "is-wait"}>
                      {diff === 0 ? "0" : diff > 0 ? `+${num(diff)}` : num(diff)}
                    </dd>
                  ) : (
                    <dd className={selected.remainingQty ? "is-wait" : "is-ok"}>{num(selected.remainingQty)}</dd>
                  )}
                </div>
              </div>

              <div className={`ds-callout ${note.tone} cfm-note`}>
                <Icon name={note.icon} size={16} />
                <span>{note.text}</span>
              </div>

              <div className="cfm-actions">
                {!waiting ? (
                  <button type="button" className="btn-primary cfm-cta" onClick={() => navigate("/stock/putaway")}>
                    격납 대기로 이동
                    <Icon name="arrowR" size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary cfm-cta"
                    disabled={busy || !selLines.length || !canWork || selSums.rec === 0}
                    title={!canWork ? "입고확정은 관리자 · 물류 · 입고 담당자가 합니다." : selSums.rec === 0 ? "받은 수량이 없습니다" : undefined}
                    onClick={() => setConfirmTarget(selected)}
                  >
                    {seq > 1 ? `${seq}회차 입고확정 · 격납대기 생성` : "입고확정 · 격납대기 생성"}
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
        desc={confirmTarget ? `${confirmTarget.inboundNo} · ${seq}회차 · 실입고 합계 ${num(selSums.rec)}` : ""}
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
            이번에 받은 수량만큼 <b>격납대기 재고</b>가 생성됩니다 ({confirmTarget ? lotOf(confirmTarget) : ""}). 격납 완료 시
            가용재고로 전환됩니다.
            {confirmTarget ? ` (${erpBadge(confirmTarget).label})` : ""}
          </span>
        </div>
        {selSums.short ? (
          <div className="ds-callout info" style={{ marginTop: 8 }}>
            <Icon name="clock" size={18} />
            <span>
              덜 온 줄 {selSums.short}개 — 남은 수량({num(Math.max(0, selSums.exp - selSums.rec))})은 입고예정으로 돌아가 다음 도착을
              기다립니다.
            </span>
          </div>
        ) : null}
        {selSums.over ? (
          <div className="ds-callout warning" style={{ marginTop: 8 }}>
            <Icon name="alert" size={18} />
            <span>예정보다 많은 줄 {selSums.over}개 — 받은 그대로 확정됩니다.</span>
          </div>
        ) : null}
      </Modal>

      {/* ---------- QR 입고라벨 ---------- */}
      <Modal
        open={labelTarget !== null}
        title="QR 입고라벨"
        desc={labelTarget ? `${labelTarget.inboundNo} · ${lotOf(labelTarget)}` : ""}
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
              <QrBox value={`WMS-IN|${labelTarget.inboundNo}|${lotOf(labelTarget)}`} />
              <span>스캔용 QR</span>
            </div>
            <dl className="cfm-label-meta">
              <div>
                <dt>입고번호</dt>
                <dd>{labelTarget.inboundNo}</dd>
              </div>
              <div>
                <dt>LOT</dt>
                <dd>{lotOf(labelTarget)}</dd>
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
