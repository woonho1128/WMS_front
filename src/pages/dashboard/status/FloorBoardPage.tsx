import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { fmt, useStatusData } from "./StatusWidgets";
import type { AlertItem, FlowStage, InboundDashboard, OutboundDashboard, Tone } from "./statusTypes";
import "./floorBoard.css";

/* ============================================================
   대시보드 › 현장 전광판
   창고 벽에 걸어 두고 보는 화면. 입고 · 출고를 한 화면에, 멀리서 읽히게 큰 글자로.

   전광판이라 보통 화면과 규칙이 다르다.
   - 아무도 만지지 않는다 → 스크롤·필터·버튼 없이 30초마다 스스로 갱신하고, 긴 목록은 10초마다 다음 장
   - 멀리서 본다 → 글자 크기는 화면 크기에 따라(cqmin) 커진다. 1920 도 4K 도 같은 비율
   - 계속 켜 둔다 → 전체화면 버튼 + 화면 꺼짐 방지(Wake Lock)
   - 숫자를 믿고 일한다 → 갱신이 끊기면 붉게 알린다 (오래된 숫자를 조용히 보여주지 않는다)
   ============================================================ */

/** 갱신 주기 — 현황 화면(1분)보다 짧게 */
const REFRESH_MS = 30_000;
/** 목록 한 장을 보여 주는 시간 */
const PAGE_MS = 10_000;
/** 알림 한 건을 보여 주는 시간 */
const ALERT_MS = 6_000;
/** 한 줄이 이보다 얇아지면 멀리서 못 읽는다 — 목록 높이를 이 값으로 나눠 한 장에 넣을 줄 수를 정한다 */
const ROW_MIN_H = 44;
const ROWS_MIN = 3;
const ROWS_MAX = 8;

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 목록을 N줄씩 끊어 일정 시간마다 다음 장으로 넘긴다 */
const usePager = <T,>(items: T[], perPage: number) => {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / perPage));

  useEffect(() => {
    if (pages <= 1) {
      setPage(0);
      return;
    }
    const timer = window.setInterval(() => setPage((value) => (value + 1) % pages), PAGE_MS);
    return () => window.clearInterval(timer);
  }, [pages]);

  const current = Math.min(page, pages - 1);
  return { pages, page: current, slice: items.slice(current * perPage, current * perPage + perPage) };
};

/**
 * 목록 칸 높이를 재서 한 장에 몇 줄을 넣을지 정한다.
 * 가로 TV·세로 TV·노트북 창·분할 패널이 다 다르므로 화면 크기를 미리 나누지 않고 **자리를 잰다**.
 * 줄 수가 바뀌어도 목록 칸 높이는 그대로라(1fr) 다시 재는 일이 꼬리를 물지 않는다.
 */
const useRowsThatFit = (ref: React.RefObject<HTMLElement>) => {
  const [rows, setRows] = useState(ROWS_MIN);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const apply = () =>
      setRows(Math.max(ROWS_MIN, Math.min(ROWS_MAX, Math.floor(node.clientHeight / ROW_MIN_H) || ROWS_MIN)));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return rows;
};

/** 화면이 꺼지지 않게 — 전광판은 하루 종일 켜 둔다 (지원하지 않는 브라우저는 조용히 넘어간다) */
const useWakeLock = () => {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void>; released: boolean };
    const api = (navigator as Navigator & { wakeLock?: { request: (kind: "screen") => Promise<Sentinel> } }).wakeLock;
    if (!api) return;

    let lock: Sentinel | null = null;
    let dropped = false;
    const acquire = async () => {
      try {
        if (!dropped && document.visibilityState === "visible") lock = await api.request("screen");
      } catch {
        /* 사용자가 막았거나 배터리 절약 중 — 전광판은 보통 전원에 꽂혀 있다 */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
};

/** 1초마다 가는 시계 — 전광판을 보는 사람은 지금 몇 시인지부터 본다 */
const Clock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="fb-clock">
      {pad(now.getHours())}:{pad(now.getMinutes())}
      <small>{pad(now.getSeconds())}</small>
    </div>
  );
};

