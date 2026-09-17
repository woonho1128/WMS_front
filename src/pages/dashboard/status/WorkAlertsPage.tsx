import { useMemo, useState } from "react";
import { AlertList, Panel, SEVERITY_LABEL, StatusShell, useStatusData } from "./StatusWidgets";
import type { AlertCategory, AlertSeverity, AlertsDashboard } from "./statusTypes";

/* ============================================================
   대시보드 › 작업 알림
   입고·출고·재고·반품·연동에서 지금 손봐야 할 일을 한곳에 — 긴급부터 보이고,
   버튼을 누르면 처리 화면으로 간다. 알림은 데이터에서 계산되므로 처리하면 사라진다
   ============================================================ */

const SEVERITIES: AlertSeverity[] = ["danger", "warning", "info"];
const CATEGORIES: AlertCategory[] = ["출고", "입고", "재고", "반품", "연동"];
const SEVERITY_DESC: Record<AlertSeverity, string> = {
  danger: "출고·입고가 막혔거나 곧 막힙니다",
  warning: "오늘 안에 처리하세요",
  info: "확인만 하면 됩니다"
};

export const WorkAlertsPage = () => {
  const { data, error, ts, reload } = useStatusData<AlertsDashboard>("/dashboard/alerts");
  const [severity, setSeverity] = useState<AlertSeverity | null>(null);
  const [category, setCategory] = useState<AlertCategory | null>(null);

  const alerts = data?.alerts ?? [];
  const filtered = useMemo(
    () => alerts.filter((alert) => (!severity || alert.severity === severity) && (!category || alert.category === category)),
    [alerts, severity, category]
  );
  const count = (predicate: (alert: (typeof alerts)[number]) => boolean) => alerts.filter(predicate).length;

  return (
    <StatusShell
      eyebrow="WORK ALERTS"
      title="작업 알림"
      desc="입고·출고·재고·반품·연동에서 지금 손봐야 할 일을 모았습니다. 긴급부터 보이고, 버튼을 누르면 처리 화면으로 갑니다."
      ts={ts}
      onReload={reload}
      error={error}
      loading={!data && !error}
    >
      {data ? (
        <>
          <div className="sd-sev-cards">
            <button type="button" className={`sd-sev-card sd-tone-gray${!severity ? " is-on" : ""}`} onClick={() => setSeverity(null)} aria-pressed={!severity}>
              <span>전체</span>
              <b>{alerts.length}</b>
              <small>처리하면 목록에서 사라집니다</small>
            </button>
            {SEVERITIES.map((item) => {
              const tone = item === "danger" ? "danger" : item === "warning" ? "warning" : "info";
              const on = severity === item;
              return (
                <button key={item} type="button" className={`sd-sev-card sd-tone-${tone}${on ? " is-on" : ""}`} onClick={() => setSeverity(on ? null : item)} aria-pressed={on}>
                  <span>{SEVERITY_LABEL[item]}</span>
                  <b>{count((alert) => alert.severity === item)}</b>
                  <small>{SEVERITY_DESC[item]}</small>
                </button>
              );
            })}
          </div>

          <Panel
            icon="bell"
            title="알림 목록"
            sub={`${filtered.length}건${severity ? ` · ${SEVERITY_LABEL[severity]}` : ""}${category ? ` · ${category}` : ""}`}
            aside={
              <div className="sd-cats" role="group" aria-label="분류">
                <button type="button" className={`sd-cat${!category ? " is-on" : ""}`} onClick={() => setCategory(null)} aria-pressed={!category}>
                  전체
                </button>
                {CATEGORIES.map((item) => {
                  const on = category === item;
                  const itemCount = count((alert) => alert.category === item && (!severity || alert.severity === severity));
                  return (
                    <button key={item} type="button" className={`sd-cat${on ? " is-on" : ""}`} onClick={() => setCategory(on ? null : item)} aria-pressed={on} disabled={!itemCount && !on}>
                      {item} <b>{itemCount}</b>
                    </button>
                  );
                })}
              </div>
            }
          >
            <AlertList alerts={filtered} empty={alerts.length ? "조건에 맞는 알림이 없습니다" : "지금 손봐야 할 일이 없습니다"} />
          </Panel>
        </>
      ) : null}
    </StatusShell>
  );
};
