import { USE_MOCK_API } from "../../services/apiMode";

/**
 * 3D 창고 지도를 서버에서 받을 수 있나.
 * 레이아웃 · 지도 검색 · 슬롯 상세 · 배치 초안/게시 API 가 아직 서버에 없다 — 실서버 빌드는 그 주소를
 * 부르지 않고 '준비 중'을 보인다 (오류 대신). 데모 빌드는 목 서버로 그대로 보인다.
 * 서버 쪽이 생기면 이 값을 true 로 바꾼다.
 */
export const WAREHOUSE_MAP_READY: boolean = USE_MOCK_API;
