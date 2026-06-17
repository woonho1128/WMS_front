import { DashboardCard } from "../dashboard/components/DashboardCard";
import "./IoAnalysisPage.css";

const kpiCards = [
  {
    title: "총 입고량",
    value: "8,460",
    unit: "BOX",
    helper: "전주 대비 +8.2%",
    tone: "inbound"
  },
  {
    title: "총 출고량",
    value: "7,980",
    unit: "BOX",
    helper: "전주 대비 +5.6%",
    tone: "outbound"
  },
  {
    title: "입출고 균형",
    value: "94.3",
    unit: "%",
    helper: "목표 범위 유지",
    tone: "balance"
  },
  {
    title: "지연 위험",
    value: "12",
    unit: "건",
    helper: "마감 2시간 이내",
    tone: "risk"
  }
] as const;

const dailyFlow = [
  { day: "05.16", inbound: 980, outbound: 840, delta: "+140" },
  { day: "05.17", inbound: 1120, outbound: 1040, delta: "+80" },
  { day: "05.18", inbound: 890, outbound: 960, delta: "-70" },
  { day: "05.19", inbound: 1340, outbound: 1210, delta: "+130" },
  { day: "05.20", inbound: 1460, outbound: 1380, delta: "+80" },
  { day: "05.21", inbound: 1280, outbound: 1320, delta: "-40" },
  { day: "05.22", inbound: 1390, outbound: 1230, delta: "+160" }
] as const;

const stageFlows = [
  { name: "입고 예정", count: "148건", rate: 72, status: "정상" },
  { name: "입고 검수", count: "36건", rate: 58, status: "주의" },
  { name: "피킹 진행", count: "52건", rate: 66, status: "정상" },
  { name: "출고 상차", count: "28건", rate: 81, status: "정상" }
] as const;

const centerRows = [
  ["중앙물류센터", "3,240", "3,080", "95.1%", "+6.4%", "안정"],
  ["남부물류센터", "1,920", "1,760", "91.7%", "+3.2%", "안정"],
  ["수도권허브", "2,180", "2,360", "108.3%", "-1.8%", "출고 초과"],
  ["부품전용센터", "1,120", "780", "69.6%", "+12.5%", "입고 집중"]
] as const;

const skuRows = [
  ["SKU-DET-001", "프리미엄 세탁세제 2.5L", "1,240", "1,080", "+160"],
  ["SKU-TOW-099", "극세사 다용도 타월", "860", "910", "-50"],
  ["SKU-BOX-002", "포장용 골판지 상자", "1,520", "1,430", "+90"],
  ["SKU-TAP-001", "OPP 포장용 테이프", "780", "740", "+40"]
] as const;

const insights = [
  {
    title: "14시 이후 출고 피크",
    text: "수도권허브의 피킹 대기량이 평시 대비 18% 높습니다.",
    tone: "warning"
  },
  {
    title: "검수 병목 완화",
    text: "중앙물류센터 입고 검수 완료율이 전일 대비 9.1% 개선되었습니다.",
    tone: "success"
  },
  {
    title: "입고 초과 품목",
    text: "포장재 SKU는 입고가 출고보다 6.3% 많아 적재 공간 확인이 필요합니다.",
    tone: "info"
  }
] as const;

const maxDailyVolume = Math.max(...dailyFlow.flatMap((item) => [item.inbound, item.outbound]));

