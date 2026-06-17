import { useState } from "react";
import { Button } from "../../components/ui/Button";
import "./LayoutWorkbench.css";

type Rack = {
  id: string;
  name: string;
  code: string;
  currentLoad: string;
};

const rackData: Rack[] = [
  { id: "A", name: "Rack-A", code: "RA-01", currentLoad: "720" },
  { id: "B", name: "Rack-B", code: "RB-01", currentLoad: "480" },
  { id: "C", name: "Rack-C", code: "RC-01", currentLoad: "650" },
  { id: "D", name: "Rack-D", code: "RD-01", currentLoad: "300" },
  { id: "E", name: "Rack-E", code: "RE-01", currentLoad: "410" },
  { id: "F", name: "Rack-F", code: "RF-01", currentLoad: "275" },
  { id: "G", name: "Rack-G", code: "RG-01", currentLoad: "315" },
  { id: "H", name: "Rack-H", code: "RH-01", currentLoad: "400" },
  { id: "I", name: "Rack-I", code: "RI-01", currentLoad: "280" },
  { id: "J", name: "Rack-J", code: "RJ-01", currentLoad: "150" }
];

const bottomTabs = ["Location", "재고현황", "작업이력"];
const rightTabs = ["기본정보", "운영정보", "작업정보", "위치정보"];

