import React, { useState, useMemo } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import "./InspectionPage.css";

// 검수 품목 타입 정의
interface InspectionItem {
  id: string;
  barcode: string;
  name: string;
  sku: string;
  spec: string;
  unit: string;
  supplier: string;
  orderedQty: number;
  checkedQty: number;
  status: "WAIT" | "IN_PROGRESS" | "DONE";
}

// 초기 Mock 데이터
const INITIAL_ITEMS: InspectionItem[] = [
  {
    id: "INS-001",
    barcode: "8801056020011",
    name: "프리미엄 세탁세제 2.5L",
    sku: "SKU-DET-001",
    spec: "2.5L * 4ea/BOX",
    unit: "BOX",
    supplier: "(주)대림케미칼",
    orderedQty: 50,
    checkedQty: 0,
    status: "WAIT"
  },
  {
    id: "INS-002",
    barcode: "8801116002100",
    name: "친환경 주방세제 리필",
    sku: "SKU-DET-002",
    spec: "500ml * 10ea/BOX",
    unit: "BOX",
    supplier: "(주)대림케미칼",
    orderedQty: 120,
    checkedQty: 0,
    status: "WAIT"
  },
  {
    id: "INS-003",
    barcode: "8809022340552",
    name: "극세사 다용도 타월",
    sku: "SKU-TOW-099",
    spec: "50 * 50cm, 20ea/PK",
    unit: "PK",
    supplier: "한일텍스타일",
    orderedQty: 80,
    checkedQty: 80,
    status: "DONE"
  },
  {
    id: "INS-004",
    barcode: "8801043015409",
    name: "초강력 다목적 세정제",
    sku: "SKU-DET-005",
    spec: "750ml * 8ea/BOX",
    unit: "BOX",
    supplier: "(주)대림케미칼",
    orderedQty: 30,
    checkedQty: 10,
    status: "IN_PROGRESS"
  },
  {
    id: "INS-005",
    barcode: "8809543210984",
    name: "공업용 스트레치 랩",
    sku: "SKU-WRP-100",
    spec: "500mm * 450m",
    unit: "ROLL",
    supplier: "대양패키징",
    orderedQty: 200,
    checkedQty: 0,
    status: "WAIT"
  }
];

