import type { UserRole } from "./roles";

/* ============================================================
   역할별로 할 수 있는 일 — 서버와 같은 묶음.
   진짜 검사는 서버가 한다(안 되면 403 과 사유). 화면은 못 하는 단추를 미리 감추거나 막아
   눌렀다가 거절당하지 않게 할 뿐이다. 묶음을 바꾸면 서버 쪽도 같이 바꾼다.
   ============================================================ */

/** 입고예정 만들기 · 고치기 · 남은 수량 닫기 */
export const INBOUND_PLANNERS: readonly UserRole[] = ["admin", "logistics", "inbound", "sourcing"];

/** 도착(입고등록) · 창고·로케이션 지정 · 검수 · 입고확정 · 도착 취소 */
export const INBOUND_WORKERS: readonly UserRole[] = ["admin", "logistics", "inbound"];

/** 격납 */
export const PUTAWAY_WORKERS: readonly UserRole[] = ["admin", "logistics", "inbound", "inventory"];

/** 계정 관리 */
export const ACCOUNT_ADMINS: readonly UserRole[] = ["admin"];

export const can = (role: UserRole, allowed: readonly UserRole[]) => allowed.includes(role);
