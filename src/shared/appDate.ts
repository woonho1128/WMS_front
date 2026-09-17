/**
 * 화면 기본값(날짜 필터·오늘 기준)용 공용 날짜 헬퍼.
 *
 * 목(mock) 데모 모드에서는 시스템 시계 대신 목 시드 데이터의 기준일을 "오늘"로 사용한다.
 * 시드는 고정 날짜라서 실제 시계를 쓰면 날짜 필터 기본 범위가 시드를 전부 걸러버린다.
 * 실 백엔드 연동 모드에서는 시스템 시계를 그대로 쓴다.
 */
const API_BASE = (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL ?? "";
const USE_MOCK_API =
  ((import.meta.env as Record<string, string | undefined>).VITE_USE_MOCK_API ?? "").toLowerCase() === "true" ||
  !API_BASE;

/** 목 시드 데이터 기준일 — mockApi.ts 의 today 와 동일한 값 */
export const MOCK_TODAY = "2026-06-17";

/** 로컬 기준 yyyy-MM-dd (toISOString 의 UTC 밀림 방지) */
export const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 화면 기준 "오늘" — 목 모드면 시드 기준일, 실연동이면 시스템 시계 */
export const appToday = () => (USE_MOCK_API ? new Date(`${MOCK_TODAY}T00:00:00`) : new Date());

/** 화면 기준 "오늘" yyyy-MM-dd */
export const todayStr = () => fmtDate(appToday());

/** 오늘 기준 n일 이동한 yyyy-MM-dd (날짜 필터 기본 범위용) */
export const shiftDays = (n: number) => {
  const d = appToday();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

/** 화면 기준 "이번 달" yyyy-MM */
export const currentMonth = () => todayStr().slice(0, 7);

/** yyyy-MM-dd 에서 n일 이동한 yyyy-MM-dd */
export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** yyyy-MM-dd 의 요일 한 글자 (일~토) */
export const weekdayKo = (ymd: string) => WEEKDAYS_KO[new Date(`${ymd}T00:00:00`).getDay()] ?? "";