export const InspectionPage = () => {
  const [items, setItems] = useState<InspectionItem[]>(INITIAL_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState<string>("INS-001");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "detail">("list"); // 모바일 뷰 전환용 탭

  // 검수 입력 폼 상태
  const [passQty, setPassQty] = useState(0);
  const [failQty, setFailQty] = useState(0);
  const [judgement, setJudgement] = useState<"PASS" | "FAIL" | "HOLD">("PASS");
  const [defectReason, setDefectReason] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);

  // 현재 선택된 검수 물품 정보
  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId);
  }, [items, selectedItemId]);

  // 선택 품목 변경 시 폼 초기화
  const handleSelectItem = (item: InspectionItem) => {
    setSelectedItemId(item.id);
    setPassQty(item.orderedQty - item.checkedQty);
    setFailQty(0);
    setJudgement("PASS");
    setDefectReason("");
    setMemo("");
    setAttachedPhoto(null);
    setActiveTab("detail"); // 모바일에서는 상세로 탭 전환
  };

  // 바코드 및 품목명 검색
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const term = searchTerm.toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        item.barcode.includes(term) ||
        item.sku.toLowerCase().includes(term)
      );
    });
  }, [items, searchTerm]);

  // 바코드 수동 입력/검색 처리
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    const found = items.find(
      (item) =>
        item.barcode === searchTerm.trim() ||
        item.sku.toLowerCase() === searchTerm.trim().toLowerCase()
    );

    if (found) {
      handleSelectItem(found);
      setSearchTerm("");
    } else {
      alert("해당 바코드 또는 품목코드로 등록된 검수 품목을 찾을 수 없습니다.");
    }
  };

  // 수량 가감 헬퍼
  const adjustPassQty = (amount: number) => {
    if (!selectedItem) return;
    const maxQty = selectedItem.orderedQty - selectedItem.checkedQty;
    const nextQty = passQty + amount;
    if (nextQty >= 0 && nextQty + failQty <= maxQty) {
      setPassQty(nextQty);
    }
  };

  const adjustFailQty = (amount: number) => {
    if (!selectedItem) return;
    const maxQty = selectedItem.orderedQty - selectedItem.checkedQty;
    const nextQty = failQty + amount;
    if (nextQty >= 0 && passQty + nextQty <= maxQty) {
      setFailQty(nextQty);
      if (nextQty > 0 && judgement === "PASS") {
        setJudgement("FAIL");
      } else if (nextQty === 0 && judgement === "FAIL") {
        setJudgement("PASS");
      }
    }
  };

  // 전체 정상 처리 버튼
  const handleSetAllPass = () => {
    if (!selectedItem) return;
    const maxQty = selectedItem.orderedQty - selectedItem.checkedQty;
    setPassQty(maxQty);
    setFailQty(0);
    setJudgement("PASS");
  };

  // 품질 판정 버튼 핸들러
  const handleSelectJudgement = (type: "PASS" | "FAIL" | "HOLD") => {
    setJudgement(type);
    if (type === "PASS") {
      setDefectReason("");
    }
  };

  // 파일 업로드 시뮬레이션
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 검수 저장 처리
  const handleSaveInspection = () => {
    if (!selectedItem) return;
    const totalInput = passQty + failQty;
    if (totalInput === 0) {
      alert("검수할 수량을 입력해주세요.");
      return;
    }

    const nextCheckedForSelected = Math.min(selectedItem.checkedQty + totalInput, selectedItem.orderedQty);
    const selectedHasRemaining = nextCheckedForSelected < selectedItem.orderedQty;

    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === selectedItem.id) {
          const nextChecked = Math.min(item.checkedQty + totalInput, item.orderedQty);
          const isDone = nextChecked >= item.orderedQty;
          return {
            ...item,
            checkedQty: nextChecked,
            status: isDone ? "DONE" : "IN_PROGRESS"
          };
        }
        return item;
      })
    );

    alert(`검수가 성공적으로 저장되었습니다.\n- 정상: ${passQty}ea\n- 불량: ${failQty}ea\n- 판정: ${judgement}`);

    if (selectedHasRemaining) {
      setPassQty(selectedItem.orderedQty - nextCheckedForSelected);
      setFailQty(0);
      setJudgement("PASS");
      setDefectReason("");
      setMemo("");
      setAttachedPhoto(null);
      setActiveTab("detail");
      return;
    }

    const remainingItems = items.filter(
      (item) => item.id !== selectedItem.id && item.status !== "DONE"
    );
    if (remainingItems.length > 0) {
      handleSelectItem(remainingItems[0]);
    } else {
      setActiveTab("list");
    }
  };

  // 현황 요약 데이터 계산
  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "DONE").length;
    const wait = items.filter((i) => i.status === "WAIT").length;
    const progress = items.filter((i) => i.status === "IN_PROGRESS").length;
    
    let totalOrdered = 0;
    let totalChecked = 0;
    items.forEach((i) => {
      totalOrdered += i.orderedQty;
      totalChecked += i.checkedQty;
    });

    const completionRate = totalOrdered > 0 ? Math.round((totalChecked / totalOrdered) * 100) : 0;

    return { total, done, wait, progress, completionRate };
  }, [items]);

  return (
    <section className="inspection-container">
      {/* 1. 상단 통계 현황판 */}
      <div className="inspection-stats-grid">
        <DashboardCard className="stat-card">
          <div className="stat-icon info">📋</div>
          <div className="stat-details">
            <span className="stat-label">총 검수 품목</span>
            <span className="stat-value">{stats.total} <small>종</small></span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon warning">⏳</div>
          <div className="stat-details">
            <span className="stat-label">대기 / 진행중</span>
            <span className="stat-value">
              {stats.wait} <small>대기</small> / {stats.progress} <small>진행</small>
            </span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon success">✅</div>
          <div className="stat-details">
            <span className="stat-label">완료 품목</span>
            <span className="stat-value">{stats.done} <small>종</small></span>
          </div>
        </DashboardCard>
        <DashboardCard className="stat-card">
          <div className="stat-icon primary">📈</div>
          <div className="stat-details">
            <span className="stat-label">전체 진척률</span>
            <span className="stat-value">{stats.completionRate}%</span>
          </div>
        </DashboardCard>
      </div>

      {/* 모바일 화면용 탭 네비게이션 */}
      <div className="mobile-tabs-header">
        <button
          type="button"
          className={`tab-btn ${activeTab === "list" ? "active" : ""}`}
          onClick={() => setActiveTab("list")}
        >
          검수 대기 목록 ({filteredItems.filter((i) => i.status !== "DONE").length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "detail" ? "active" : ""}`}
          onClick={() => setActiveTab("detail")}
          disabled={!selectedItem}
        >
          실시간 검수 작업대
        </button>
      </div>

      {/* 2. 메인 워크스페이스 레이아웃 */}
      <div className={`inspection-main-grid show-${activeTab}`}>
        
        {/* 좌측 영역: 품목 대기 리스트 */}
        <DashboardCard
          className="inspection-list-section"
          title="검수 품목 목록"
          action={<span className="badge">{filteredItems.length}건</span>}
        >
          <form onSubmit={handleSearchSubmit} className="inspection-search-box">
            <input
              type="text"
              placeholder="바코드 또는 SKU 코드를 직접 스캔/입력"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button type="submit" className="search-btn">
              🔍
            </button>
          </form>

          <div className="inspection-list-scroll">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`inspection-item-card ${
                  selectedItemId === item.id ? "active" : ""
                } status-${item.status}`}
                onClick={() => handleSelectItem(item)}
              >
                <div className="card-top">
                  <span className={`status-badge ${item.status}`}>
                    {item.status === "DONE"
                      ? "완료"
                      : item.status === "IN_PROGRESS"
                      ? "진행중"
                      : "대기"}
                  </span>
                  <span className="item-sku">{item.sku}</span>
                </div>
                <h4 className="item-name">{item.name}</h4>
                <div className="card-bottom">
                  <span className="item-barcode">📟 {item.barcode}</span>
                  <span className="qty-info">
                    <strong>{item.checkedQty}</strong> / {item.orderedQty} {item.unit}
                  </span>
                </div>
                {/* 진행 상태 바 */}
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.round((item.checkedQty / item.orderedQty) * 100)}%`
                    }}
                  />
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="empty-state">검색 결과가 없습니다.</div>
            )}
          </div>
        </DashboardCard>

        {/* 우측 영역: 검수 상세 작업대 */}
        <DashboardCard
          className="inspection-detail-section"
          title="검수 상세 입력"
          action={selectedItem ? <span className="barcode-tag">📟 {selectedItem.barcode}</span> : undefined}
        >
          {selectedItem ? (
            <>
              <div className="selected-item-info">
                <div className="info-main">
                  <h4>{selectedItem.name}</h4>
                  <span className="supplier-label">{selectedItem.supplier}</span>
                </div>
                <div className="info-grid">
                  <div className="info-cell">
                    <span className="label">SKU 코드</span>
                    <span className="value">{selectedItem.sku}</span>
                  </div>
                  <div className="info-cell">
                    <span className="label">규격</span>
                    <span className="value">{selectedItem.spec}</span>
                  </div>
                  <div className="info-cell">
                    <span className="label">검수 단위</span>
                    <span className="value">{selectedItem.unit}</span>
                  </div>
                  <div className="info-cell">
                    <span className="label">총 지시 수량</span>
                    <span className="value">{selectedItem.orderedQty}</span>
                  </div>
                  <div className="info-cell">
                    <span className="label">기 검수 완료</span>
                    <span className="value font-accent">{selectedItem.checkedQty}</span>
                  </div>
                  <div className="info-cell">
                    <span className="label">남은 잔량</span>
                    <span className="value font-primary">
                      {selectedItem.orderedQty - selectedItem.checkedQty}
                    </span>
                  </div>
                </div>
              </div>

              {/* 검수 수량 입력 */}
              <div className="inspection-input-form">
                <div className="form-group">
                  <div className="qty-adjust-container">
                    <div className="qty-box">
                      <label>정상 수량 (합격)</label>
                      <div className="qty-controller">
                        <button
                          type="button"
                          className="qty-btn minus"
                          onClick={() => adjustPassQty(-1)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={passQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const max = selectedItem.orderedQty - selectedItem.checkedQty;
                            if (val >= 0 && val + failQty <= max) {
                              setPassQty(val);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="qty-btn plus"
                          onClick={() => adjustPassQty(1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="qty-box">
                      <label>불량 수량 (폐기/반품)</label>
                      <div className="qty-controller defect">
                        <button
                          type="button"
                          className="qty-btn minus"
                          onClick={() => adjustFailQty(-1)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={failQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const max = selectedItem.orderedQty - selectedItem.checkedQty;
                            if (val >= 0 && passQty + val <= max) {
                              setFailQty(val);
                              if (val > 0 && judgement === "PASS") setJudgement("FAIL");
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="qty-btn plus"
                          onClick={() => adjustFailQty(1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    className="btn-all-pass"
                    onClick={handleSetAllPass}
                  >
                    ⚡ 잔량 전체 정상 처리
                  </button>
                </div>

                {/* 품질 상태 판정 */}
                <div className="form-group">
                  <label className="section-subtitle">품질 최종 판정</label>
                  <div className="judgement-selector">
                    <button
                      type="button"
                      className={`judge-btn pass ${judgement === "PASS" ? "active" : ""}`}
                      onClick={() => handleSelectJudgement("PASS")}
                    >
                      🟢 양호 (Pass)
                    </button>
                    <button
                      type="button"
                      className={`judge-btn fail ${judgement === "FAIL" ? "active" : ""}`}
                      onClick={() => handleSelectJudgement("FAIL")}
                    >
                      🔴 불량 (Fail)
                    </button>
                    <button
                      type="button"
                      className={`judge-btn hold ${judgement === "HOLD" ? "active" : ""}`}
                      onClick={() => handleSelectJudgement("HOLD")}
                    >
                      🟡 보류 (Hold)
                    </button>
                  </div>
                </div>

                {/* 불량 판정 시 추가 입력 필드 */}
                {(judgement === "FAIL" || failQty > 0) && (
                  <div className="defect-detail-panel slide-down">
                    <label className="section-subtitle">불량 사유 선택</label>
                    <div className="defect-reasons-grid">
                      {["포장 파손", "본체 스크래치", "오배송/사양 다름", "유통기한 경과", "오염/변색", "기타"].map(
                        (reason) => (
                          <button
                            key={reason}
                            type="button"
                            className={`reason-chip ${
                              defectReason === reason ? "active" : ""
                            }`}
                            onClick={() => setDefectReason(reason)}
                          >
                            {reason}
                          </button>
                        )
                      )}
                    </div>

                    <div className="photo-upload-container">
                      <label className="section-subtitle">현장 증빙 사진 첨부 (Mock)</label>
                      <div className="photo-upload-box">
                        <input
                          type="file"
                          accept="image/*"
                          id="inspection-photo"
                          onChange={handlePhotoUpload}
                          style={{ display: "none" }}
                        />
                        <label htmlFor="inspection-photo" className="upload-placeholder">
                          {attachedPhoto ? (
                            <img src={attachedPhoto} alt="증빙" className="preview-img" />
                          ) : (
                            <>
                              <span className="upload-icon">📸</span>
                              <span>터치하여 카메라 촬영/사진 업로드</span>
                            </>
                          )}
                        </label>
                        {attachedPhoto && (
                          <button
                            type="button"
                            className="delete-photo-btn"
                            onClick={() => setAttachedPhoto(null)}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 추가 메모 */}
                <div className="form-group">
                  <label className="section-subtitle font-sm">특이사항 및 메모</label>
                  <textarea
                    className="inspection-memo"
                    placeholder="검수 과정에서 기록할 특이사항을 입력하세요..."
                    rows={3}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>

                {/* 최종 저장 액션 */}
                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      if (activeTab === "detail") setActiveTab("list");
                    }}
                  >
                    목록으로
                  </button>
                  <button
                    type="button"
                    className="save-btn"
                    onClick={handleSaveInspection}
                  >
                    💾 검수 결과 저장
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-workbench">
              <span className="empty-icon">👈</span>
              <p>좌측 목록에서 검수할 품목을 선택하거나 바코드를 검색해주세요.</p>
            </div>
          )}
        </DashboardCard>
      </div>
    </section>
  );
};
