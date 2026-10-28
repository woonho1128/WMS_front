import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { CameraScanButton } from "../../components/ui/CameraScan";
import { OUTBOUND_STEPS, OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import { HoldDialog, type HoldTarget } from "./HoldDialog";
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

/**
 * 확인 방식 — 현장에 PDA·스캐너가 없어 휴대폰 카메라로 찍고, 창고 안쪽은 인터넷이 안 된다 (2026-10-14 사용자).
 * · qr: 휴대폰으로 줄마다 로케이션 라벨(또는 품목) QR 을 찍어 확인. 판독은 휴대폰 안에서 해서 인터넷이 없어도 되고,
 *       시작 · 완료만 인터넷이 되는 곳에서 누른다
 * · paper: 출고요청서를 들고 종이로 피킹 → 사무실 PC 에서 결품 줄만 표시하고 완료 (지금 OMS 와 같은 일)
 * 고른 방식은 기기마다 기억한다. 처음에는 휴대폰(손가락 화면)이면 qr, PC 면 paper.
 */
type VerifyMode = "paper" | "qr";
const VERIFY_KEY = "wms.picking.verifyMode";
const readVerifyMode = (): VerifyMode => {
  try {
    const saved = window.localStorage.getItem(VERIFY_KEY);
    if (saved === "qr" || saved === "paper") return saved;
  } catch {
    /* 저장소를 못 쓰면 기기로 정한다 */
  }
  return window.matchMedia?.("(pointer: coarse)").matches ? "qr" : "paper";
};

/**
 * 찍던 진행(확인 값 · 결품 줄)을 휴대폰에 남긴다 — 다른 앱을 쓰다 오면 브라우저가 화면을 다시 여는 일이 잦다.
 * 피킹 완료하면 그 건은 지운다.
 */
const PROGRESS_KEY = "wms.picking.progress";
type Progress = Record<string, { checks?: Record<number, string>; skipped?: number[] }>;
const readProgress = (): Progress => {
  try {
    return (JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as Progress) ?? {};
  } catch {
    return {};
  }
};

/** 찍은 값이 이 줄인가 — 로케이션 라벨 QR 또는 품목코드 (품목코드 QR 라벨은 아직 없다) */
const matchesLine = (value: string, ln: { itemCode: string; locationCode: string | null }) => {
  const v = value.trim().toLowerCase();
  return v !== "" && (v === ln.itemCode.toLowerCase() || (ln.locationCode != null && v === ln.locationCode.toLowerCase()));
};

export const PickingPage = () => {
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanInput, setScanInput] = useState("");

  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [linesByOutbound, setLinesByOutbound] = useState<Record<number, OutboundLine[]>>({});
  // 줄 확인 입력(로케이션·품목 QR): outboundId → lineId → 입력값 (휴대폰에 남겨 둔 것부터)
  const [qrChecks, setQrChecks] = useState<Record<number, Record<number, string>>>(() =>
    Object.fromEntries(Object.entries(readProgress()).map(([id, p]) => [Number(id), p.checks ?? {}]))
  );
  // 스킵한 라인: outboundId → lineId[]
  const [skipped, setSkipped] = useState<Record<number, number[]>>(() =>
    Object.fromEntries(Object.entries(readProgress()).map(([id, p]) => [Number(id), p.skipped ?? []]))
  );
  const [completeTarget, setCompleteTarget] = useState<OutboundRow | null>(null);
  /** 출고 불가 알림 대상 — 재고가 없어 못 나갈 때 */
  const [holdTarget, setHoldTarget] = useState<HoldTarget | null>(null);
  const [mode, setModeState] = useState<VerifyMode>(readVerifyMode);
  const paper = mode === "paper";
  /** 번호로 찾은 피킹중 건 — 그 줄로 스크롤 */
  const [focusNo, setFocusNo] = useState<string | null>(null);

  const setMode = (next: VerifyMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(VERIFY_KEY, next);
    } catch {
      /* 저장 실패는 무시 — 이번 화면에서만 유지 */
    }
  };

  // 3D 맵 우클릭 메뉴에서 넘어온 주문 — ?outboundNo=&from=로케이션
  const [searchParams] = useSearchParams();
  const linkedNo = searchParams.get("outboundNo");
  const linkedFrom = searchParams.get("from");
  const linkedRowRef = useRef<HTMLTableRowElement | null>(null);
  const linkHandled = useRef<string | null>(null);

  const reload = () => {
    setLoading(true);
    return apiGet<OutboundRow[]>("/outbounds")
      .then(setRows)
      .catch((e) => setNotice(`불러오기 실패: ${e instanceof Error ? e.message : e} (백엔드 18080 확인)`))
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

  // 진행 저장 — 목록을 받은 뒤에는 피킹 대상(출고대기 · 피킹중)이 아닌 건의 기록을 지운다
  useEffect(() => {
    const live = loading ? null : new Set(targets.map((r) => String(r.id)));
    const ids = new Set([...Object.keys(qrChecks), ...Object.keys(skipped)].filter((id) => !live || live.has(id)));
    const progress: Progress = {};
    ids.forEach((id) => {
      const checks = qrChecks[Number(id)];
      const skip = skipped[Number(id)];
      if ((checks && Object.keys(checks).length) || skip?.length) progress[id] = { checks, skipped: skip };
    });
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      /* 저장 실패는 무시 — 화면에는 남아 있다 */
    }
  }, [qrChecks, skipped, targets, loading]);

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

  useEffect(() => {
    if (!linkedNo || loading || linkHandled.current === linkedNo) return;
    const row = rows.find((r) => r.outboundNo === linkedNo);
    if (!row) return;
    linkHandled.current = linkedNo;
    if (row.status === "출고대기") setScanInput(row.outboundNo);
    setNotice(
      `3D 맵${linkedFrom ? ` ${linkedFrom} 로케이션` : ""}에서 연결된 주문 ${row.outboundNo} (${row.status}) — ` +
        (row.status === "출고대기"
          ? "스캔 칸에 넣어 두었습니다. [피킹 시작]을 누르세요."
          : paper
            ? "못 집은 줄만 [결품]으로 표시하고 [피킹 완료]를 누르세요."
            : "라인별 로케이션 QR을 찍어 확인하세요.")
    );
    window.setTimeout(() => linkedRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  }, [linkedNo, linkedFrom, rows, loading]);

  const toggleExpand = (id: number) => {
    const willExpand = !expandedIds.includes(id);
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (willExpand) fetchLines(id);
  };

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: number) => {
    if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
    toggleExpand(id);
  };

  /** 오더 QR 스캔(출하번호 입력) → 출고대기면 피킹 시작, 피킹중이면 그 건을 펼쳐 결과 입력으로 */
  const scanStart = async (scanned?: string) => {
    const no = (scanned ?? scanInput).trim();
    if (!no) return;
    const row = rows.find((r) => r.outboundNo.toLowerCase() === no.toLowerCase());
    if (!row) {
      setNotice(`'${no}' 출하번호를 찾을 수 없습니다.`);
      return;
    }
    if (row.status === "피킹중") {
      setFocusNo(row.outboundNo);
      if (!expandedIds.includes(row.id)) toggleExpand(row.id);
      window.setTimeout(() => linkedRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
      setNotice(
        paper
          ? `${row.outboundNo} — 종이 출고요청서에서 못 집은 줄만 [결품]으로 표시하고 [피킹 완료]를 누르세요.`
          : `${row.outboundNo} — 라인별 로케이션 QR을 찍거나 스킵한 뒤, 인터넷이 되는 곳에서 [피킹 완료]를 누르세요.`
      );
      setScanInput("");
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
      setNotice("피킹 시작 — 줄마다 로케이션 QR을 찍어 확인하고, 못 집은 상품은 스킵하세요. 찍는 것은 인터넷이 없어도 됩니다.");
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "피킹 시작 실패");
    } finally {
      setBusy(false);
    }
  };

  const setQr = (outboundId: number, lineId: number, v: string) =>
    setQrChecks((prev) => ({ ...prev, [outboundId]: { ...(prev[outboundId] ?? {}), [lineId]: v } }));

  /** 집은 것으로 본다 — 종이 방식은 결품 표시가 없으면 전부, QR 방식은 찍은 값이 그 줄의 로케이션 · 품목과 맞을 때 */
  const lineVerified = (outboundId: number, ln: OutboundLine) =>
    paper || matchesLine(qrChecks[outboundId]?.[ln.id] ?? "", ln);

  const isSkipped = (outboundId: number, lineId: number) => (skipped[outboundId] ?? []).includes(lineId);

  const toggleSkip = (outboundId: number, lineId: number) =>
    setSkipped((prev) => {
      const cur = prev[outboundId] ?? [];
      return { ...prev, [outboundId]: cur.includes(lineId) ? cur.filter((x) => x !== lineId) : [...cur, lineId] };
    });

  /** 라인 충족 = 로케이션·품목 QR 확인 OR 스킵 */
  const lineSatisfied = (outboundId: number, ln: OutboundLine) =>
    lineVerified(outboundId, ln) || isSkipped(outboundId, ln.id);

  /** 피킹 완료 가능 = 모든 라인 충족(확인/스킵) + 최소 1건 실제 피킹 */
  const canComplete = (row: OutboundRow) => {
    const lines = linesByOutbound[row.id] ?? [];
    if (lines.length === 0) return false;
    const everySatisfied = lines.every((ln) => lineSatisfied(row.id, ln));
    const anyPicked = lines.some((ln) => lineVerified(row.id, ln) && !isSkipped(row.id, ln.id));
    return everySatisfied && anyPicked;
  };

  const counts = (row: OutboundRow) => {
    const lines = linesByOutbound[row.id] ?? [];
    const picked = lines.filter((ln) => lineVerified(row.id, ln) && !isSkipped(row.id, ln.id)).length;
    const skip = lines.filter((ln) => isSkipped(row.id, ln.id)).length;
    return { total: lines.length, picked, skip, wait: lines.length - picked - skip };
  };

  const doComplete = async () => {
    if (!completeTarget) return;
    setBusy(true);
    const id = completeTarget.id;
    const skippedIds = skipped[id] ?? [];
    try {
      await apiPost(`/outbounds/${id}/pick-complete`, { skippedLineIds: skippedIds });
      const skipMsg = skippedIds.length ? ` (${paper ? "결품" : "스킵"} ${skippedIds.length}건 — 보류/미출고 별도 처리 대상)` : "";
      setNotice(`${completeTarget.outboundNo} 피킹 완료${skipMsg} — 피킹재고(FIFO) 차감. 출고 확정 화면에서 송장 입력 후 확정하세요.`);
      invalidate(id);
      setSkipped((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setQrChecks((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
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
        note={
          paper
            ? "출고요청서 인쇄 → 종이로 피킹·검수 → 사무실에서 결품 줄만 표시 → 피킹 완료 시 피킹재고 차감"
            : "출고요청서 QR → 로케이션 안내 → 휴대폰으로 로케이션 QR 확인(또는 스킵) → 인터넷 되는 곳에서 피킹 완료 → 피킹재고 차감"
        }
      />

      <section className="outbound-summary-grid" aria-label="피킹 요약">
        <article className="app-surface outbound-summary-card"><span>출고대기(피킹 전)</span><strong>{summary.waiting}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹중</span><strong>{summary.picking}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹완료</span><strong>{summary.picked}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title={paper ? "출하번호로 찾기 (피킹 시작 · 결과 입력)" : "오더 QR 스캔 (피킹 시작)"}>
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>{paper ? "출하번호 입력 (출고요청서 QR 을 카메라로 찍어도 됩니다)" : "출하번호 — 출고요청서 QR 을 카메라로 찍거나 입력"}</span>
            <div className="cs-inline">
              <input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") scanStart(); }}
                placeholder={paper ? "출고요청서의 출하번호 입력 후 Enter" : "오더 QR 을 찍거나 출하번호 입력 후 Enter"}
              />
              <CameraScanButton
                title="출고요청서 QR"
                onScan={(value) => {
                  setScanInput(value);
                  scanStart(value);
                }}
              />
            </div>
          </label>
          <label>
            <span>확인 방식</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as VerifyMode)} aria-label="피킹 확인 방식">
              <option value="qr">현장 QR 확인 (휴대폰 카메라)</option>
              <option value="paper">종이 출고요청서 (사무실 입력)</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => scanStart()}>피킹 시작</button>
            <button type="button" className="btn-secondary" onClick={reload}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`피킹 대상 (${targets.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ??
              (paper
                ? "출고대기 건은 피킹 시작으로, 피킹중 건은 돌아온 출고요청서를 보고 못 집은 줄만 [결품]으로 표시한 뒤 피킹 완료하세요. (결품은 차감하지 않고 보류/미출고로 별도 처리)"
                : "출고대기 건은 피킹 시작으로, 피킹중 건은 줄마다 로케이션 QR 을 휴대폰으로 찍거나 스킵한 뒤 피킹 완료하세요. (스킵 상품은 보류/미출고로 별도 처리)")}
          </p>
        </div>
        <ResponsiveTable>
          <table className="outbound-table">
            <thead>
              <tr>
                <th className="rt-title">출하번호</th>
                <th>출고예정일</th>
                <th>납품처</th>
                <th>출고형태</th>
                <th className="num">수량</th>
                <th>상태</th>
                <th className="rt-actions">처리</th>
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
                  const ready = canComplete(row);
                  const c = counts(row);
                  return (
                    <Fragment key={row.id}>
                      <tr
                        ref={row.outboundNo === (focusNo ?? linkedNo) ? linkedRowRef : undefined}
                        className={`outbound-master-row${expanded ? " is-expanded" : ""}${row.outboundNo === (focusNo ?? linkedNo) ? " is-linked" : ""}`}
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
                        <td><StatusBadge tone={OUTBOUND_STATUS_TONE[row.status]}>{row.status}</StatusBadge></td>
                        <td>
                          <div className="outbound-row-actions">
                            {row.status === "출고대기" ? (
                              <button type="button" className="btn-secondary" disabled={busy} onClick={() => pickStart(row.id)}>
                                피킹 시작
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={busy || !ready}
                                  title={
                                    ready
                                      ? undefined
                                      : paper
                                        ? "모든 줄을 결품으로 표시하면 완료할 수 없습니다 — [출고 불가]로 알리세요"
                                        : "모든 줄의 로케이션 QR을 찍거나 스킵하세요 (최소 1건 피킹 필요)"
                                  }
                                  onClick={() => setCompleteTarget(row)}
                                >
                                  피킹 완료
                                </button>
                                {/* 재고가 없어 못 나가면 — 출고를 보류로 멈추고 주문 시스템에 알린다 */}
                                <button
                                  type="button"
                                  className="btn-secondary outbound-reject-btn"
                                  disabled={busy}
                                  onClick={() => setHoldTarget(row)}
                                >
                                  출고 불가
                                </button>
                              </>
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
                                  {row.status !== "피킹중"
                                    ? paper
                                      ? "피킹 시작 후 결과를 입력할 수 있습니다"
                                      : "피킹 시작 후 QR 확인이 가능합니다"
                                    : paper
                                      ? `피킹 ${c.picked} · 결품 ${c.skip} / 총 ${c.total}`
                                      : `확인 ${c.picked} · 스킵 ${c.skip} · 대기 ${c.wait} / 총 ${c.total}`}
                                </span>
                              </div>
                              {!lines ? (
                                <p className="outbound-detail-empty">상품 정보를 불러오는 중...</p>
                              ) : (
                                <table className="outbound-detail-table">
                                  <thead>
                                    <tr>
                                      <th className="rt-title">피킹 로케이션</th>
                                      <th>SKU</th>
                                      <th>상품명</th>
                                      <th className="num">지시수량</th>
                                      <th className="num">가용재고</th>
                                      <th className="rt-actions">{paper ? "종이 결과 (못 집은 줄만 결품)" : "로케이션·품목 QR 확인 / 스킵"}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((ln) => {
                                      const ok = lineVerified(row.id, ln);
                                      const skip = isSkipped(row.id, ln.id);
                                      const short = ln.availableQty != null && ln.availableQty < ln.orderQty;
                                      return (
                                        <tr key={ln.id} style={skip ? { opacity: 0.6 } : undefined}>
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
                                              skip ? (
                                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <StatusBadge tone="yellow">{paper ? "결품" : "스킵됨"}</StatusBadge>
                                                  <button type="button" className="btn-secondary" onClick={() => toggleSkip(row.id, ln.id)}>
                                                    {paper ? "결품 취소" : "스킵 해제"}
                                                  </button>
                                                </span>
                                              ) : paper ? (
                                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <StatusBadge tone="success">피킹</StatusBadge>
                                                  <button type="button" className="btn-secondary" onClick={() => toggleSkip(row.id, ln.id)}>결품</button>
                                                </span>
                                              ) : (
                                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                                  <input
                                                    value={qrChecks[row.id]?.[ln.id] ?? ""}
                                                    onChange={(e) => setQr(row.id, ln.id, e.target.value)}
                                                    placeholder={`${ln.locationCode ?? ln.itemCode} 찍기/입력`}
                                                    style={{ width: 150 }}
                                                  />
                                                  <CameraScanButton
                                                    title={`${ln.itemName} — 로케이션 QR`}
                                                    expect={[ln.locationCode, ln.itemCode]}
                                                    onScan={(value) => setQr(row.id, ln.id, value)}
                                                  />
                                                  {ok ? <StatusBadge tone="success">확인</StatusBadge> : <StatusBadge tone="gray">대기</StatusBadge>}
                                                  <button type="button" className="btn-secondary" onClick={() => toggleSkip(row.id, ln.id)}>스킵</button>
                                                </span>
                                              )
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
        </ResponsiveTable>
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
          <span>
            {paper ? "결품이 아닌 줄은" : "확인된 라인은"} <b>피킹재고가 FIFO(LOT 입고일자순)로 차감</b>됩니다. 가용재고가 모자라면 실패 — [출고 불가]로 알리세요.
          </span>
        </div>
        {completeTarget && (skipped[completeTarget.id]?.length ?? 0) > 0 ? (
          <div className="ds-callout warning" style={{ marginTop: 8 }}>
            <span>
              {paper ? "결품" : "스킵"} <b>{skipped[completeTarget.id].length}건</b>은 이번 피킹에서 제외됩니다 — 보류/미출고로 별도 처리가 필요합니다.
              (부분출고 정책 확정 전까지 임시 운영)
            </span>
          </div>
        ) : null}
      </Modal>

      <HoldDialog
        target={holdTarget}
        onClose={() => setHoldTarget(null)}
        onDone={(message) => {
          setNotice(message);
          reload();
        }}
      />
    </section>
  );
};
