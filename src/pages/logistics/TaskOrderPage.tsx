import { DashboardCard } from "../dashboard/components/DashboardCard";
import "./TaskOrderPage.css";

const orders = [
  ["WO20240517001", "입고", "높음", "대기", "2024-05-17 09:30"],
  ["WO20240517002", "출고", "높음", "진행중", "2024-05-17 09:20"],
  ["WO20240517003", "재고이동", "보통", "진행중", "2024-05-17 09:10"],
  ["WO20240517004", "재고조정", "보통", "대기", "2024-05-17 09:00"],
  ["WO20240516008", "입고", "낮음", "완료", "2024-05-16 18:00"],
  ["WO20240516007", "출고", "높음", "완료", "2024-05-16 17:20"],
  ["WO20240516006", "재고이동", "보통", "완료", "2024-05-16 16:40"],
  ["WO20240516005", "재고조정", "낮음", "완료", "2024-05-16 15:30"],
  ["WO20240516004", "출고", "보통", "취소", "2024-05-16 14:20"],
  ["WO20240516003", "입고", "높음", "진행중", "2024-05-16 13:10"]
];

export const TaskOrderPage = () => {
  return (
    <section className="task-page">
      <DashboardCard
        className="task-head-card"
        title="작업 지시"
        action={<button type="button" className="ghost">새로고침</button>}
      >
        <p>창고 내 작업을 지시하고 진행 상황을 확인할 수 있습니다.</p>
      </DashboardCard>

      <DashboardCard className="task-filter-card">
        <div className="task-filters">
          <label><span>작업 유형</span><select><option>전체</option></select></label>
          <label><span>작업 상태</span><select><option>전체</option></select></label>
          <label><span>우선순위</span><select><option>전체</option></select></label>
          <label><span>작업일자</span><input value="2024-05-01  ~  2024-05-17" readOnly /></label>
          <label><span>창고</span><select><option>전체</option></select></label>
          <label><span>Zone</span><select><option>전체</option></select></label>
          <label><span>지시 번호</span><input placeholder="지시 번호 입력" /></label>
        </div>
        <div className="task-filter-actions">
          <button type="button" className="ghost">초기화</button>
          <button type="button" className="primary">검색</button>
        </div>
      </DashboardCard>

      <div className="task-main-grid">
        <DashboardCard className="task-list-card" title="작업 지시 목록 (총 32건)">
          <div className="task-tabs">
            <button type="button" className="active">전체 32</button>
            <button type="button">대기 8</button>
            <button type="button">진행중 16</button>
            <button type="button">완료 8</button>
          </div>
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>지시 번호</th>
                  <th>작업 유형</th>
                  <th>우선순위</th>
                  <th>상태</th>
                  <th>작업일자</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row[0]}>
                    <td><button type="button" className="task-link">{row[0]}</button></td>
                    <td>{row[1]}</td>
                    <td><span className={`chip ${row[2] === "높음" ? "high" : row[2] === "보통" ? "mid" : "low"}`}>{row[2]}</span></td>
                    <td><span className={`state ${row[3] === "진행중" ? "run" : row[3] === "완료" ? "done" : row[3] === "취소" ? "cancel" : "wait"}`}>{row[3]}</span></td>
                    <td>{row[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardCard>

        <DashboardCard
          className="task-detail-card"
          title="작업 지시 상세"
          action={
            <div className="task-detail-actions">
              <button type="button" className="ghost danger">작업 취소</button>
              <button type="button" className="primary">작업 시작</button>
            </div>
          }
        >
          <div className="task-detail-grid">
            <dl>
              <div><dt>지시 번호</dt><dd>WO20240517001</dd></div>
              <div><dt>작업 유형</dt><dd>입고</dd></div>
              <div><dt>우선순위</dt><dd><span className="chip high">높음</span></dd></div>
              <div><dt>창고 / Zone</dt><dd>중앙물류센터 / A Zone</dd></div>
              <div><dt>지시일시</dt><dd>2024-05-17 09:30</dd></div>
              <div><dt>지시자</dt><dd>홍길동 (관리자)</dd></div>
            </dl>
            <dl>
              <div><dt>예상 시작일시</dt><dd>2024-05-17 10:00</dd></div>
              <div><dt>예상 완료일시</dt><dd>2024-05-17 12:00</dd></div>
              <div><dt>작업 수량</dt><dd>120 BOX</dd></div>
              <div><dt>진행 수량</dt><dd>0 BOX (0%)</dd></div>
              <div><dt>작업자</dt><dd>-</dd></div>
              <div><dt>참조 문서</dt><dd>PO20240516001</dd></div>
            </dl>
          </div>

          <div className="task-subtabs">
            <button type="button" className="active">작업 상품 (2)</button>
            <button type="button">작업 단계</button>
            <button type="button">작업 이력</button>
          </div>

          <table className="task-subtable">
            <thead>
              <tr>
                <th>상품명</th><th>규격</th><th>단위</th><th>지시 수량</th><th>완료 수량</th><th>미완료 수량</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>에너지 음료 250ml</td><td>250ml</td><td>BOX</td><td>100</td><td>0</td><td>100</td></tr>
              <tr><td>생수 500ml</td><td>500ml</td><td>BOX</td><td>20</td><td>0</td><td>20</td></tr>
            </tbody>
          </table>
        </DashboardCard>
      </div>

      <div className="task-bottom-grid">
        <DashboardCard className="task-step-card" title="작업 단계 안내">
          <div className="steps">
            <article><strong>작업 시작</strong><p>작업을 시작합니다.</p><span>대기</span></article>
            <article><strong>작업 수행</strong><p>지시된 작업을 수행합니다.</p><span>대기</span></article>
            <article><strong>수량 확인</strong><p>작업 수량을 확인합니다.</p><span>대기</span></article>
            <article><strong>작업 완료</strong><p>작업 완료를 처리합니다.</p><span>대기</span></article>
          </div>
        </DashboardCard>
        <DashboardCard className="task-info-card" title="작업 정보">
          <dl>
            <div><dt>작업 유형 설명</dt><dd>입고 작업</dd></div>
            <div><dt>작업 정책</dt><dd>FIFO</dd></div>
            <div><dt>검수 방법</dt><dd>수량 검수</dd></div>
            <div><dt>적재 정책</dt><dd>추천 로케이션 적재</dd></div>
          </dl>
        </DashboardCard>
      </div>
    </section>
  );
};

