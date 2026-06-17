import { DashboardCard } from "./components/DashboardCard";
import { DashboardTabs } from "./components/DashboardTabs";
import { monitoringAlerts, monitoringKpis } from "./data/monitoringData";
import "./DashboardMonitoring.css";

export const DashboardMonitoring = () => {
  return (
    <section className="mon-dashboard">
      <div className="mon-kpi-grid">
        {monitoringKpis.map(([label, value]) => (
          <article key={label} className="app-surface mon-kpi-card">
            <h3>{label}</h3>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="mon-main-grid">
        <DashboardCard className="mon-map-panel">
          <DashboardTabs
            tabs={["창고 레이아웃", "AGV 모니터링", "작업 현황", "알람 현황"]}
            className="mon-tabs"
            defaultActiveIndex={0}
          />
          <div className="mon-map-placeholder">
            <div>실시간 레이아웃 모니터 맵</div>
          </div>
          <div className="mon-legend">
            <span>AGV</span><span>지게차</span><span>작업자</span><span>입고 도크</span><span>출고 도크</span>
          </div>
        </DashboardCard>

        <aside className="mon-side">
          <DashboardCard className="mon-side-card" title="창고별 적재율">
            <ul>
              <li><span>CARE 창고</span><b>72%</b></li>
              <li><span>BK 창고</span><b>58%</b></li>
              <li><span>바스 창고</span><b>65%</b></li>
              <li><span>AS 창고</span><b>81%</b></li>
            </ul>
          </DashboardCard>
          <DashboardCard className="mon-side-card" title="AGV 현황">
            <div className="mini-donut"><span>24대</span></div>
          </DashboardCard>
          <DashboardCard className="mon-side-card mon-alert-card" title="실시간 알람">
            <ul>
              {monitoringAlerts.map(([level, text, time]) => (
                <li key={text}><em>{level}</em><span>{text}</span><b>{time}</b></li>
              ))}
            </ul>
          </DashboardCard>
        </aside>
      </div>

      <div className="mon-bottom-grid">
        <DashboardCard className="card" title="작업 진행 현황" />
        <DashboardCard className="card" title="시간대별 작업 추이" />
        <DashboardCard className="card" title="온도 / 습도 상태" />
        <DashboardCard className="card" title="도크 상태" />
      </div>
    </section>
  );
};
