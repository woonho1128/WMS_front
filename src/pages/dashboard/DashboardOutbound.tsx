import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { QrBox } from "../../components/ui/QrBox";
import { OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import { shiftDays } from "../../shared/appDate";
import "./DashboardOutbound.css";

/* ============================================================
   출고 요청서 — OMS 수신 오더 조회 · 선택 피킹 지시 발행
   기준: DOCS/front 운영화면 재설계 HTML
   ============================================================ */

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

const STATUSES: OutboundScreenStatus[] = ["출고대기", "피킹중", "피킹완료", "출고완료", "거부"];

/** 상태별 처리 버튼 — 전용 화면으로 넘긴다 */
const ACTION: Record<OutboundScreenStatus, { label: string; primary: boolean; to?: string }> = {
  출고대기: { label: "피킹 지시", primary: true },
  피킹중: { label: "진행 보기", primary: false, to: "/outbound/picking" },
  피킹완료: { label: "출고 확정", primary: true, to: "/outbound/outbound-confirm" },
  출고완료: { label: "내역서", primary: false, to: "/outbound/delivery-note" },
  거부: { label: "사유 확인", primary: false }
};

const METRO = ["서울", "경기", "인천"];
const regionOf = (address: string | null) =>
  METRO.some((m) => (address ?? "").startsWith(m)) ? "수도권" : "지방권";

const PAGE_SIZE = 10;
const num = (n: number) => n.toLocaleString("ko-KR");

export const DashboardOutbound = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [linesById, setLinesById] = useState<Record<number, OutboundLine[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<OutboundScreenStatus | "전체">("전체");
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("전 권역");
  const [dateFrom, setDateFrom] = useState(() => shiftDays(-15));
  const [dateTo, setDateTo] = useState(() => shiftDays(15));
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [labelTarget, setLabelTarget] = useState<OutboundRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OutboundRow | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<OutboundRow[]>("/outbounds")
      .then((data) => {
        setRows(data);
        data.forEach((r) => {
          apiGet<OutboundLine[]>(`/outbounds/${r.id}/lines`)
            .then((lines) => setLinesById((prev) => ({ ...prev, [r.id]: lines })))
            .catch(() => {});
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  /* ---------- 필터 ---------- */
  const searched = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw) {
        const hay = [r.outboundNo, r.customerName, r.customerCode, r.carrier, r.shipAddress, r.invoiceNo]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      if (region !== "전 권역" && regionOf(r.shipAddress) !== region) return false;
      if (dateFrom && (r.scheduledDate ?? "") < dateFrom) return false;
      if (dateTo && (r.scheduledDate ?? "") > dateTo) return false;
      return true;
    });
  }, [rows, keyword, region, dateFrom, dateTo]);

  const filtered = useMemo(
    () => (tab === "전체" ? searched : searched.filter((r) => r.status === tab)),
    [searched, tab]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => setPage(1), [keyword, region, dateFrom, dateTo, tab]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  /* ---------- 상단 요약 ---------- */
  const day = useMemo(() => {
    const total = searched.length || 1;
    return {
      count: searched.length,
      qty: searched.reduce((a, r) => a + r.qty, 0),
      seg: STATUSES.map((s) => ({
        status: s,
        tone: OUTBOUND_STATUS_TONE[s],
        w: (searched.filter((r) => r.status === s).length / total) * 100
      }))
    };
  }, [searched]);

  const tabs = useMemo(
    () =>
      ([{ key: "전체" as const, tone: "gray" }, ...STATUSES.map((s) => ({ key: s, tone: OUTBOUND_STATUS_TONE[s] }))]).map(
        (t) => ({
          ...t,
          count: t.key === "전체" ? searched.length : searched.filter((r) => r.status === t.key).length
        })
      ),
    [searched]
  );

  const rejected = useMemo(() => searched.filter((r) => r.status === "거부"), [searched]);

  /* ---------- 선택 / 피킹 지시 ---------- */
  const selectable = paged.filter((r) => r.status === "출고대기");
  const allChecked = selectable.length > 0 && selectable.every((r) => picked.includes(r.id));
  const toggle = (row: OutboundRow) => {
    if (row.status !== "출고대기") return;
    setPicked((prev) => (prev.includes(row.id) ? prev.filter((x) => x !== row.id) : [...prev, row.id]));
  };
  const toggleAll = () =>
    setPicked((prev) => (allChecked ? prev.filter((id) => !selectable.some((r) => r.id === id)) : Array.from(new Set([...prev, ...selectable.map((r) => r.id)]))));

  const tray = useMemo(() => {
    const list = rows.filter((r) => picked.includes(r.id));
    const regions = Array.from(new Set(list.map((r) => regionOf(r.shipAddress))));
    const lineCount = list.reduce((a, r) => a + (linesById[r.id]?.length ?? 0), 0);
    return {
      any: list.length > 0,
      count: list.length,
      lineCount,
      qty: list.reduce((a, r) => a + r.qty, 0),
      regions,
      mixed: regions.length > 1
    };
  }, [rows, picked, linesById]);

  const issuePicking = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      for (const id of picked) {
        await apiPost(`/outbounds/${id}/pick-start`, {});
      }
      setNotice(`피킹 지시 ${picked.length}건 발행 — 피킹 작업 화면에서 진행하세요.`);
      setPicked([]);
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "피킹 지시 실패");
    } finally {
      setBusy(false);
    }
  };

  const runAction = (row: OutboundRow) => {
    const action = ACTION[row.status];
    if (row.status === "거부") {
      setRejectTarget(row);
      return;
    }
    if (row.status === "출고대기") {
      setPicked([row.id]);
      return;
    }
    if (action.to) navigate(action.to);
  };

  const exportCsv = () =>
    downloadCsv(
      `출고요청서_${dateFrom}_${dateTo}`,
      ["출고번호", "납품처", "출고유형", "권역", "요청일", "수량", "배송사", "송장번호", "상태"],
      filtered.map((r) => [
        r.outboundNo, r.customerName, r.outType, regionOf(r.shipAddress),
        r.scheduledDate, r.qty, r.carrier, r.invoiceNo, r.status
      ])
    );

  const progressOf = (row: OutboundRow) => {
    const lines = linesById[row.id] ?? [];
    const done = lines.filter((l) => l.pickedQty >= l.orderQty && l.orderQty > 0).length;
    return { done, total: lines.length, pct: lines.length ? Math.round((done / lines.length) * 100) : 0 };
  };

  return (
    <section className="out-page">
      {/* ---------- 금일 요약 ---------- */}
      <header className="out-summary card">
        <div className="out-summary-main">
          <span className="nx-eyebrow">금일 출고 요청</span>
          <div className="out-summary-figures">
            <b>{loading ? "—" : day.count}</b>
            <small>건</small>
            <span className="out-summary-qty">{num(day.qty)} EA</span>
          </div>
          <div className="out-seg">
            {day.seg.map((s) => (
              <i key={s.status} className={`tone-${s.tone}`} style={{ width: `${s.w}%` }} title={s.status} />
            ))}
          </div>
        </div>
        <div className="out-flow">
          <span>OMS 수신</span>
          <Icon name="chevR" size={13} />
          <span>피킹</span>
          <Icon name="chevR" size={13} />
          <span>출고확정</span>
          <Icon name="chevR" size={13} />
          <span>ERP</span>
        </div>
      </header>

      {/* ---------- 상태 칩 ---------- */}
      <div className="out-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`out-tab${tab === t.key ? " is-on" : ""}`}
            onClick={() => setTab(t.key as OutboundScreenStatus | "전체")}
          >
            <i className={`out-dot tone-${t.tone}`} />
            {t.key}
            <span className="out-tab-count">{t.count}</span>
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

      {rejected.length ? (
        <div className="out-reject-banner">
          <Icon name="alert" size={17} />
          <span>
            <b>거부 {rejected.length}건</b>
            {rejected.length === 1
              ? ` · ${rejected[0].outboundNo} · ${rejected[0].customerName} — ${rejected[0].rejectReason ?? "사유 미기재"}`
              : ` · ${rejected.map((r) => r.rejectReason ?? "사유 미기재").join(", ")}`}
          </span>
          <button type="button" className="out-btn" onClick={() => setRejectTarget(rejected[0])}>
            사유 확인
          </button>
        </div>
      ) : null}

      {/* ---------- 목록 ---------- */}
      <section className="card out-list">
        <div className="out-head">
          <div className="out-search">
            <Icon name="search" size={15} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="출고번호 · 납품처 · 배송사 · 송장번호"
              aria-label="출고 검색"
            />
          </div>
          <div className="out-head-tools">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="시작일" />
            <span className="out-dash">~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="종료일" />
            <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="권역">
              <option>전 권역</option>
              <option>수도권</option>
              <option>지방권</option>
            </select>
            <button type="button" className="out-btn" onClick={exportCsv}>
              <Icon name="download" size={14} />
              엑셀
            </button>
            <button type="button" className="nx-iconbtn" onClick={load} title="새로고침" aria-label="새로고침">
              <Icon name="refresh" size={15} />
            </button>
          </div>
        </div>

        {tray.any ? (
          <div className="out-tray">
            <span className="out-tray-sum">
              <b>{tray.count}건 선택</b> · {tray.lineCount}라인 · {num(tray.qty)} EA
            </span>
            <span className={`ds-badge ${tray.mixed ? "warning" : "info"}`}>{tray.regions.join(" + ")}</span>
            {tray.mixed ? <span className="out-tray-warn">권역이 섞여 있습니다 — 배차 시 분리됩니다.</span> : null}
            <button type="button" className="out-btn" onClick={() => setPicked([])}>
              해제
            </button>
            <button type="button" className="btn-primary out-tray-cta" disabled={busy} onClick={issuePicking}>
              피킹 지시 발행 · {tray.count}건
              <Icon name="arrowR" size={15} />
            </button>
          </div>
        ) : null}

        <div className="out-table-wrap">
          <table className="data-table out-table">
            <thead>
              <tr>
                <th className="out-check-col">
                  <button
                    type="button"
                    className={`out-check${allChecked ? " is-on" : ""}`}
                    onClick={toggleAll}
                    disabled={!selectable.length}
                    aria-label="전체 선택"
                  >
                    {allChecked ? <Icon name="check" size={12} /> : null}
                  </button>
                </th>
                <th>출고번호</th>
                <th>납품처</th>
                <th>권역</th>
                <th>요청일</th>
                <th className="num">수량</th>
                <th>진행</th>
                <th>상태</th>
                <th className="out-act-col">처리</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => {
                const on = picked.includes(row.id);
                const prog = progressOf(row);
                const rg = regionOf(row.shipAddress);
                const action = ACTION[row.status];
                return (
                  <tr
                    key={row.id}
                    className={`out-row${on ? " is-sel" : ""}`}
                    onClick={() => toggle(row)}
                    title={`${row.outboundNo} · ${row.customerName} · ${row.outType} · ${row.carrier} · ${row.shipAddress}`}
                  >
                    <td className="out-check-col">
                      {row.status === "출고대기" ? (
                        <span className={`out-check${on ? " is-on" : ""}`}>{on ? <Icon name="check" size={12} /> : null}</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="out-no">{row.outboundNo}</div>
                      <div className="out-sub">{row.outType}</div>
                    </td>
                    <td>
                      <div className="out-cust">{row.customerName}</div>
                      <div className="out-sub">{row.customerCode}</div>
                    </td>
                    <td>
                      <span className={`ds-badge ${rg === "수도권" ? "info" : "gray"}`}>{rg === "수도권" ? "수도" : "지방"}</span>
                    </td>
                    <td className="out-date">{(row.scheduledDate ?? "").slice(5)}</td>
                    <td className="num">{num(row.qty)}</td>
                    <td className="out-prog">
                      <span className="out-prog-text">
                        {prog.done}/{prog.total || "-"}
                      </span>
                      <span className={`nx-bar ${row.status === "거부" ? "is-danger" : prog.pct === 100 ? "is-ok" : "is-info"}`}>
                        <i style={{ width: `${row.status === "거부" ? 100 : prog.pct}%` }} />
                      </span>
                    </td>
                    <td>
                      <span className={`ds-badge ${OUTBOUND_STATUS_TONE[row.status]}`}>
                        <i className="bdot" />
                        {row.status}
                      </span>
                    </td>
                    <td className="out-act-col">
                      <div className="out-actions">
                        <button
                          type="button"
                          className="out-btn is-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLabelTarget(row);
                          }}
                          title="오더 QR 라벨"
                        >
                          <Icon name="grid" size={13} />
                        </button>
                        <button
                          type="button"
                          className={`out-btn${action.primary ? " is-primary" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            runAction(row);
                          }}
                        >
                          {action.label}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!paged.length && !loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="nx-empty">조건에 맞는 출고 요청이 없습니다.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="out-pager">
          <span>
            총 {filtered.length}건 · {page}/{pageCount} 페이지
          </span>
          <div className="out-pager-btns">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              이전
            </button>
            <span className="out-pager-now">{page}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              다음
            </button>
          </div>
        </div>
      </section>

      {/* ---------- 오더 QR 라벨 ---------- */}
      <Modal
        open={labelTarget !== null}
        title="오더 QR 라벨"
        desc={labelTarget ? `${labelTarget.outboundNo} · ${labelTarget.customerName}` : ""}
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
          <div className="out-label">
            <div className="out-label-qr">
              <QrBox value={`WMS-OUT|${labelTarget.outboundNo}`} />
              <span>데모 QR</span>
            </div>
            <dl className="out-label-meta">
              <div>
                <dt>출고번호</dt>
                <dd>{labelTarget.outboundNo}</dd>
              </div>
              <div>
                <dt>납품처</dt>
                <dd>{labelTarget.customerName}</dd>
              </div>
              <div>
                <dt>배송사</dt>
                <dd>{labelTarget.carrier ?? "-"}</dd>
              </div>
              <div>
                <dt>품목</dt>
                <dd>{(linesById[labelTarget.id] ?? []).map((l) => l.itemCode).join(", ") || "…"}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>

      {/* ---------- 거부 사유 ---------- */}
      <Modal
        open={rejectTarget !== null}
        title="거부 사유"
        desc={rejectTarget ? `${rejectTarget.outboundNo} · ${rejectTarget.customerName}` : ""}
        icon="alert"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger-ink)"
        onClose={() => setRejectTarget(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setRejectTarget(null)}>
            닫기
          </button>
        }
      >
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>{rejectTarget?.rejectReason ?? "사유 미기재"}</span>
        </div>
        <p className="out-reject-note">
          거부 건은 OMS로 거부값이 회신되어 주문이 실패 처리됩니다. 재출고는 OMS에서 오더를 다시 수신해야 합니다.
        </p>
      </Modal>
    </section>
  );
};
