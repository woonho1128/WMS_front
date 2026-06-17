import { DashboardCard } from "./components/DashboardCard";
import { operationsAlerts, operationsKpiCards, operationsTopSku } from "./data/operationsData";
import "./DashboardOperations.css";

export const DashboardOperations = () => {
  return (
    <section className="ops-dashboard">
      <header className="ops-head app-surface">
        <div>
          <h2>대시보드</h2>
          <p>창고 운영 현황을 한눈에 확인하세요.</p>
        </div>
        <div className="ops-head-right">
          <label className="ops-switch">
            <span>자동 새로고침</span>
            <input type="checkbox" defaultChecked />
          </label>
          <select>
            <option>30초</option>
            <option>1분</option>
          </select>
          <button type="button">편집</button>
        </div>
      </header>

      <div className="ops-kpi-grid">
        {operationsKpiCards.map((kpi) => (
          <article key={kpi.title} className="app-surface kpi-card">
            <h3>{kpi.title}</h3>
            <strong>{kpi.value}</strong>
            <p>{kpi.sub}</p>
            <span>{kpi.delta}</span>
          </article>
        ))}
        <article className="app-surface kpi-card kpi-alert">
          <h3>알림 / 예외</h3>
          <strong>12</strong>
          <p>미처리 알림</p>
        </article>
      </div>

      <div className="ops-main-grid">
        <DashboardCard className="ops-map-card" title="창고별 재고 현황">
          <div className="zone-mini-grid">
            <div className="zone zone-care">CARE 창고<br />적재율 72%</div>
            <div className="zone zone-bk">BK 창고<br />적재율 58%</div>
            <div className="zone zone-bus">바스 창고<br />적재율 65%</div>
            <div className="zone zone-as">AS 창고<br />적재율 81%</div>
          </div>
        </DashboardCard>

        <DashboardCard className="ops-donut-card" title="작업 현황">
          <div className="donut-wrap">
            <div className="donut"><span>128건</span></div>
            <ul>
              <li>입고 진행중 32건</li>
              <li>출고 진행중 45건</li>
              <li>피킹 진행중 28건</li>
              <li>이동 진행중 14건</li>
              <li>기타 9건</li>
            </ul>
          </div>
        </DashboardCard>
      </div>

      <div className="ops-bottom-grid">
        <DashboardCard className="card" title="시간대별 출고 현황">
          <div className="line-placeholder">00시 ~ 24시 출고 추이 그래프</div>
        </DashboardCard>

        <DashboardCard className="card" title="최근 알림">
          <ul className="alert-list">
            {operationsAlerts.map((a) => (
              <li key={a.text}><span>{a.text}</span><em>{a.time}</em></li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard className="card" title="Top 5 SKU (재고 수량 기준)">
          <ol className="sku-list">
            {operationsTopSku.map(([name, qty]) => (
              <li key={name}><span>{name}</span><b>{qty}</b></li>
            ))}
          </ol>
        </DashboardCard>

        <DashboardCard className="card" title="설비 / 자원 상태">
          <ul className="resource-list">
            <li><span>지게차</span><b>18 / 24</b></li>
            <li><span>AGV</span><b>35 / 40</b></li>
            <li><span>작업자</span><b>42 / 50</b></li>
            <li><span>도크</span><b>12 / 16</b></li>
          </ul>
        </DashboardCard>
      </div>
    </section>
  );
};
