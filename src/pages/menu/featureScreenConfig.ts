export type FeatureScreenConfig = {
  filters: string[];
  columns: string[];
  actions: string[];
};

const defaultConfig: FeatureScreenConfig = {
  filters: ["기간", "상태", "창고", "검색어"],
  columns: ["작업번호", "코드", "대상", "상태", "처리시간"],
  actions: ["조회", "필터", "엑셀", "새로고침"]
};

// 화면설계 기준: DOCS/WMS_화면설계_개발요청.md
// 전용 화면이 아직 없는 메뉴는 아래 정의로 "준비중" 패널(예정 필터/컬럼/액션)을 렌더링한다.
const configMap: Record<string, FeatureScreenConfig> = {
  // 1. 대시보드
  "inbound-status": {
    filters: ["기준일", "창고", "업체"],
    columns: ["PO번호", "업체", "예정수량", "확정수량", "격납대기", "상태"],
    actions: ["조회", "새로고침"]
  },
  "outbound-status": {
    filters: ["기준일", "창고", "배송사"],
    columns: ["오더번호", "납품처", "오더수량", "피킹상태", "출고상태"],
    actions: ["조회", "새로고침"]
  },
  "stock-status": {
    filters: ["창고", "품목", "재고유형"],
    columns: ["품목", "총재고", "가용재고", "불량재고", "장기재고"],
    actions: ["조회", "엑셀"]
  },
  // 2. 입고관리
  "inbound-confirm": {
    filters: ["입고일", "업체", "PO번호", "상태"],
    columns: ["PO번호", "업체", "품목", "예정수량", "실입고수량", "차이", "상태"],
    actions: ["검수", "QR라벨 출력", "수정요청", "입고확정"]
  },
  "return-schedule": {
    filters: ["오더번호", "담당자", "기간"],
    columns: ["반품오더번호", "거래처", "품목", "수량", "반품사유", "상태"],
    actions: ["조회", "새로고침"]
  },
  "return-confirm": {
    filters: ["오더번호", "담당자", "상태"],
    columns: ["반품오더번호", "거래처", "품목", "수량", "반품사유", "상태"],
    actions: ["승인", "반려", "격납대기 이동"]
  },
  // 3. 재고관리
  putaway: {
    filters: ["입고일", "창고", "품목"],
    columns: ["입고번호", "품목", "LOT", "수량", "추천 로케이션", "상태"],
    actions: ["로케이션 선택", "QR 확인", "격납 확정"]
  },
  replenishment: {
    filters: ["창고", "Zone", "긴급도"],
    columns: ["품목", "피킹로케이션", "현재고", "보충수량", "출발로케이션(FIFO)", "상태"],
    actions: ["QR 검증", "보충 이동", "보충 완료"]
  },
  "stock-available": {
    filters: ["창고", "로케이션", "품목", "LOT"],
    columns: ["창고", "로케이션", "품목", "LOT", "가용수량"],
    actions: ["조회", "엑셀"]
  },
  "stock-monthly": {
    filters: ["기준월", "창고", "품목"],
    columns: ["기준월", "품목", "WMS재고", "ERP재고", "차이"],
    actions: ["조회", "ERP 비교", "엑셀"]
  },
  stocktaking: {
    filters: ["실사일", "창고", "Zone"],
    columns: ["로케이션", "품목", "전산수량", "실물수량", "차이", "조정상태"],
    actions: ["실사 입력", "차이분석", "재고조정"]
  },
  "barcode-lookup": {
    filters: ["QR/바코드", "품목", "LOT"],
    columns: ["바코드", "품목", "LOT", "입고일자", "현재 로케이션", "최종 이동"],
    actions: ["스캔 조회", "이력 추적"]
  },
  // 4. 출고관리
  picking: {
    filters: ["오더번호", "구역", "작업자", "상태"],
    columns: ["오더번호", "피킹로케이션", "품목", "지시수량", "피킹수량", "상태"],
    actions: ["오더 QR스캔", "로케이션·품목 QR확인", "피킹 완료"]
  },
  "outbound-confirm": {
    filters: ["출고일", "오더번호", "상태"],
    columns: ["오더번호", "납품처", "수량", "ERP 전송", "상태"],
    actions: ["출고확정", "ERP 재전송", "예외처리"]
  },
  "delivery-note": {
    filters: ["출고일", "배송사", "납품처"],
    columns: ["오더번호", "납품처", "배송사", "차량", "송장번호", "출고수량"],
    actions: ["내역서 출력", "엑셀"]
  },
  // 5. 배차관리
  "dispatch-metro": {
    filters: ["배차일", "배송사", "차량유형"],
    columns: ["오더번호", "납품처", "중량", "부피", "추천차량", "배송사", "상태"],
    actions: ["차량 자동추천", "배송사 배정", "배차현황 출력"]
  },
  "dispatch-regional": {
    filters: ["배차일", "배송사", "권역"],
    columns: ["오더번호", "납품처", "파렛트", "중량", "배송사", "상태"],
    actions: ["자동계산", "배송사 화면공유", "CDC 출고현황"]
  },
  // 6. 기준정보관리
  "carrier-master": {
    filters: ["배송사", "사용여부"],
    columns: ["배송사코드", "배송사명", "담당자", "연락처", "계정권한", "사용여부"],
    actions: ["등록", "수정", "삭제"]
  },
  "stock-policy": {
    filters: ["정책항목", "사용여부"],
    columns: ["정책항목", "설정값", "적용대상", "수정일", "사용여부"],
    actions: ["정책 수정", "계산식 미리보기"]
  },
  // 7. 분석/집계
  "inbound-summary": {
    filters: ["기간(일/주/월)", "창고", "품목"],
    columns: ["기간", "품목", "입고건수", "입고수량", "전기대비"],
    actions: ["조회", "엑셀"]
  },
  "outbound-summary": {
    filters: ["기간(일/주/월)", "창고", "품목"],
    columns: ["기간", "품목", "출고건수", "출고수량", "전기대비"],
    actions: ["조회", "엑셀"]
  },
  shortage: {
    filters: ["창고", "품목", "위험도"],
    columns: ["품목", "평균출고량", "안전재고", "현재고", "발주시점", "쇼트예상일"],
    actions: ["조회", "알림 설정"]
  },
  "aging-stock": {
    filters: ["기준(1년 미출고)", "창고", "품목"],
    columns: ["품목", "LOT", "최종출고일", "경과일", "재고수량", "재고금액"],
    actions: ["조회", "엑셀"]
  },
  // 8. 이력관리
  "inbound-history": {
    filters: ["기간", "PO번호", "업체", "처리자"],
    columns: ["일시", "입고번호", "처리구분", "변경내용", "처리자", "ERP전송"],
    actions: ["조회", "엑셀"]
  },
  "transfer-history": {
    filters: ["기간", "이동유형", "로케이션"],
    columns: ["일시", "이동유형", "품목", "출발", "도착", "수량", "처리자"],
    actions: ["조회", "엑셀"]
  },
  "outbound-history": {
    filters: ["기간", "오더번호", "처리자"],
    columns: ["일시", "오더번호", "처리구분", "수량", "처리자", "ERP전송"],
    actions: ["조회", "엑셀"]
  },
  // 9. 커뮤니케이션
  notice: {
    filters: ["기간", "분류", "검색어"],
    columns: ["등록일", "분류", "제목", "작성자", "첨부"],
    actions: ["조회", "새로고침"]
  },
  "ai-chatbot": {
    filters: ["질문유형"],
    columns: ["시각", "질문", "응답 요약", "데이터 소스"],
    actions: ["질문하기", "작업가이드"]
  }
};

export const getFeatureScreenConfig = (featureSlug: string): FeatureScreenConfig =>
  configMap[featureSlug] ?? defaultConfig;
