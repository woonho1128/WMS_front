import { useCallback, useMemo } from "react";
import { resolveScreenPath } from "./menuConfig";
import { useAuthStore } from "./store/authStore";

/* ============================================================
   무엇을 할 수 있나 — 역할 이름이 아니라 "기능"으로 본다.
   기능 = 화면 하나 · 단추 하나 ("화면 주소:동작", 예 outbound/outbound-confirm:work).
   로그인 · /auth/me 가 내 기능 · 보이는 메뉴를 준다. 관리자가 권한을 바꾸면 응답 머리글의
   권한 버전이 바뀌고, 화면은 다시 받아 메뉴 · 단추를 다시 그린다 (다시 로그인 없이).
   진짜 검사는 서버가 한다 — 화면은 못 하는 단추를 미리 감추거나 막을 뿐이다.
   ============================================================ */

export type RoleRef = { code: string; name: string };

export type MenuScreen = { id: number; code: string; name: string; order: number };

/** 보이는 메뉴 묶음 — 관리자가 메뉴 관리에서 이름 · 순서 · 모듈을 고친 대로 */
export type MenuGroup = { id: number; code: string; name: string; order: number; screens: MenuScreen[] };

/** 로그인 응답의 user · GET /auth/me */
export type AccessUser = {
  id: string;
  name: string;
  /** 임시 비밀번호로 들어왔다 — 비밀번호부터 바꾼다 (그 전에는 서버가 다른 요청을 막는다) */
  mustChangePassword?: boolean;
  roles: RoleRef[];
  permissions: string[];
  features: string[];
  menus: MenuGroup[];
  /** 권한 버전 — 응답 머리글 X-Auth-Version 과 다르면 다시 받는다 */
  authVersion: number;
  /** 관리자 역할(시스템 역할 — 모든 기능) */
  admin: boolean;
};

export type Access = {
  features: ReadonlySet<string>;
  menus: MenuGroup[];
  roles: RoleRef[];
  admin: boolean;
};

const EMPTY: Access = { features: new Set(), menus: [], roles: [], admin: false };

/** 옛 모양(역할 하나)으로 저장된 로그인도 깨지지 않게 */
export const accessOf = (user: Partial<AccessUser> | null | undefined): Access => {
  if (!user) return EMPTY;
  return {
    features: new Set(Array.isArray(user.features) ? user.features : []),
    menus: Array.isArray(user.menus) ? user.menus : [],
    roles: Array.isArray(user.roles) ? user.roles : [],
    admin: Boolean(user.admin)
  };
};

/** 컴포넌트 밖에서 (스토어 · 탭 닫기 등) */
export const currentAccess = (): Access => accessOf(useAuthStore.getState().user);

/** 로그인한 사람의 기능 · 메뉴 — 권한이 바뀌면 다시 그려진다 */
export const useAccess = (): Access => {
  const user = useAuthStore((state) => state.user);
  return useMemo(() => accessOf(user), [user]);
};

/** 이 기능이 있나 (여러 개면 하나라도) */
export const hasFeature = (access: Access, ...features: string[]) => features.some((f) => access.features.has(f));

/** 단추 하나 — const canConfirm = useCan("outbound/outbound-confirm:work") */
export const useCan = (...features: string[]): boolean => {
  const access = useAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => hasFeature(access, ...features), [access, ...features]);
};

/**
 * 이 주소의 화면을 열 수 있나 — 대시보드 카드 · 행 · 알림이 권한 없는 화면으로 보내지 않게 (2026-10-30 입고 점검).
 * 화면이 쓰는 판정(FeaturePage · 분할 보기)과 같다. 주소 뒤 ?… #… 는 떼고 본다.
 *   const canOpen = useCanOpen(); canOpen("/stock/putaway")
 */
export const useCanOpen = () => {
  const access = useAccess();
  return useCallback(
    (to: string | null | undefined) => Boolean(to) && resolveScreenPath((to as string).split(/[?#]/)[0], access).status === "ok",
    [access]
  );
};

/** 화면 주소(경로)의 보기 기능 — "/outbound/picking" → "outbound/picking:view" */
export const viewFeatureOf = (path: string) => {
  const [section, feature] = path.split("/").filter(Boolean);
  return section && feature ? `${section}/${feature}:view` : "";
};

/** 역할 이름들 — "물류팀 · 입고 담당" */
export const roleNames = (roles: RoleRef[] | undefined) =>
  roles && roles.length ? roles.map((role) => role.name).join(" · ") : "역할 없음";