export const IoAnalysisPage = () => {
  return (
    <section className="io-page">
      <header className="io-head app-surface">
        <div>
          <h2>입출고 분석</h2>
          <p>센터별 입고와 출고 흐름, 처리 균형, 지연 위험을 함께 확인합니다.</p>
        </div>
        <div className="io-head-actions">
          <button type="button" className="io-btn secondary">리포트 출력</button>
          <button type="button" className="io-btn primary">데이터 새로고침</button>
        </div>
      </header>

      <DashboardCard className="io-filter-card" title="분석 조건">
        <div className="io-filter-grid">
          <label>
            <span>기간</span>
            <select defaultValue="7days">
              <option value="today">오늘</option>
              <option value="7days">최근 7일</option>
              <option value="month">이번 달</option>
            </select>
          </label>
          <label>
            <span>센터</span>
            <select defaultValue="all">
              <option value="all">전체 센터</option>
              <option value="central">중앙물류센터</option>
              <option value="south">남부물류센터</option>
              <option value="hub">수도권허브</option>
            </select>
          </label>
          <label>
            <span>입출고 유형</span>
            <select defaultValue="all">
              <option value="all">전체 유형</option>
              <option value="normal">일반</option>
              <option value="urgent">긴급</option>
              <option value="return">반품/보류</option>
            </select>
          </label>
          <label className="io-search-field">
            <span>검색어</span>
            <input placeholder="SKU / 거래처 / 오더번호" />
          </label>
          <button type="button" className="io-btn secondary">조회</button>
        </div>
      </DashboardCard>

      <section className="io-kpi-grid" aria-label="입출고 핵심 지표">
        {kpiCards.map((kpi) => (
          <article key={kpi.title} className={`app-surface io-kpi-card ${kpi.tone}`}>
            <span>{kpi.title}</span>
            <strong>
              {kpi.value}
              <small>{kpi.unit}</small>
            </strong>
            <p>{kpi.helper}</p>
          </article>
        ))}
      </section>

      <div className="io-main-grid">
        <DashboardCard
          className="io-trend-card"
          title="일별 입출고 추이"
          action={
            <div className="io-chart-legend" aria-label="차트 범례">
              <span><i className="inbound" />입고</span>
              <span><i className="outbound" />출고</span>
            </div>
          }
        >
          <div className="io-trend-list">
            {dailyFlow.map((item) => (
              <div key={item.day} className="io-trend-row">
                <span className="io-trend-day">{item.day}</span>
                <div className="io-trend-bars">
                  <div className="io-bar-line">
                    <span className="io-bar-label">입고</span>
                    <div className="io-bar-track">
                      <span
                        className="io-bar inbound"
                        style={{ width: `${Math.round((item.inbound / maxDailyVolume) * 100)}%` }}
                      />
                    </div>
                    <b>{item.inbound.toLocaleString()}</b>
                  </div>
                  <div className="io-bar-line">
                    <span className="io-bar-label">출고</span>
                    <div className="io-bar-track">
                      <span
                        className="io-bar outbound"
                        style={{ width: `${Math.round((item.outbound / maxDailyVolume) * 100)}%` }}
                      />
                    </div>
                    <b>{item.outbound.toLocaleString()}</b>
                  </div>
                </div>
                <em className={item.delta.startsWith("-") ? "negative" : "positive"}>{item.delta}</em>
              </div>
            ))}
          </div>
        </DashboardCard>

        <div className="io-side-stack">
          <DashboardCard className="io-flow-card" title="처리 단계 현황">
            <ul className="io-stage-list">
              {stageFlows.map((stage) => (
                <li key={stage.name}>
                  <div className="io-stage-head">
                    <strong>{stage.name}</strong>
                    <span className={stage.status === "주의" ? "warning" : "normal"}>{stage.status}</span>
                  </div>
                  <div className="io-stage-meta">
                    <b>{stage.count}</b>
                    <em>{stage.rate}% 처리</em>
                  </div>
                  <div className="io-stage-track">
                    <span style={{ width: `${stage.rate}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </DashboardCard>

          <DashboardCard className="io-mix-card" title="유형별 구성">
            <div className="io-donut-row">
              <div className="io-donut" aria-label="입출고 유형별 구성">
                <span>100%</span>
              </div>
              <ul>
                <li><i className="normal" />일반 54%</li>
                <li><i className="urgent" />긴급 18%</li>
                <li><i className="return" />반품 16%</li>
                <li><i className="etc" />기타 12%</li>
              </ul>
            </div>
          </DashboardCard>
        </div>
      </div>

      <div className="io-bottom-grid">
        <DashboardCard className="io-center-card" title="센터별 처리량">
          <div className="io-desktop-table">
            <table className="io-table">
              <thead>
                <tr>
                  <th>센터</th>
                  <th>입고</th>
                  <th>출고</th>
                  <th>균형률</th>
                  <th>전주 대비</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {centerRows.map((row) => (
                  <tr key={row[0]}>
                    <td><strong>{row[0]}</strong></td>
                    <td>{row[1]} BOX</td>
                    <td>{row[2]} BOX</td>
                    <td>{row[3]}</td>
                    <td className={row[4].startsWith("-") ? "negative" : "positive"}>{row[4]}</td>
                    <td><span className="io-status-chip">{row[5]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="io-mobile-center-list">
            {centerRows.map((row) => (
              <article key={`mobile-${row[0]}`} className="io-center-mobile-card">
                <header>
                  <strong>{row[0]}</strong>
                  <span>{row[5]}</span>
                </header>
                <div>
                  <p><b>입고</b>{row[1]} BOX</p>
                  <p><b>출고</b>{row[2]} BOX</p>
                </div>
                <footer>
                  <span>균형률 {row[3]}</span>
                  <em className={row[4].startsWith("-") ? "negative" : "positive"}>{row[4]}</em>
                </footer>
              </article>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard className="io-sku-card" title="Top SKU 입출고 차이">
          <ul className="io-sku-list">
            {skuRows.map((row) => (
              <li key={row[0]}>
                <div>
                  <strong>{row[1]}</strong>
                  <span>{row[0]}</span>
                </div>
                <p>
                  <b>입고 {row[2]}</b>
                  <b>출고 {row[3]}</b>
                </p>
                <em className={row[4].startsWith("-") ? "negative" : "positive"}>{row[4]}</em>
              </li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard className="io-insight-card" title="운영 인사이트">
          <ul className="io-insight-list">
            {insights.map((item) => (
              <li key={item.title} className={item.tone}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </DashboardCard>
      </div>
    </section>
  );
};