const Bar = ({ value, tone }: { value: number; tone: Tone }) => (
  <span className={`fb-bar sd-tone-${tone}`}>
    <i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
  </span>
);

const StageRow = ({ stages, doneKey }: { stages: FlowStage[]; doneKey: string }) => {
  // 병목 — 완료를 뺀 단계 중 가장 많이 쌓인 곳. 여기가 오늘 막힌 자리다
  const hot = stages
    .filter((stage) => stage.key !== doneKey && stage.count > 0)
    .sort((a, b) => b.count - a.count || b.qty - a.qty)[0];

  return (
    <ol className="fb-stages">
      {stages.map((stage) => (
        <li
          key={stage.key}
          className={`fb-stage sd-tone-${stage.tone}${stage.count ? " has-items" : ""}${hot && hot.key === stage.key ? " is-hot" : ""}`}
        >
          <b>{stage.count}</b>
          <span>{stage.label}</span>
          {hot && hot.key === stage.key ? <em>병목</em> : null}
        </li>
      ))}
    </ol>
  );
};

type SideProps = {
  kind: "in" | "out";
  title: string;
  eyebrow: string;
  icon: string;
  /** 오늘 전체 건수 · 끝난 건수 */
  total: number;
  done: number;
  /** 큰 글씨 옆 보조 숫자 (수량 등) */
  notes: Array<{ label: string; value: string }>;
  /** 붉게 띄울 문제 건수 (지연 · 거부) */
  flag: { label: string; count: number } | null;
  stages: FlowStage[];
  doneKey: string;
  rows: ReactNode[];
  emptyText: string;
};

const BoardSide = ({ kind, title, eyebrow, icon, total, done, notes, flag, stages, doneKey, rows, emptyText }: SideProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const perPage = useRowsThatFit(listRef);
  const { page, pages, slice } = usePager(rows, perPage);
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className={`fb-side is-${kind}`} aria-label={title}>
      <header className="fb-side-head">
        <span className="fb-side-ico" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <span className="fb-side-titles">
          <small>{eyebrow}</small>
          <h3>{title}</h3>
        </span>
        {flag && flag.count > 0 ? (
          <span className="fb-flag">
            {flag.label} <b>{flag.count}</b>
          </span>
        ) : null}
      </header>

      <div className="fb-score">
        <span className="fb-score-main">
          <b>{done}</b>
          <small>/ {total}건 완료</small>
        </span>
        <span className="fb-score-pct">{percent}%</span>
        <Bar value={percent} tone={kind === "in" ? "info" : "success"} />
        <ul className="fb-notes">
          {notes.map((note) => (
            <li key={note.label}>
              {note.label}
              <b>{note.value}</b>
            </li>
          ))}
        </ul>
      </div>

      <StageRow stages={stages} doneKey={doneKey} />

      <div className="fb-list" ref={listRef}>
        {rows.length === 0 ? (
          <p className="fb-empty">
            <Icon name="checkCircle" size={20} />
            {emptyText}
          </p>
        ) : (
          <>
            <ul style={{ "--fb-rows": perPage } as CSSProperties}>{slice}</ul>
            {pages > 1 ? (
              <div className="fb-pager">
                <span className="fb-pager-dots" aria-hidden="true">
                  {Array.from({ length: pages }, (_, index) => (
                    <i key={index} className={index === page ? "is-on" : undefined} />
                  ))}
                </span>
                {page + 1} / {pages}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 } as const;
const SEVERITY_LABEL = { danger: "긴급", warning: "주의", info: "안내" } as const;

/** 아래 알림 띠 — 긴급부터 한 건씩 돌려 보여 준다 (흘러가는 글씨는 멀리서 읽기 어렵다) */
const AlertTicker = ({ alerts }: { alerts: AlertItem[] }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (alerts.length <= 1) {
      setIndex(0);
      return;
    }
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % alerts.length), ALERT_MS);
    return () => window.clearInterval(timer);
  }, [alerts.length]);

  if (!alerts.length) {
    return (
      <footer className="fb-ticker is-clear">
        <Icon name="checkCircle" size={20} />
        지금 확인할 알림이 없습니다
      </footer>
    );
  }

  const current = alerts[Math.min(index, alerts.length - 1)];
  const danger = alerts.filter((alert) => alert.severity === "danger").length;
  const warning = alerts.filter((alert) => alert.severity === "warning").length;

  return (
    <footer className={`fb-ticker is-${current.severity}`}>
      <span className="fb-ticker-counts">
        {danger ? (
          <b className="is-danger">
            긴급 {danger}
          </b>
        ) : null}
        {warning ? (
          <b className="is-warning">
            주의 {warning}
          </b>
        ) : null}
        {!danger && !warning ? <b>안내 {alerts.length}</b> : null}
      </span>
      <span className="fb-ticker-body" key={current.id}>
        <em>{SEVERITY_LABEL[current.severity]}</em>
        <strong>{current.title}</strong>
        {current.message}
      </span>
      <span className="fb-ticker-page">
        {Math.min(index, alerts.length - 1) + 1} / {alerts.length}
      </span>
    </footer>
  );
};

