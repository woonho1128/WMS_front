import { useNavigate } from "react-router-dom";
import { AlertList, ColumnChart, KpiCard, LinkButton, Panel, StackBar, StatusShell, fmt, useStatusData } from "./StatusWidgets";
import type { StockDashboard } from "./statusTypes";

/* ============================================================
   대시보드 › 재고 현황
   재고가 얼마나 있고(구성·창고별), 믿을 만한지(실사 정확도·ERP 일치율),
   오래됐거나 모자랄 재고는 없는지(연령·쇼트 위험)를 한 화면에서 본다
   ============================================================ */

export const StockStatusPage = () => {
  const navigate = useNavigate();
  const { data, error, ts, reload } = useStatusData<StockDashboard>("/dashboard/stock");

  return (
    <StatusShell
      eyebrow="STOCK STATUS"
      title="재고 현황"
      desc="재고 구성과 창고별 분포, 실사·ERP 기준 정확도, 오래되거나 모자랄 재고를 봅니다."
      ts={ts}
      onReload={reload}
      error={error}
      loading={!data && !error}
    >
      {data ? (
        <>
          <div className="sd-kpis">
            {data.kpis.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} />
            ))}
          </div>

          <div className="sd-grid">
            <Panel icon="boxes" title="재고 구성" sub="상태별 수량 · 창고별 분포" aside={<LinkButton label="실시간 재고" to="/stock/stock-realtime" />}>
              <StackBar parts={data.composition} />
              <div className="sd-table-wrap">
                <table className="data-table sd-table">
                  <thead>
                    <tr>
                      <th>창고</th>
                      <th className="num">총 재고</th>
                      <th className="num">가용</th>
                      <th className="num">출고 할당</th>
                      <th className="num">격납 대기</th>
                      <th className="num">불량</th>
                      <th className="num">품목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.warehouses.map((row) => (
                      <tr key={row.name} onClick={() => navigate("/stock/stock-realtime")}>
                        <td>
                          <b className="sd-strong">{row.name}</b>
                          {row.type === "외주" ? <span className="ds-badge consign sd-inline-badge">외주</span> : null}
                        </td>
                        <td className="num">{fmt(row.total)}</td>
                        <td className="num">{fmt(row.available)}</td>
                        <td className="num">{row.allocated ? fmt(row.allocated) : "–"}</td>
                        <td className={`num${row.putaway ? " sd-tone-text-violet" : ""}`}>{row.putaway ? fmt(row.putaway) : "–"}</td>
                        <td className={`num${row.defect ? " sd-tone-text-danger" : ""}`}>{row.defect ? fmt(row.defect) : "–"}</td>
                        <td className="num">{row.skus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel icon="alert" title="재고 알림" sub={`${data.alerts.length}건`} aside={<LinkButton label="작업 알림" to="/dashboard/work-alerts" />}>
              <AlertList alerts={data.alerts} empty="지금 확인할 재고 알림이 없습니다" limit={6} />
            </Panel>

            <Panel icon="clock" title="재고 연령" sub="입고일 기준 수량 · 막대에 올리면 LOT 수" aside={<LinkButton label="장기재고" to="/analytics/aging-stock" />}>
              <ColumnChart
                series={[{ key: "qty", label: "수량", tone: "info" }]}
                height={120}
                points={data.aging.map((bucket) => ({
                  key: bucket.key,
                  label: bucket.label,
                  values: [bucket.qty],
                  tone: bucket.tone,
                  note: `${fmt(bucket.lots)} LOT`
                }))}
              />
            </Panel>

            <Panel icon="alert" title="쇼트 위험 품목" sub="가용 ÷ 안전재고 · 남은 일수 짧은 순" aside={<LinkButton label="쇼트 관리" to="/analytics/shortage" />}>
              {data.risks.length ? (
                <ul className="sd-risks">
                  {data.risks.map((row) => {
                    const cover = row.safetyStock ? Math.round((row.available / row.safetyStock) * 100) : 100;
                    const danger = row.risk === "위험";
                    return (
                      <li key={row.itemCode} className={`sd-risk sd-tone-${danger ? "danger" : "warning"}`} onClick={() => navigate("/analytics/shortage")}>
                        <span className="sd-risk-top">
                          <b>{row.itemName}</b>
                          <span className={`ds-badge ${danger ? "danger" : "warning"}`}>{row.risk}</span>
                        </span>
                        <span className="sd-risk-bar" title={`가용 ${fmt(row.available)} / 안전재고 ${fmt(row.safetyStock)}`}>
                          <i style={{ width: `${Math.min(cover, 100)}%` }} />
                        </span>
                        <small>
                          <span className="sd-code">{row.itemCode}</span> · 가용 {fmt(row.available)} / 안전 {fmt(row.safetyStock)} {row.unit} · {row.daysOfStock}일분
                          {row.shortageEta ? ` · 쇼트 예상 ${row.shortageEta.slice(5)}` : ""}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="sd-empty">쇼트 위험 품목이 없습니다</div>
              )}
            </Panel>
          </div>
        </>
      ) : null}
    </StatusShell>
  );
};
