import { useState, useMemo } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import "./LoadingPage.css";

// 로케이션 적재 정보 타입 정의
interface LoadingLocation {
  id: string;
  warehouse: string;
  zone: string;
  location: string;
  maxCapacity: number; // 최대 용량 (CBM)
  currentVolume: number; // 현재 적재 용적 (CBM)
  skuCount: number;
  mainSku: string;
}

// 초기 Mock 데이터
const INITIAL_LOADING: LoadingLocation[] = [
  {
    id: "LD-001",
    warehouse: "중앙물류센터",
    zone: "A Zone",
    location: "A-01-01",
    maxCapacity: 10.0,
    currentVolume: 9.5,
    skuCount: 3,
    mainSku: "프리미엄 세탁세제 2.5L"
  },
  {
    id: "LD-002",
    warehouse: "중앙물류센터",
    zone: "A Zone",
    location: "A-01-02",
    maxCapacity: 10.0,
    currentVolume: 4.5,
    skuCount: 1,
    mainSku: "친환경 주방세제 리필"
  },
  {
    id: "LD-003",
    warehouse: "남부물류센터",
    zone: "B Zone",
    location: "B-02-04",
    maxCapacity: 12.0,
    currentVolume: 10.8,
    skuCount: 2,
    mainSku: "극세사 다용도 타월"
  },
  {
    id: "LD-004",
    warehouse: "중앙물류센터",
    zone: "C Zone",
    location: "C-01-10",
    maxCapacity: 8.0,
    currentVolume: 6.4,
    skuCount: 4,
    mainSku: "초강력 다목적 세정제"
  },
  {
    id: "LD-005",
    warehouse: "남부물류센터",
    zone: "B Zone",
    location: "B-03-01",
    maxCapacity: 15.0,
    currentVolume: 3.0,
    skuCount: 1,
    mainSku: "공업용 스트레치 랩"
  },
  {
    id: "LD-006",
    warehouse: "중앙물류센터",
    zone: "D Zone",
    location: "D-05-12",
    maxCapacity: 20.0,
    currentVolume: 19.2,
    skuCount: 1,
    mainSku: "포장용 골판지 상자(중)"
  },
  {
    id: "LD-007",
    warehouse: "중앙물류센터",
    zone: "D Zone",
    location: "D-05-13",
    maxCapacity: 10.0,
    currentVolume: 7.2,
    skuCount: 2,
    mainSku: "OPP 포장용 테이프"
  },
  {
    id: "LD-008",
    warehouse: "중앙물류센터",
    zone: "A Zone",
    location: "A-01-03",
    maxCapacity: 10.0,
    currentVolume: 0.0,
    skuCount: 0,
    mainSku: "-"
  }
];

