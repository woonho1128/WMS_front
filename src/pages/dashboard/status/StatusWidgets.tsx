import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { apiGet } from "../../../services/http";
import type { AlertCategory, AlertItem, BreakdownRow, FlowStage, Hourly, Kpi, KpiTrend, Tone } from "./statusTypes";
import "./statusDashboard.css";

/* ============================================================
   대시보드 현황 공용 위젯 — 입고 · 출고 · 재고 현황 · 작업 알림
   과장님 목업에서 가져온 것: 추세가 붙은 KPI · 단계 흐름 · 진행률 표 · 시간별 처리량 · 실시간 알림
   ============================================================ */

const REFRESH_MS = 60_000;
const pad = (value: number) => String(value).padStart(2, "0");

export const fmt = (value: number, digits = 0) =>
  value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 현황 데이터 — 화면이 보이는 동안 1분마다 다시 읽는다 */
export const useStatusData = <T,>(path: string) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiGet<T>(path);
      setData(res);
      setError(null);
      const now = new Date();
      setTs(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    }
  }, [path]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return { data, error, ts, reload: load };
};

/* ---------------- 화면 틀 ---------------- */

export const StatusShell = ({
  eyebrow,
  title,
  desc,
  ts,
  onReload,
  error,
  loading,
  children
}: {
  eyebrow: string;
  title: string;
  desc: string;
  ts: string;
  onReload: () => void;
  error: string | null;
  loading: boolean;
  children: ReactNode;
}) => (
  <section className="sd-page">
    <header className="sd-head">
      <div className="sd-head-text">
        <span className="nx-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div className="sd-head-tools">
        <span className="nx-live">LIVE</span>
        {ts ? <span className="sd-ts">기준 {ts} · 1분마다 갱신</span> : null}
        <button type="button" className="nx-iconbtn" onClick={onReload} title="새로고침" aria-label="새로고침">
          <Icon name="refresh" size={15} />
        </button>
      </div>
    </header>
    {error ? (
      <div className="ds-callout danger">
        <Icon name="alert" size={18} />
        <span>불러오기 실패: {error}</span>
      </div>
    ) : null}
    {loading ? <div className="card sd-loading">현황을 불러오는 중…</div> : children}
  </section>
);

export const Panel = ({
  icon,
  title,
  sub,
  aside,
  className,
  children
}: {
  icon?: string;
  title: string;
  sub?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <section className={`card sd-panel${className ? ` ${className}` : ""}`}>
    <header className="sd-panel-head">
      <div className="sd-panel-title">
        {icon ? (
          <span className="sd-panel-ico" aria-hidden="true">
            <Icon name={icon} size={15} />
          </span>
        ) : null}
        <span className="sd-panel-titles">
          <span className="nx-sect-title">{title}</span>
          {sub ? <span className="nx-sect-sub">{sub}</span> : null}
        </span>
      </div>
      {aside ? <div className="sd-panel-aside">{aside}</div> : null}
    </header>
    {children}
  </section>
);

export const LinkButton = ({ label, to }: { label: string; to: string }) => {
  const navigate = useNavigate();
  return (
    <button type="button" className="sd-link" onClick={() => navigate(to)}>
      {label}
      <Icon name="chevR" size={13} />
    </button>
  );
};

export const StageChip = ({ label, tone, title }: { label: string; tone: Tone; title?: string }) => (
  <span className={`sd-chip sd-tone-${tone}`} title={title}>
    {label}
  </span>
);

/* ---------------- KPI ---------------- */

const MiniTrend = ({ trend }: { trend: KpiTrend }) => {
  const gradientId = `sd-trend-${useId().replace(/:/g, "")}`;
  const values = trend.values.length ? trend.values : [0];
  const width = 100;
  const height = 30;

  if (trend.kind === "bars") {
    const max = Math.max(...values, 1);
    const gap = 3;
    const barWidth = (width - gap * (values.length - 1)) / values.length;
    return (
      <svg className="sd-trend" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {values.map((value, index) => {
          const barHeight = Math.max((value / max) * (height - 2), 1.5);
          return (
            <rect
              key={index}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={1.2}
              className={index === values.length - 1 ? "is-today" : undefined}
            />
          );
        })}
      </svg>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    values.length === 1 ? width : (index / (values.length - 1)) * width,
    height - 3 - ((value - min) / span) * (height - 8)
  ]);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  return (
    <svg className="sd-trend" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle className="is-today" cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.4} />
    </svg>
  );
};

