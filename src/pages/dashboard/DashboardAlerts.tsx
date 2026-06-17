import { DashboardCard } from "./components/DashboardCard";
import { DashboardFilterBar } from "./components/DashboardFilterBar";
import { DashboardTabs } from "./components/DashboardTabs";
import { alertsRows, alertsTabs } from "./data/alertsData";
import "./DashboardAlerts.css";
import { useState } from "react";

export const DashboardAlerts = () => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  return (
    <section className="alerts-page">
      <header className="alerts-top app-surface">
        <DashboardTabs tabs={alertsTabs} className="tabs" activeIndex={activeTabIndex} onChange={(index) => setActiveTabIndex(index)} />
        <div className="actions">
          <button>알림 설정</button>
          <button>새로고침</button>
          <span>실시간</span>
        </div>
      </header>

      <div className="alerts-grid">
        <section className="app-surface left">
          <DashboardFilterBar className="filters">
            <select><option>전체 창고</option></select>
            <select><option>전체 유형</option></select>
            <input value="2024-05-20 ~ 2024-05-20" readOnly />
            <input placeholder="알림 제목, 내용 검색" />
            <button>필터</button>
          </DashboardFilterBar>
          <table className="alerts-table">
            <thead>
              <tr><th>우선순위</th><th>알림 제목</th><th>발생 위치</th><th>발생 시간</th><th>상태</th></tr>
            </thead>
            <tbody>
              {alertsRows.map((r) => (
                <tr key={`${r[1]}-${r[3]}`}>
                  <td><span className={`pill ${r[0]}`}>{r[0]}</span></td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td><span className={r[4] === "미확인" ? "red" : "green"}>{r[4]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="right">
          <DashboardCard className="card" title="알림 요약">
            <div className="summary">
              <div><b>12</b><span>전체</span></div>
              <div><b>2</b><span>경고</span></div>
              <div><b>6</b><span>주의</span></div>
              <div><b>4</b><span>정보</span></div>
            </div>
          </DashboardCard>
          <DashboardCard className="card" title="시간대별 알림 발생 추이">
            <div className="chart">차트 영역</div>
          </DashboardCard>
          <DashboardCard className="card" title="최근 해결 알림">
            <ul className="resolved">
              <li><span>입고 작업 완료</span><b>10:25</b></li>
              <li><span>AGV 충전 완료</span><b>10:20</b></li>
              <li><span>온도 정상 복귀</span><b>10:15</b></li>
              <li><span>출고 작업 완료</span><b>10:10</b></li>
            </ul>
          </DashboardCard>
        </aside>
      </div>
    </section>
  );
};
