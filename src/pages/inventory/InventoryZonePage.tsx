import { DashboardCard } from "../dashboard/components/DashboardCard";
import "./InventoryZonePage.css";

const zoneRows = [
  ["A", "A Zone (스테킹)", "중앙물류센터", "120", "사용"],
  ["B", "B Zone (피킹)", "중앙물류센터", "100", "사용"],
  ["C", "C Zone (리저브)", "중앙물류센터", "100", "사용"],
  ["D", "D Zone (벌크)", "중앙물류센터", "100", "사용"],
  ["E", "E Zone (냉장)", "중앙물류센터", "80", "사용"],
  ["F", "F Zone (냉동)", "중앙물류센터", "60", "사용"],
  ["G", "G Zone (반품)", "중앙물류센터", "40", "사용"],
  ["H", "H Zone (출고대기)", "중앙물류센터", "50", "사용"],
  ["I", "I Zone (포장)", "중앙물류센터", "30", "사용"],
  ["J", "J Zone (QA)", "중앙물류센터", "20", "사용"],
  ["K", "K Zone (유지보수)", "중앙물류센터", "10", "비사용"],
  ["L", "L Zone (사무실)", "중앙물류센터", "5", "사용"]
];

const mapZones = [
  { code: "M", name: "하역장", tone: "gray", style: { gridColumn: "1 / 2", gridRow: "1 / 2" } },
  { code: "A", name: "스테킹", tone: "green", style: { gridColumn: "2 / 5", gridRow: "1 / 2" } },
  { code: "F", name: "냉동", tone: "cyan", style: { gridColumn: "5 / 6", gridRow: "1 / 2" } },
  { code: "J", name: "QA", tone: "violet", style: { gridColumn: "1 / 2", gridRow: "2 / 3" } },
  { code: "B", name: "피킹", tone: "blue", style: { gridColumn: "2 / 3", gridRow: "2 / 3" } },
  { code: "C", name: "리저브", tone: "yellow", style: { gridColumn: "3 / 4", gridRow: "2 / 3" } },
  { code: "E", name: "냉장", tone: "mint", style: { gridColumn: "4 / 5", gridRow: "2 / 3" } },
  { code: "K", name: "유지보수", tone: "gray", style: { gridColumn: "1 / 2", gridRow: "3 / 4" } },
  { code: "D", name: "벌크", tone: "beige", style: { gridColumn: "2 / 4", gridRow: "3 / 4" } },
  { code: "G", name: "반품", tone: "pink", style: { gridColumn: "4 / 5", gridRow: "3 / 4" } },
  { code: "L", name: "사무실", tone: "gray", style: { gridColumn: "1 / 2", gridRow: "4 / 5" } },
  { code: "I", name: "포장", tone: "lavender", style: { gridColumn: "2 / 4", gridRow: "4 / 5" } },
  { code: "H", name: "출고대기", tone: "red", style: { gridColumn: "4 / 5", gridRow: "4 / 5" } }
];

const legend = ["스테킹", "피킹", "리저브", "벌크", "냉장", "냉동", "반품", "포장", "QA", "유지보수", "사무실", "출고대기", "하역장"];

export const InventoryZonePage = () => {
  return (
    <section className="zone-page">
      <DashboardCard
        className="zone-head-card"
        title="Zone 관리"
        action={
          <div className="zone-head-actions">
            <button type="button" className="ghost">엑셀 다운로드</button>
            <button type="button" className="primary">+ Zone 등록</button>
          </div>
        }
      >
        <p>창고의 Zone 정보를 조회, 등록, 수정 및 관리합니다.</p>
      </DashboardCard>

      <DashboardCard className="zone-filter-card">
        <div className="zone-filters">
          <label><span>창고</span><select><option>전체</option></select></label>
          <label><span>사용 여부</span><select><option>전체</option></select></label>
          <label><span>Zone 코드</span><input placeholder="코드를 입력하세요" /></label>
          <label><span>Zone명</span><input placeholder="명을 입력하세요" /></label>
        </div>
        <div className="zone-filter-actions">
          <button type="button" className="ghost">초기화</button>
          <button type="button" className="primary">검색</button>
        </div>
      </DashboardCard>

      <div className="zone-main-grid">
        <DashboardCard
          className="zone-list-card"
          title="Zone 목록 (총 16건)"
          action={
            <div className="zone-list-tools">
              <select><option>20개씩 보기</option></select>
              <button type="button">설정</button>
            </div>
          }
        >
          <div className="zone-table-wrap">
            <table className="zone-table">
              <thead>
                <tr>
                  <th>Zone 코드</th>
                  <th>Zone명</th>
                  <th>창고명</th>
                  <th>로케이션 수</th>
                  <th>사용 여부</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {zoneRows.map((row) => (
                  <tr key={row[0]}>
                    <td><button type="button" className="zone-code-link">{row[0]}</button></td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                    <td><span className={`state ${row[4] === "사용" ? "on" : "off"}`}>{row[4]}</span></td>
                    <td className="actions"><button type="button">수정</button><button type="button">삭제</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardCard>

        <DashboardCard className="zone-map-card" title="Zone 배치도">
          <p className="zone-map-desc">드래그하여 위치를 변경할 수 있습니다.</p>
          <div className="zone-map-wrap">
            <div className="zone-map-tools">
              <button type="button">+</button>
              <button type="button">-</button>
              <button type="button">초기</button>
            </div>
            <div className="zone-map-grid">
              {mapZones.map((z) => (
                <button key={z.code} type="button" className={`zone-block ${z.tone}`} style={z.style}>
                  <strong>{z.code}</strong>
                  <span>{z.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="zone-legend">
            {legend.map((name, i) => (
              <span key={name}><i className={`tone-${(i % 8) + 1}`} />{name}</span>
            ))}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard className="zone-detail-card" title="Zone 상세 정보" action={<button type="button" className="primary">수정</button>}>
        <div className="zone-tabs">
          <button type="button" className="active">기본 정보</button>
          <button type="button">연결 로케이션 그룹</button>
        </div>
        <dl className="zone-detail-grid">
          <div><dt>Zone 코드</dt><dd>A</dd></div>
          <div><dt>설명</dt><dd>높은 적재가 가능한 스테킹 존</dd></div>
          <div><dt>생성일</dt><dd>2024-01-15 09:30:00</dd></div>
          <div><dt>Zone명</dt><dd>A Zone (스테킹)</dd></div>
          <div><dt>로케이션 수</dt><dd>120</dd></div>
          <div><dt>생성자</dt><dd>홍길동</dd></div>
          <div><dt>창고명</dt><dd>중앙물류센터</dd></div>
          <div><dt>사용 여부</dt><dd><span className="state on">사용</span></dd></div>
          <div><dt>수정일</dt><dd>2024-05-20 14:22:30</dd></div>
        </dl>
      </DashboardCard>
    </section>
  );
};