export const KpiCard = ({ kpi }: { kpi: Kpi }) => {
  const navigate = useNavigate();
  const delta = kpi.delta;
  const deltaClass = !delta || delta.value === 0 || delta.good === null ? "is-flat" : delta.good ? "is-good" : "is-bad";
  const body = (
    <>
      <span className="sd-kpi-top">
        <span className="sd-kpi-label">{kpi.label}</span>
        {kpi.badge ? <span className={`ds-badge ${kpi.badge.tone}`}>{kpi.badge.text}</span> : null}
      </span>
      <span className="sd-kpi-value">
        {fmt(kpi.value, kpi.digits ?? 0)}
        {kpi.unit ? <small>{kpi.unit}</small> : null}
      </span>
      {kpi.sub ? <span className="sd-kpi-sub">{kpi.sub}</span> : null}
      <span className="sd-kpi-foot">
        {delta ? (
          <em className={`sd-delta ${deltaClass}`}>
            {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "—"} {delta.value ? `${fmt(Math.abs(delta.value), delta.digits ?? 0)}${delta.unit}` : "변화 없음"}
            <small>{delta.basis}</small>
          </em>
        ) : (
          <span />
        )}
        {kpi.trend ? <MiniTrend trend={kpi.trend} /> : null}
      </span>
    </>
  );
  if (!kpi.to) {
    return (
      <div className={`sd-kpi sd-tone-${kpi.tone}`} title={kpi.hint}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={`sd-kpi sd-tone-${kpi.tone} is-link`} title={kpi.hint} onClick={() => navigate(kpi.to!)}>
      {body}
    </button>
  );
};

/* ---------------- 단계 흐름 ---------------- */

/** 병목 — 마지막(완료) 단계를 빼고 가장 많이 쌓인 단계. 건수가 같으면 수량이 많은 쪽 */
const hotStageOf = (stages: FlowStage[]) => {
  const peak = stages
    .slice(0, -1)
    .filter((stage) => stage.count > 0)
    .sort((a, b) => b.count - a.count || b.qty - a.qty)[0];
  return peak?.key ?? null;
};

export const FlowStepper = ({
  stages,
  selected,
  onSelect,
  unit = "건",
  side
}: {
  stages: FlowStage[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  unit?: string;
  side?: ReactNode;
}) => {
  const hot = hotStageOf(stages);
  return (
    <div className="sd-flow-wrap">
      <ol className="sd-flow">
        {stages.map((stage) => {
          const on = selected === stage.key;
          return (
            <li key={stage.key} className={`sd-flow-step sd-tone-${stage.tone}${stage.count ? " has-items" : ""}${on ? " is-on" : ""}`}>
              <button
                type="button"
                onClick={() => onSelect(on ? null : stage.key)}
                aria-pressed={on}
                title={`${stage.label} ${stage.count}${unit} · 수량 ${fmt(stage.qty)} — 누르면 아래 표를 이 단계로 거릅니다`}
              >
                {hot === stage.key ? <em className="sd-flow-hot">병목</em> : null}
                <span className="sd-flow-dot">{stage.count}</span>
                <span className="sd-flow-label">{stage.label}</span>
                <small className="sd-flow-hint">{stage.hint}</small>
              </button>
            </li>
          );
        })}
      </ol>
      {side ? <div className="sd-flow-side">{side}</div> : null}
    </div>
  );
};

export const ProgressCell = ({ value, tone, note }: { value: number; tone: Tone; note?: string }) => (
  <span className={`sd-progress sd-tone-${tone}`}>
    <span className="sd-progress-bar">
      <i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </span>
    <b>{Math.round(value)}%</b>
    {note ? <small>{note}</small> : null}
  </span>
);

/* ---------------- 막대 차트 ---------------- */

type ColumnPoint = { key: string; label: string; values: number[]; tone?: Tone; note?: string };

export const ColumnChart = ({
  series,
  points,
  highlightKey,
  height = 140,
  unit = ""
}: {
  series: Array<{ key: string; label: string; tone: Tone }>;
  points: ColumnPoint[];
  highlightKey?: string | null;
  height?: number;
  unit?: string;
}) => {
  const totals = points.map((point) => point.values.reduce((acc, value) => acc + value, 0));
  const max = Math.max(1, ...totals);
  return (
    <div className="sd-columns">
      <div className="sd-columns-grid" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point, index) => (
          <div
            key={point.key}
            className={`sd-col${point.key === highlightKey ? " is-now" : ""}`}
            title={[point.label, ...series.map((item, k) => `${item.label} ${fmt(point.values[k] ?? 0)}${unit}`)].join("\n")}
          >
            <span className="sd-col-track" style={{ height }}>
              {point.values.map((value, k) =>
                value > 0 ? (
                  <i key={k} className={`sd-tone-${series.length === 1 && point.tone ? point.tone : series[k]?.tone ?? "info"}`} style={{ height: `${(value / max) * 100}%` }} />
                ) : null
              )}
            </span>
            <span className="sd-col-label">{point.label}</span>
            <b className="sd-col-value">{totals[index] ? fmt(totals[index]) : "–"}</b>
            {point.note ? <small className="sd-col-note">{point.note}</small> : null}
          </div>
        ))}
      </div>
      {series.length > 1 ? (
        <div className="sd-legend">
          {series.map((item) => (
            <span key={item.key} className={`sd-tone-${item.tone}`}>
              <i />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const HourlyChart = ({ hourly }: { hourly: Hourly }) => {
  const nowHour = new Date().getHours();
  return (
    <ColumnChart
      series={hourly.series}
      unit={hourly.unit}
      highlightKey={String(nowHour)}
      points={hourly.points.map((point) => ({ key: String(point.hour), label: `${pad(point.hour)}시`, values: point.values }))}
    />
  );
};

/* ---------------- 구성 · 비중 ---------------- */

export const Breakdown = ({ rows, unit = "건", empty = "해당 건이 없습니다" }: { rows: BreakdownRow[]; unit?: string; empty?: string }) => {
  if (!rows.length) return <div className="sd-empty">{empty}</div>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="sd-breakdown">
      {rows.map((row) => (
        <li key={row.key} className={`sd-tone-${row.tone}`}>
          <span className="sd-breakdown-label">
            <i />
            {row.label}
          </span>
          <b>
            {fmt(row.count)}
            <small>{unit}</small>
          </b>
          <span className="sd-breakdown-bar">
            <i style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <small className="sd-breakdown-qty">수량 {fmt(row.qty)}</small>
        </li>
      ))}
    </ul>
  );
};

export const StackBar = ({ parts }: { parts: Array<{ key: string; label: string; qty: number; tone: Tone }> }) => {
  const total = parts.reduce((acc, part) => acc + part.qty, 0);
  return (
    <div className="sd-stack">
      <div className="sd-stack-bar" role="img" aria-label={parts.map((part) => `${part.label} ${fmt(part.qty)}`).join(", ")}>
        {parts.map((part) =>
          part.qty > 0 ? (
            <i key={part.key} className={`sd-tone-${part.tone}`} style={{ width: `${(part.qty / (total || 1)) * 100}%` }} title={`${part.label} ${fmt(part.qty)}`} />
          ) : null
        )}
      </div>
      <ul className="sd-stack-legend">
        {parts.map((part) => (
          <li key={part.key} className={`sd-tone-${part.tone}`}>
            <i />
            <span>{part.label}</span>
            <b>
              {fmt(part.qty)}
              <small>{total ? Math.round((part.qty / total) * 1000) / 10 : 0}%</small>
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ---------------- 알림 ---------------- */

const CATEGORY_ICON: Record<AlertCategory, string> = { 재고: "boxes", 입고: "inbox", 출고: "truck", 반품: "swap", 연동: "plug" };
export const SEVERITY_LABEL: Record<AlertItem["severity"], string> = { danger: "긴급", warning: "주의", info: "안내" };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 메시지 안 코드(입고번호 · 로케이션 · LOT …)를 강조한다 */
const Highlight = ({ text, refs }: { text: string; refs: string[] }) => {
  const tokens = Array.from(new Set(refs.filter(Boolean))).sort((a, b) => b.length - a.length);
  if (!tokens.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "g"));
  return (
    <>
      {parts.map((part, index) =>
        tokens.includes(part) ? (
          <em key={index} className="sd-ref">
            {part}
          </em>
        ) : (
          part
        )
      )}
    </>
  );
};

export const AlertList = ({ alerts, empty, limit }: { alerts: AlertItem[]; empty: string; limit?: number }) => {
  const navigate = useNavigate();
  if (!alerts.length) {
    return (
      <div className="sd-alerts-box">
        <div className="sd-empty">
          <Icon name="checkCircle" size={18} />
          <span>{empty}</span>
        </div>
      </div>
    );
  }
  const shown = limit ? alerts.slice(0, limit) : alerts;
  return (
    <div className="sd-alerts-box">
      <ul className="sd-alerts">
        {shown.map((alert) => (
          <li key={alert.id} className={`sd-alert is-${alert.severity}`}>
            <span className="sd-alert-ico" aria-hidden="true">
              <Icon name={CATEGORY_ICON[alert.category]} size={15} />
            </span>
            <div className="sd-alert-body">
              <p>
                <b>{alert.title}</b> — <Highlight text={alert.message} refs={alert.refs} />
              </p>
              <small>
                <span className="sd-alert-sev">{SEVERITY_LABEL[alert.severity]}</span> · {alert.category}
                {alert.at ? ` · ${alert.at}` : ""}
              </small>
            </div>
            {alert.action ? (
              <button type="button" className="sd-alert-go" onClick={() => navigate(alert.action!.to)}>
                {alert.action.label}
                <Icon name="chevR" size={13} />
              </button>
            ) : null}
          </li>
        ))}
        {limit && alerts.length > limit ? <li className="sd-alert-more">외 {alerts.length - limit}건 — 작업 알림에서 모두 봅니다</li> : null}
      </ul>
    </div>
  );
};
