import type { MenuGroup, RoleRef } from "../app/access";
import { apiGet, apiSend } from "./http";

/* ============================================================
   시스템관리 — 사용자 · 메뉴 · 권한 관리 API (서버 /api/access/** · /api/accounts)
   기능 = 화면 하나 · 단추 하나 (코드가 정한다), 권한 = 기능의 묶음, 역할 = 권한의 묶음.
   저장하면 다음 요청부터 바로 적용된다 — 재시작 · 다시 로그인 없이.
   ============================================================ */

export type PermissionKind = "VIEW" | "WORK" | "SPECIAL";
export type FeatureKind = "VIEW" | "WORK" | "BUTTON";

export type RoleView = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  /** 관리자 — 모든 기능 · 잠김 */
  system: boolean;
  /** 바깥 사람(배송사) — 권한을 넣으면 경고 */
  outside: boolean;
  active: boolean;
  order: number;
  permissionCodes: string[];
  userCount: number;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type PermissionView = {
  code: string;
  name: string;
  description: string | null;
  module: string;
  kind: PermissionKind;
  /** 계정 · 권한 관리 — 잠김 */
  system: boolean;
  active: boolean;
  order: number;
  featureCodes: string[];
  roleCodes: string[];
  userCount: number;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type FeatureView = { code: string; action: string; kind: FeatureKind; name: string; label: string };

export type ScreenView = {
  id: number;
  code: string;
  parentId: number | null;
  name: string;
  /** 코드의 원래 이름 */
  defaultName: string | null;
  order: number;
  active: boolean;
  /** 업무 연락처럼 로그인만 보는 화면 — 기능이 없다 */
  loginOnly: boolean;
  system: boolean;
  features: FeatureView[];
  /** 이 화면의 보기를 담은 권한 */
  openers: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ModuleView = {
  id: number;
  code: string;
  name: string;
  defaultName: string | null;
  order: number;
  active: boolean;
  system: boolean;
  /** 관리자가 만든 묶음 */
  custom: boolean;
  screens: ScreenView[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type PermissionGrant = { code: string; name: string; viaRoles: string[] };

export type UserAccessView = {
  id: string;
  name: string;
  roles: RoleRef[];
  permissions: PermissionGrant[];
  features: string[];
  menus: MenuGroup[];
  admin: boolean;
};

export type HistKind = "permission" | "role" | "user" | "menu";

export type HistView = {
  kind: HistKind;
  histId: number;
  targetKey: string;
  targetName: string | null;
  changedBy: string;
  changedAt: string;
  first: boolean;
  active: boolean | null;
  items: string[];
  added: string[];
  removed: string[];
  notes: string[];
};

export type Saved = { changed: boolean; authVersion: number; key: string };

export type RoleRequest = {
  name?: string;
  description?: string;
  outside?: boolean;
  active?: boolean;
  sortOrder?: number;
  permissionCodes?: string[];
  copyFrom?: number;
};

export type PermissionRequest = {
  name?: string;
  description?: string;
  module?: string;
  kind?: PermissionKind;
  active?: boolean;
  featureCodes?: string[];
  copyFrom?: string;
};

export type MenuRequest = { name?: string; sortOrder?: number; active?: boolean; parentId?: number };

/** 사용자 관리 목록 한 줄 */
export type AccountRow = {
  id: string;
  name: string;
  roles: string[];
  locked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  lockedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type AccountIssued = { account: AccountRow; temporaryPassword: string };

export const accessApi = {
  roles: () => apiGet<RoleView[]>("/access/roles"),
  createRole: (body: RoleRequest) => apiSend<Saved>("POST", "/access/roles", body),
  updateRole: (id: number, body: RoleRequest) => apiSend<Saved>("PUT", `/access/roles/${id}`, body),

  permissions: () => apiGet<PermissionView[]>("/access/permissions"),
  createPermission: (body: PermissionRequest) => apiSend<Saved>("POST", "/access/permissions", body),
  updatePermission: (code: string, body: PermissionRequest) =>
    apiSend<Saved>("PUT", `/access/permissions/${encodeURIComponent(code)}`, body),

  menus: () => apiGet<ModuleView[]>("/access/menus"),
  createModule: (body: MenuRequest) => apiSend<Saved>("POST", "/access/menus", body),
  updateMenu: (id: number, body: MenuRequest) => apiSend<Saved>("PUT", `/access/menus/${id}`, body),
  setOpeners: (id: number, permissionCodes: string[]) =>
    apiSend<Saved>("PUT", `/access/menus/${id}/openers`, { permissionCodes }),
  menuHistory: (id: number) => apiGet<HistView[]>(`/access/menus/${id}/history`),

  history: (kind: HistKind, key?: string | number, limit = 200) =>
    apiGet<HistView[]>(`/access/history?kind=${kind}${key != null ? `&key=${encodeURIComponent(String(key))}` : ""}&limit=${limit}`),

  accounts: () => apiGet<AccountRow[]>("/accounts"),
  userAccess: (id: string) => apiGet<UserAccessView>(`/accounts/${encodeURIComponent(id)}/access`),
  createAccount: (body: { id: string; name: string; roles: string[] }) => apiSend<AccountIssued>("POST", "/accounts", body),
  updateAccount: (id: string, body: { name?: string; roles?: string[] }) =>
    apiSend<AccountRow>("PUT", `/accounts/${encodeURIComponent(id)}`, body),
  lockAccount: (id: string) => apiSend<AccountRow>("POST", `/accounts/${encodeURIComponent(id)}/lock`, {}),
  unlockAccount: (id: string) => apiSend<AccountRow>("POST", `/accounts/${encodeURIComponent(id)}/unlock`, {}),
  resetPassword: (id: string) => apiSend<AccountIssued>("POST", `/accounts/${encodeURIComponent(id)}/reset-password`, {})
};