export const FloorBoardPage = () => {
  const inbound = useStatusData<InboundDashboard>("/dashboard/inbound", REFRESH_MS);
  const outbound = useStatusData<OutboundDashboard>("/dashboard/outbound", REFRESH_MS);
  const rootRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useWakeLock();

  /**
   * 전광판 모드 — 좌측 메뉴·헤더·탭을 감추고 판이 창을 가득 채운다.
   * 전체화면 API 도 같이 요청하지만, 막혀 있는 환경(키오스크 브라우저·내장 뷰)이 있어
   * **화면을 채우는 일은 CSS 로** 하고 전체화면은 되면 좋은 것으로 둔다.
   */
  useEffect(() => {
    document.body.classList.toggle("wms-board-solo", full);
    return () => document.body.classList.remove("wms-board-solo");
  }, [full]);

  // 전체화면을 브라우저 쪽에서 빠져나가면(Esc·F11) 전광판 모드도 같이 끝낸다
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const toggleFull = useCallback(() => {
    setFull((on) => {
      if (on) {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        return false;
      }
      void rootRef.current?.requestFullscreen?.().catch(() => undefined);
      return true;
    });
  }, []);

  /* ---------------- 입고 ---------------- */
  const inData = inbound.data;
  const inSide = useMemo(() => {
    if (!inData) return null;
    const rows = inData.rows;
    const done = inData.stages.find((stage) => stage.key === "done")?.count ?? 0;
    const open = rows.filter((row) => row.stage !== "done");
    const late = open.filter((row) => row.overdue);
    // 문제(지연) 먼저, 그다음 많이 진행된 순. 진행 중인 게 없으면 오늘 끝난 것을 보여 준다
    const listed = open.length
      ? [...open].sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.progress - a.progress)
      : rows.slice(0, ROWS_MAX);
    return {
      total: rows.length,
      done,
      late: late.length,
      qty: inData.stages.reduce((sum, stage) => sum + stage.qty, 0),
      doneQty: inData.stages.find((stage) => stage.key === "done")?.qty ?? 0,
      stages: inData.stages,
      rows: listed.map((row) => (
        <li key={row.id} className={`fb-row${row.overdue ? " is-late" : ""}`}>
          <span className="fb-row-code">
            {row.inboundNo}
            <small>{row.supplierName}</small>
          </span>
          <span className={`fb-row-stage sd-tone-${row.tone}`}>{row.stageLabel}</span>
          <span className="fb-row-num">{fmt(row.qty)}</span>
          <span className="fb-row-bar">
            <Bar value={row.progress} tone={row.tone} />
          </span>
          {row.overdue ? <span className="fb-row-late">지연</span> : null}
        </li>
      ))
    };
  }, [inData]);

  /* ---------------- 출고 ---------------- */
  const outData = outbound.data;
  const outSide = useMemo(() => {
    if (!outData) return null;
    const rows = outData.rows.filter((row) => row.stage !== "거부");
    const done = rows.filter((row) => row.stage === "출고완료").length;
    const open = rows.filter((row) => row.stage !== "출고완료");
    const listed = open.length
      ? [...open].sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.progress - a.progress)
      : rows.slice(0, ROWS_MAX);
    return {
      total: rows.length,
      done,
      rejected: outData.rejected.count,
      qty: rows.reduce((sum, row) => sum + row.qty, 0),
      pickedQty: rows.reduce((sum, row) => sum + row.pickedQty, 0),
      stages: outData.stages,
      rows: listed.map((row) => (
        <li key={row.id} className={`fb-row${row.overdue ? " is-late" : ""}`}>
          <span className="fb-row-code">
            {row.outboundNo}
            <small>{row.customerName}</small>
          </span>
          <span className={`fb-row-stage sd-tone-${row.tone}`}>{row.stageLabel}</span>
          <span className="fb-row-num">{fmt(row.qty)}</span>
          <span className="fb-row-bar">
            <Bar value={row.progress} tone={row.progress >= 100 ? "success" : "info"} />
          </span>
          {row.dispatched ? <span className="fb-row-mark">배차</span> : null}
          {row.overdue ? <span className="fb-row-late">지연</span> : null}
        </li>
      ))
    };
  }, [outData]);

  const alerts = useMemo(
    () =>
      [...(inData?.alerts ?? []), ...(outData?.alerts ?? [])].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      ),
    [inData, outData]
  );

  const today = inData?.today ?? outData?.today ?? "";
  const dateText = today ? `${today.slice(5).replace("-", "월 ")}일 (${WEEKDAYS[new Date(today).getDay()]})` : "";
  const ts = inbound.ts || outbound.ts;
  const error = inbound.error ?? outbound.error;

  return (
    <div className={`fb${full ? " is-full" : ""}`} ref={rootRef}>
      <header className="fb-top">
        <span className="fb-brand">
          <Icon name="cube3d" size={24} />
          이천물류센터
          <small>{dateText}</small>
        </span>
        <Clock />
        <span className={`fb-live${error ? " is-error" : ""}`}>
          {error ? (
            <>
              <Icon name="alert" size={18} />
              갱신 끊김 — 마지막 {ts || "–"}
            </>
          ) : (
            <>
              <i />
              LIVE<small>{ts ? `기준 ${ts} · 30초마다` : "불러오는 중"}</small>
            </>
          )}
        </span>
        <button
          type="button"
          className="fb-fullbtn"
          onClick={toggleFull}
          title={full ? "전광판 모드 끄기 (Esc)" : "메뉴·헤더를 감추고 화면 가득 — 벽 TV 는 이 상태로 둡니다"}
        >
          <Icon name={full ? "minimize" : "maximize"} size={18} />
          {full ? "나가기 (Esc)" : "전광판 모드"}
        </button>
      </header>

      <div className="fb-body">
        {inSide ? (
          <BoardSide
            kind="in"
            eyebrow="INBOUND"
            title="입고"
            icon="inbox"
            total={inSide.total}
            done={inSide.done}
            flag={{ label: "지연", count: inSide.late }}
            notes={[
              { label: "예정 수량", value: fmt(inSide.qty) },
              { label: "입고 완료", value: fmt(inSide.doneQty) }
            ]}
            stages={inSide.stages}
            doneKey="done"
            rows={inSide.rows}
            emptyText="오늘 들어올 입고가 없습니다"
          />
        ) : (
          <section className="fb-side fb-loading">입고 현황을 불러오는 중…</section>
        )}

        {outSide ? (
          <BoardSide
            kind="out"
            eyebrow="OUTBOUND"
            title="출고"
            icon="truck"
            total={outSide.total}
            done={outSide.done}
            flag={{ label: "거부", count: outSide.rejected }}
            notes={[
              { label: "출고 수량", value: fmt(outSide.qty) },
              { label: "피킹 완료", value: fmt(outSide.pickedQty) }
            ]}
            stages={outSide.stages}
            doneKey="출고완료"
            rows={outSide.rows}
            emptyText="오늘 나갈 출고가 없습니다"
          />
        ) : (
          <section className="fb-side fb-loading">출고 현황을 불러오는 중…</section>
        )}
      </div>

      <AlertTicker alerts={alerts} />
    </div>
  );
};