export const LoadingPage = () => {
  const [loadings] = useState<LoadingLocation[]>(INITIAL_LOADING);

  // 필터 상태
  const [selWarehouse, setSelWarehouse] = useState("전체");
  const [selZone, setSelZone] = useState("전체");
  const [selStatus, setSelStatus] = useState("전체"); // 전체, 여유, 보통, 포화
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  // 모바일 탭 상태 ("summary": 구역별 요약, "list": 세부 리스트)
  const [mobileTab, setMobileTab] = useState<"summary" | "list">("list");

  // 필터 드롭다운 옵션 추출
  const warehouses = useMemo(() => {
    const set = new Set(loadings.map(item => item.warehouse));
    return ["전체", ...Array.from(set)];
  }, [loadings]);

  const zones = useMemo(() => {
    const filtered = loadings.filter(item => selWarehouse === "전체" || item.warehouse === selWarehouse);
    const set = new Set(filtered.map(item => item.zone));
    return ["전체", ...Array.from(set)];
  }, [loadings, selWarehouse]);

  // 필터가 적용된 로케이션 목록 및 가공 데이터 (적재율 추가)
  const processedLoadings = useMemo(() => {
    return loadings.map(item => {
      const rate = item.maxCapacity > 0 ? Math.round((item.currentVolume / item.maxCapacity) * 100) : 0;
      let statusGroup: "EMPTY" | "NORMAL" | "FULL" = "NORMAL";
      if (rate >= 90) {
        statusGroup = "FULL";
      } else if (rate < 50) {
        statusGroup = "EMPTY";
      }
      return { ...item, rate, statusGroup };
    });
  }, [loadings]);

  // 필터링 적용
  const filteredLoadings = useMemo(() => {
    return processedLoadings.filter(item => {
      const matchWarehouse = selWarehouse === "전체" || item.warehouse === selWarehouse;
      const matchZone = selZone === "전체" || item.zone === selZone;
      
      let matchStatus = true;
      if (selStatus === "여유") matchStatus = item.statusGroup === "EMPTY";
      else if (selStatus === "보통") matchStatus = item.statusGroup === "NORMAL";
      else if (selStatus === "포화") matchStatus = item.statusGroup === "FULL";

      const query = searchQuery.toLowerCase().trim();
      const matchSearch = query === "" ||
        item.location.toLowerCase().includes(query) ||
        item.mainSku.toLowerCase().includes(query);

      return matchWarehouse && matchZone && matchStatus && matchSearch;
    });
  }, [processedLoadings, selWarehouse, selZone, selStatus, searchQuery]);

  // 상단 스탯 계산
  const stats = useMemo(() => {
    let totalCap = 0;
    let totalVol = 0;
    let usedLocs = 0;
    let fullLocs = 0;

    filteredLoadings.forEach(item => {
      totalCap += item.maxCapacity;
      totalVol += item.currentVolume;
      if (item.currentVolume > 0) {
        usedLocs += 1;
      }
      if (item.rate >= 90) {
        fullLocs += 1;
      }
    });

    const averageRate = totalCap > 0 ? Math.round((totalVol / totalCap) * 100) : 0;

    return {
      averageRate,
      totalVolume: Math.round(totalVol * 10) / 10,
      maxCapacity: Math.round(totalCap * 10) / 10,
      usedLocs,
      fullLocs
    };
  }, [filteredLoadings]);

  // 구역(Zone)별 평균 적재율 요약 연산
  const zoneSummary = useMemo(() => {
    const summaryMap: Record<string, { warehouse: string; currentVolume: number; maxCapacity: number; locCount: number }> = {};

    filteredLoadings.forEach(item => {
      const key = `${item.warehouse} - ${item.zone}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          warehouse: item.warehouse,
          currentVolume: 0,
          maxCapacity: 0,
          locCount: 0
        };
      }
      summaryMap[key].currentVolume += item.currentVolume;
      summaryMap[key].maxCapacity += item.maxCapacity;
      summaryMap[key].locCount += 1;
    });

    return Object.entries(summaryMap).map(([zoneKey, data]) => {
      const rate = data.maxCapacity > 0 ? Math.round((data.currentVolume / data.maxCapacity) * 100) : 0;
      return {
        zoneKey,
        warehouse: data.warehouse,
        zoneName: zoneKey.split(" - ")[1],
        locCount: data.locCount,
        currentVolume: Math.round(data.currentVolume * 10) / 10,
        maxCapacity: Math.round(data.maxCapacity * 10) / 10,
        rate
      };
    });
  }, [filteredLoadings]);

  const handleResetFilters = () => {
    setSelWarehouse("전체");
    setSelZone("전체");
    setSelStatus("전체");
    setSearchQuery("");
  };

  return (
    <section className="loading-page-container">
      {/* 1. 상단 대시보드 스탯 보드 */}
      <div className="loading-stats-grid">
        <DashboardCard className="stat-card">
          <div className="stat-icon primary">📊</div>
          <div className="stat-details">
            <span className="stat-label">평균 적재율</span>
            <span className="stat-value">{stats.averageRate}%</span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon info">📐</div>
          <div className="stat-details">
            <span className="stat-label">총 적재 용적</span>
            <span className="stat-value">
              {stats.totalVolume} <small>/ {stats.maxCapacity} CBM</small>
            </span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon success">📍</div>
          <div className="stat-details">
            <span className="stat-label">사용 로케이션 수</span>
            <span className="stat-value">
              {stats.usedLocs} <small>/ {filteredLoadings.length}개</small>
            </span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon warning">🚨</div>
          <div className="stat-details">
            <span className="stat-label">포화 로케이션 수</span>
            <span className="stat-value text-danger">{stats.fullLocs} <small>개</small></span>
          </div>
        </DashboardCard>
      </div>

      {/* 2. 검색 및 다중 조건 필터 영역 */}
      <DashboardCard className="loading-filter-card">
        <div className="filter-card-header">
          <strong className="filter-title">🔍 공간 적재 조건 검색</strong>
          <button 
            type="button" 
            className="mobile-filter-toggle-btn"
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          >
            {isFilterExpanded ? "필터 접기 ▲" : "필터 열기 ▼"}
          </button>
        </div>

        <div className={`filter-inputs-grid ${isFilterExpanded ? "expanded" : ""}`}>
          <label>
            <span>창고 구분</span>
            <select 
              value={selWarehouse} 
              onChange={(e) => {
                setSelWarehouse(e.target.value);
                setSelZone("전체");
              }}
            >
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label>
            <span>구역 (Zone)</span>
            <select value={selZone} onChange={(e) => setSelZone(e.target.value)}>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label>
            <span>적재 상태</span>
            <select value={selStatus} onChange={(e) => setSelStatus(e.target.value)}>
              <option value="전체">전체 상태</option>
              <option value="여유">여유 (50% 미만)</option>
              <option value="보통">보통 (50% ~ 90%)</option>
              <option value="포화">포화 (90% 이상)</option>
            </select>
          </label>
          <label className="search-query-label">
            <span>통합 검색 (로케이션/보관 품목)</span>
            <input 
              type="text" 
              placeholder="검색어 입력"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <div className="filter-action-buttons">
            <button type="button" className="ghost" onClick={handleResetFilters}>초기화</button>
          </div>
        </div>
      </DashboardCard>

      {/* 모바일 화면용 탭 네비게이션 */}
      <div className="mobile-tabs-header">
        <button
          type="button"
          className={`tab-btn ${mobileTab === "list" ? "active" : ""}`}
          onClick={() => setMobileTab("list")}
        >
          로케이션별 적재 ({filteredLoadings.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${mobileTab === "summary" ? "active" : ""}`}
          onClick={() => setMobileTab("summary")}
        >
          구역(Zone)별 요약 ({zoneSummary.length})
        </button>
      </div>

      {/* 3. 메인 뷰포트 레이아웃 */}
      <div className={`loading-main-layout show-${mobileTab}`}>
        
        {/* 좌측 영역: 구역별 적재량 요약 목록 */}
        <DashboardCard className="loading-summary-panel" title="창고/구역별 적재 요약">
          <div className="summary-cards-container">
            {zoneSummary.map((sum) => (
              <div key={sum.zoneKey} className="zone-loading-card">
                <div className="zone-meta">
                  <span className="zone-badge">{sum.zoneName}</span>
                  <span className="wh-name">{sum.warehouse}</span>
                </div>
                
                {/* 게이지 바 */}
                <div className="progress-section">
                  <div className="progress-text-row">
                    <span className="label">평균 적재율</span>
                    <span className={`rate-val font-bold ${sum.rate >= 90 ? "text-danger" : sum.rate < 50 ? "text-success" : "text-primary"}`}>
                      {sum.rate}%
                    </span>
                  </div>
                  <div className="progress-bar-container">
                    <div 
                      className={`progress-bar-fill ${sum.rate >= 90 ? "bg-danger" : sum.rate < 50 ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${sum.rate}%` }}
                    />
                  </div>
                </div>

                <div className="zone-details">
                  <div>
                    <span className="label">로케이션 수</span>
                    <span className="val">{sum.locCount}개</span>
                  </div>
                  <div>
                    <span className="label">사용/총 용량</span>
                    <span className="val text-muted">{sum.currentVolume} / {sum.maxCapacity} CBM</span>
                  </div>
                </div>
              </div>
            ))}
            {zoneSummary.length === 0 && (
              <div className="empty-info">구역 요약 데이터가 없습니다.</div>
            )}
          </div>
        </DashboardCard>

        {/* 우측 영역: 세부 로케이션 테이블 & 모바일 카드 뷰 */}
        <DashboardCard 
          className="loading-list-panel" 
          title={`로케이션 세부 적재 (총 ${filteredLoadings.length}건)`}
        >
          {/* PC용 데이터 테이블 */}
          <div className="loading-table-wrapper">
            <table className="loading-table">
              <thead>
                <tr>
                  <th>로케이션</th>
                  <th>창고</th>
                  <th>구역(Zone)</th>
                  <th className="text-right">보관 용적</th>
                  <th className="text-right">최대 캐파</th>
                  <th style={{ width: "160px" }}>적재율</th>
                  <th>대표 보관 품목</th>
                  <th className="text-center">보관 SKU</th>
                  <th>구분</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoadings.map((item) => (
                  <tr key={item.id} className={item.rate >= 90 ? "row-danger" : ""}>
                    <td><span className="loc-badge">{item.location}</span></td>
                    <td>{item.warehouse}</td>
                    <td>{item.zone}</td>
                    <td className="text-right font-bold">{item.currentVolume} CBM</td>
                    <td className="text-right text-muted">{item.maxCapacity} CBM</td>
                    <td>
                      <div className="table-progress-wrap">
                        <span className="progress-text">{item.rate}%</span>
                        <div className="progress-bar-container mini">
                          <div 
                            className={`progress-bar-fill ${item.rate >= 90 ? "bg-danger" : item.rate < 50 ? "bg-success" : "bg-primary"}`}
                            style={{ width: `${item.rate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="main-sku-cell">{item.mainSku}</td>
                    <td className="text-center font-bold">{item.skuCount}종</td>
                    <td>
                      {item.rate >= 90 ? (
                        <span className="badge-status shortage">🚨 포화</span>
                      ) : item.rate < 50 ? (
                        <span className="badge-status normal">🟢 여유</span>
                      ) : (
                        <span className="badge-status hold">🔵 보통</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredLoadings.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center empty-td">
                      검색 조건에 매칭되는 적재 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 모바일용 카드 리스트 뷰 */}
          <div className="loading-mobile-cards">
            {filteredLoadings.map((item) => (
              <div key={item.id} className={`mobile-loading-card ${item.rate >= 90 ? "full-capacity" : ""}`}>
                <div className="card-header">
                  <span className="loc-tag">📍 {item.location}</span>
                  {item.rate >= 90 ? (
                    <span className="badge-status shortage">🚨 공간 포화</span>
                  ) : item.rate < 50 ? (
                    <span className="badge-status normal">🟢 여유</span>
                  ) : (
                    <span className="badge-status hold">🔵 보통</span>
                  )}
                </div>
                
                <h4 className="card-main-sku">{item.mainSku}</h4>
                <div className="card-meta">
                  <span>창고/구역: {item.warehouse} / {item.zone}</span>
                  <span>보관 SKU 종류: {item.skuCount}종</span>
                </div>

                {/* 게이지 */}
                <div className="card-gauge-section">
                  <div className="gauge-text">
                    <span>적재율</span>
                    <span className="font-bold">{item.rate}%</span>
                  </div>
                  <div className="progress-bar-container">
                    <div 
                      className={`progress-bar-fill ${item.rate >= 90 ? "bg-danger" : item.rate < 50 ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>

                <div className="card-capacities">
                  <div className="cap-cell">
                    <span className="label">현재 적재 용적</span>
                    <span className="val font-bold">{item.currentVolume} CBM</span>
                  </div>
                  <div className="cap-cell">
                    <span className="label">최대 캐파</span>
                    <span className="val text-muted">{item.maxCapacity} CBM</span>
                  </div>
                </div>
              </div>
            ))}
            {filteredLoadings.length === 0 && (
              <div className="empty-info">조회 조건에 맞는 적재 데이터가 없습니다.</div>
            )}
          </div>

        </DashboardCard>

      </div>
    </section>
  );
};
