import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import map2dLayoutImage from "../../assets/map2d-layout-v2.png";

type ZoneItem = {
  id: string;
  title: string;
  code: string;
  type: string;
  util: number;
  status: "정상" | "주의";
  temp: string;
  manager: string;
  capacity: number;
  current: number;
  items: number;
  recentIn: string;
  recentOut: string;
  className: string;
  hotspot: { left: string; top: string; width: string; height: string };
};

const zoneItems: ZoneItem[] = [
  {
    id: "care",
    title: "CARE 창고",
    code: "CR-01 ~ CR-20",
    type: "보관 구역",
    util: 64,
    status: "정상",
    temp: "상온",
    manager: "김현우 대리",
    capacity: 2000,
    current: 1280,
    items: 46,
    recentIn: "2026-05-07 09:20",
    recentOut: "2026-05-07 14:10",
    className: "zone-care",
    hotspot: { left: "11.8%", top: "20.2%", width: "15.9%", height: "58.3%" }
  },
  {
    id: "bk",
    title: "BK 창고",
    code: "BK-01 ~ BK-20",
    type: "보관 구역",
    util: 58,
    status: "정상",
    temp: "상온",
    manager: "이상민 주임",
    capacity: 1800,
    current: 1044,
    items: 39,
    recentIn: "2026-05-07 08:45",
    recentOut: "2026-05-07 13:30",
    className: "zone-bk",
    hotspot: { left: "31.2%", top: "20.2%", width: "15.9%", height: "58.3%" }
  },
  {
    id: "bus",
    title: "바스 창고",
    code: "BS-01 ~ BS-20",
    type: "보관 구역",
    util: 71,
    status: "주의",
    temp: "상온",
    manager: "박정호 과장",
    capacity: 1800,
    current: 1278,
    items: 42,
    recentIn: "2026-05-07 10:15",
    recentOut: "2026-05-07 14:25",
    className: "zone-bus",
    hotspot: { left: "50.6%", top: "20.2%", width: "15.9%", height: "58.3%" }
  },
  {
    id: "as",
    title: "AS 창고",
    code: "AS-01 ~ AS-20",
    type: "보관 구역",
    util: 49,
    status: "정상",
    temp: "상온",
    manager: "최미선 주임",
    capacity: 1800,
    current: 882,
    items: 33,
    recentIn: "2026-05-07 09:55",
    recentOut: "2026-05-07 12:50",
    className: "zone-as",
    hotspot: { left: "70.0%", top: "20.2%", width: "15.9%", height: "58.3%" }
  }
];

const legend = [
  { label: "CARE 창고", tone: "blue" },
  { label: "BK 창고", tone: "green" },
  { label: "바스 창고", tone: "violet" },
  { label: "AS 창고", tone: "orange" }
];

export const Map2DWorkbench = () => {
  const [selectedZoneId, setSelectedZoneId] = useState("care");

  const selectedZone = useMemo(
    () => zoneItems.find((z) => z.id === selectedZoneId) ?? zoneItems[0],
    [selectedZoneId]
  );

  return (
    <section className="layout-editor-page map2d-page">
      <div className="map2d-top-actions">
        <Button variant="outline" size="sm">새로고침</Button>
        <Button variant="outline" size="sm">전체 화면</Button>
        <Button size="sm">위치 등록</Button>
      </div>

      <div className="map2d-main-grid">
        <section className="app-surface map2d-canvas-panel">
          <div className="map2d-panel-title">
            <strong>공장 레이아웃 맵</strong>
            <div className="map2d-legend">
              {legend.map((item) => (
                <span key={item.label}><i className={`c-${item.tone}`} />{item.label}</span>
              ))}
            </div>
            <div className="map2d-head-tools">
              <button type="button">맞춤 보기</button>
              <button type="button" aria-label="확대">+</button>
              <button type="button" aria-label="축소">−</button>
            </div>
          </div>

          <div className="warehouse-canvas-grid map2d-canvas-grid map2d-photo-canvas">
            <div className="map2d-image-stage">
              <img src={map2dLayoutImage} alt="공장 레이아웃 맵" />
              {zoneItems.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className={`zone map2d-zone ${zone.className} ${selectedZoneId === zone.id ? "active" : ""}`}
                  style={zone.hotspot}
                  onClick={() => setSelectedZoneId(zone.id)}
                  title={zone.title}
                  aria-label={zone.title}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="app-surface map2d-side-detail">
          <div className="map2d-detail-head">
            <strong>위치 상세 정보</strong>
            <button type="button" aria-label="닫기">×</button>
          </div>
          <div className="map2d-detail-title">
            <div>
              <h3>{selectedZone.title}</h3>
              <span>{selectedZone.code}</span>
            </div>
            <b className={selectedZone.status === "주의" ? "warn" : ""}>{selectedZone.status}</b>
          </div>
          <dl className="map2d-detail-list">
            <div><dt>구역 유형</dt><dd>{selectedZone.type}</dd></div>
            <div><dt>상태</dt><dd className={selectedZone.status === "주의" ? "warn" : "ok"}>{selectedZone.status}</dd></div>
            <div><dt>적재 사용률</dt><dd>{selectedZone.util}% <span className="map2d-progress"><i style={{ width: `${selectedZone.util}%` }} /></span></dd></div>
            <div><dt>현재 수량</dt><dd>{selectedZone.current.toLocaleString()} PLT</dd></div>
            <div><dt>최대 수량</dt><dd>{selectedZone.capacity.toLocaleString()} PLT</dd></div>
            <div><dt>SKU 항목</dt><dd>{selectedZone.items} 개</dd></div>
            <div><dt>최근 입고</dt><dd>{selectedZone.recentIn}</dd></div>
            <div><dt>최근 출고</dt><dd>{selectedZone.recentOut}</dd></div>
            <div><dt>담당자</dt><dd>{selectedZone.manager}</dd></div>
            <div><dt>온도</dt><dd>{selectedZone.temp}</dd></div>
          </dl>
          <button type="button" className="map2d-detail-link">위치 이동 이력 보기</button>
        </aside>
      </div>

      <section className="app-surface map2d-list-panel">
        <div className="map2d-list-head">
          <strong>위치 목록 <span>{zoneItems.length}</span></strong>
          <div className="map2d-list-actions">
            <Button variant="outline" size="sm">엑셀 다운로드</Button>
            <Button variant="outline" size="sm">컬럼 설정</Button>
          </div>
        </div>
        <div className="table-scroll-x">
          <table className="data-table map2d-table">
            <thead>
              <tr>
                <th></th>
                <th>코드</th>
                <th>창고명</th>
                <th>상태</th>
                <th>적재율</th>
                <th>현재</th>
                <th>최대</th>
                <th>담당자</th>
              </tr>
            </thead>
            <tbody>
              {zoneItems.map((zone) => (
                <tr key={zone.id} className={selectedZoneId === zone.id ? "row-selected" : ""} onClick={() => setSelectedZoneId(zone.id)}>
                  <td><input type="radio" checked={selectedZoneId === zone.id} onChange={() => setSelectedZoneId(zone.id)} aria-label={`${zone.title} 선택`} /></td>
                  <td>{zone.code}</td>
                  <td>{zone.title}</td>
                  <td><span className={zone.status === "주의" ? "map2d-status warn" : "map2d-status ok"}>{zone.status}</span></td>
                  <td>{zone.util}% <span className="map2d-progress mini"><i style={{ width: `${zone.util}%` }} /></span></td>
                  <td>{zone.current.toLocaleString()} PLT</td>
                  <td>{zone.capacity.toLocaleString()} PLT</td>
                  <td>{zone.manager}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};