export const LayoutWorkbench = () => {
  const [racks, setRacks] = useState<Rack[]>(rackData);
  const [activeRightTab, setActiveRightTab] = useState("기본정보");
  const [activeBottomTab, setActiveBottomTab] = useState("Location");
  const [selectedRackId, setSelectedRackId] = useState("A");
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isBottomExpanded, setIsBottomExpanded] = useState(false);

  const selectedRack = racks.find((rack) => rack.id === selectedRackId) ?? racks[0];

  const handleRackClick = (id: string) => {
    setSelectedRackId(id);
    setIsRightPanelOpen(true);
  };

  const handleAddRack = () => {
    const nextIndex = racks.length;
    const nextLetter = String.fromCharCode("A".charCodeAt(0) + nextIndex);
    const newRack: Rack = {
      id: nextLetter,
      name: `Rack-${nextLetter}`,
      code: `R${nextLetter}-01`,
      currentLoad: "0"
    };
    setRacks((prev) => [...prev, newRack]);
    setSelectedRackId(newRack.id);
    setIsRightPanelOpen(true);
  };

  const handleRefreshTree = () => {
    setRacks(rackData);
    setSelectedRackId("A");
    setIsRightPanelOpen(false);
  };

  return (
    <div className="layout-editor-container">
      <header className="layout-header-top">
        <div className="layout-header-title">
          <h2>창고 레이아웃 관리</h2>
          <span>창고 구조 및 로케이션 배치 관리</span>
        </div>
        <div className="layout-header-actions">
          <Button variant="outline">초기화</Button>
          <Button variant="outline">배포</Button>
          <Button>저장</Button>
        </div>
      </header>

      <div className="layout-toolbar">
        <div className="toolbar-group">
          <label>창고 선택</label>
          <select className="form-input toolbar-select">
            <option>서울 중앙창고</option>
          </select>

          <label className="toolbar-label-gap">구역 필터</label>
          <div className="toolbar-filters">
            <button className="filter-btn active">전체</button>
            <button className="filter-btn">입고</button>
            <button className="filter-btn">보관</button>
            <button className="filter-btn">피킹</button>
            <button className="filter-btn">출고</button>
          </div>

          <div className="search-input-wrap toolbar-search-gap">
            <input type="text" placeholder="랙명 / 로케이션 검색" />
          </div>
        </div>

        <div className="toolbar-actions">
          <Button variant="outline">구역 추가</Button>
          <Button variant="outline">랙 추가</Button>
          <Button variant="outline">자동 생성</Button>
          <Button variant="outline">복사</Button>
          <Button variant="outline" className="danger-btn">삭제</Button>
        </div>
      </div>

      <div
        className={`layout-grid-body ${isRightPanelOpen ? "panel-open" : ""} ${isBottomExpanded ? "bottom-expanded" : ""}`}
      >
        <aside className="layout-left-panel">
          <div className="panel-header">
            <span>Layout Structure</span>
            <div className="panel-header-actions">
              <button type="button" aria-label="랙 추가" title="랙 추가" onClick={handleAddRack}>+</button>
              <button type="button" aria-label="새로고침" title="새로고침" onClick={handleRefreshTree}>↻</button>
            </div>
          </div>
          <div className="tree-container">
            {racks.map((rack) => (
              <div
                key={rack.id}
                className={`tree-node-row ${selectedRackId === rack.id ? "selected" : ""}`}
                onClick={() => handleRackClick(rack.id)}
              >
                <span className="node-label">{rack.name}</span>
                <span className="node-status status-active">사용중</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="layout-center-canvas">
          <div className="canvas-toolbar">
            <button className="canvas-tool-btn" type="button" title="선택" aria-label="선택">↖</button>
            <button className="canvas-tool-btn" type="button" title="이동" aria-label="이동">✥</button>
            <button className="canvas-tool-btn" type="button" title="확대" aria-label="확대">＋</button>
          </div>

          <div className="canvas-viewport">
            <div className="warehouse-zone zone-inbound">
              <div className="zone-label">입고구역</div>
              <div className="rack-group">
                {racks.slice(0, 4).map((rack) => (
                  <div key={rack.id} className={`rack-box ${selectedRackId === rack.id ? "selected" : ""}`} onClick={() => handleRackClick(rack.id)}>
                    <div className="rack-box-header">
                      <strong>{rack.name}</strong>
                      <span>{rack.currentLoad}</span>
                    </div>
                    <div className="rack-cells">
                      {Array.from({ length: 15 }).map((_, i) => (
                        <div key={i} className={`rack-cell ${i < 8 ? "full" : i < 11 ? "partial" : "empty"}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="warehouse-zone zone-picking">
              <div className="zone-label">피킹구역</div>
              <div className="rack-group">
                {racks.slice(4, 7).map((rack) => (
                  <div key={rack.id} className={`rack-box ${selectedRackId === rack.id ? "selected" : ""}`} onClick={() => handleRackClick(rack.id)}>
                    <div className="rack-box-header">
                      <strong>{rack.name}</strong>
                      <span>{rack.currentLoad}</span>
                    </div>
                    <div className="rack-cells">
                      {Array.from({ length: 15 }).map((_, i) => (
                        <div key={i} className={`rack-cell ${i < 7 ? "full" : i < 10 ? "partial" : "empty"}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="warehouse-zone zone-outbound">
              <div className="zone-label">출고구역</div>
              <div className="rack-group">
                {racks.slice(7).map((rack) => (
                  <div key={rack.id} className={`rack-box ${selectedRackId === rack.id ? "selected" : ""}`} onClick={() => handleRackClick(rack.id)}>
                    <div className="rack-box-header">
                      <strong>{rack.name}</strong>
                      <span>{rack.currentLoad}</span>
                    </div>
                    <div className="rack-cells">
                      {Array.from({ length: 15 }).map((_, i) => (
                        <div key={i} className={`rack-cell ${i < 5 ? "full" : i < 8 ? "partial" : "empty"}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        <div className="layout-bottom-panel">
          <div className="bottom-tabs">
            <div className="bottom-tab-group">
              {bottomTabs.map((tab) => (
                <button key={tab} className={`bottom-tab ${activeBottomTab === tab ? "active" : ""}`} onClick={() => setActiveBottomTab(tab)}>
                  {tab}
                </button>
              ))}
            </div>
            <button className="bottom-size-toggle" onClick={() => setIsBottomExpanded((prev) => !prev)}>
              {isBottomExpanded ? "맵 크게 보기" : "테이블 크게 보기"}
            </button>
          </div>

          <div className="table-container">
            <table className="layout-table">
              <thead>
                <tr>
                  <th>로케이션</th>
                  <th>랙명</th>
                  <th>레벨</th>
                  <th>상태</th>
                  <th>적재율</th>
                  <th>SKU 수량</th>
                  <th>작업중</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selectedRackId}-01-01</td>
                  <td>{selectedRack.name}</td>
                  <td>Level-1</td>
                  <td><span className="status-badge active">사용중</span></td>
                  <td>80%</td>
                  <td>12</td>
                  <td><span className="task-badge inbound">입고</span></td>
                  <td>-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside className="layout-right-panel">
          <div className="panel-header">
            <span>{selectedRack.name} 상세정보</span>
            <div className="panel-header-actions">
              <button onClick={() => setIsRightPanelOpen(false)}>×</button>
            </div>
          </div>

          <div className="panel-tabs">
            {rightTabs.map((tab) => (
              <button key={tab} className={`panel-tab ${activeRightTab === tab ? "active" : ""}`} onClick={() => setActiveRightTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div className="property-form">
            <div className="form-group">
              <div className="form-row">
                <div className="form-label required">랙명</div>
                <div className="form-input-wrap"><input type="text" value={selectedRack.name} readOnly /></div>
              </div>
              <div className="form-row">
                <div className="form-label required">랙코드</div>
                <div className="form-input-wrap"><input type="text" value={selectedRack.code} readOnly /></div>
              </div>
              <div className="form-row">
                <div className="form-label required">구역</div>
                <div className="form-input-wrap">
                  <select>
                    <option>입고구역</option>
                    <option>피킹구역</option>
                    <option>출고구역</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-label">사용 여부</div>
                <div className="form-input-wrap switch-row">
                  <input type="checkbox" defaultChecked />
                  <span>사용중</span>
                </div>
              </div>
            </div>

            <div className="form-section-title">운영정보</div>
            <div className="form-group">
              <div className="form-row">
                <div className="form-label">랙 타입</div>
                <div className="form-input-wrap">
                  <select>
                    <option>일반랙</option>
                    <option>파렛트랙</option>
                    <option>중량랙</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-label">최대 적재량(kg)</div>
                <div className="form-input-wrap"><input type="text" value="1,000" readOnly /></div>
              </div>
              <div className="form-row">
                <div className="form-label">현재 적재량(kg)</div>
                <div className="form-input-wrap"><input type="text" value={selectedRack.currentLoad} readOnly /></div>
              </div>
              <div className="form-row">
                <div className="form-label">온도 구분</div>
                <div className="form-input-wrap">
                  <select>
                    <option>상온</option>
                    <option>냉장</option>
                    <option>냉동</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-label">혼재 가능 여부</div>
                <div className="form-input-wrap switch-row">
                  <input type="checkbox" defaultChecked />
                  <span>가능</span>
                </div>
              </div>
            </div>

            <div className="form-section-title">작업정보</div>
            <div className="form-group">
              <div className="form-row">
                <div className="form-label">피킹 가능</div>
                <div className="form-input-wrap switch-row">
                  <input type="checkbox" defaultChecked />
                  <span>가능</span>
                </div>
              </div>
              <div className="form-row">
                <div className="form-label">입고 가능</div>
                <div className="form-input-wrap switch-row">
                  <input type="checkbox" defaultChecked />
                  <span>가능</span>
                </div>
              </div>
              <div className="form-row">
                <div className="form-label">출고 가능</div>
                <div className="form-input-wrap switch-row">
                  <input type="checkbox" defaultChecked />
                  <span>가능</span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-footer">
            <Button variant="outline">복사</Button>
            <div className="right-btns">
              <Button variant="outline" className="danger-btn">삭제</Button>
              <Button>저장</Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
