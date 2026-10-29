/* ============================================================
   목(mock) — 사용자 관리 · 내 비밀번호 바꾸기
   서버 AccountService 와 같은 규칙:
   · 사용자 관리 기능(시스템관리 — 관리자 역할만) · 지우지 않고 잠근다
   · 역할은 여러 개 — 바꿔도 그 사람의 로그인은 이어지고 다음 요청부터 새 역할 (권한 목 mockAccess)
   · 비밀번호는 임시로 발급 → 받은 사람이 첫 로그인 때 바꾼다
   · 내 계정은 잠그거나 역할을 바꾸거나 초기화하지 못한다 · 마지막 관리자는 잠그거나 내리지 못한다
   ⚠ 목이라 메모리에만 있다 — 새로고침하면 처음 계정으로 돌아간다. 비밀번호는 데모 값이다.
   ============================================================ */

import type { AccountRow } from "./accessApi";
import type { LoginResult } from "./authService";
import type { AccessMock } from "./mockAccess";

type AnyRecord = Record<string, any>;

export type MockAccount = {
  password: string;
  id: string;
  name: string;
  mustChangePassword?: boolean;
  locked?: boolean;
  lastLoginAt?: string | null;
  passwordChangedAt?: string | null;
  lockedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type AccountMockCtx = {
  accounts: Record<string, MockAccount>;
  access: () => AccessMock;
  me: () => string | undefined;
  now: () => string;
};

const ID = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const TEMP_LETTERS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_DIGITS = "23456789";

const temporary = () => {
  const all = TEMP_LETTERS + TEMP_DIGITS;
  const chars = Array.from({ length: 10 }, () => all[Math.floor(Math.random() * all.length)]);
  chars[0] = TEMP_LETTERS[Math.floor(Math.random() * TEMP_LETTERS.length)];
  chars[5] = TEMP_DIGITS[Math.floor(Math.random() * TEMP_DIGITS.length)];
  return chars.join("");
};

export const passwordProblem = (id: string, password: string) => {
  if (!password) return "새 비밀번호를 넣어 주세요.";
  if (password !== password.trim()) return "비밀번호 앞뒤에 빈칸을 넣을 수 없습니다.";
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (password.length > 64) return "비밀번호가 너무 깁니다 (영문 · 숫자 64자까지).";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "비밀번호에 영문과 숫자를 섞어 주세요.";
  if (password.toLowerCase() === id.toLowerCase()) return "아이디와 같은 비밀번호는 쓸 수 없습니다.";
  return null;
};

export function createAccountMock(ctx: AccountMockCtx) {
  const access = () => ctx.access();
  const view = (a: MockAccount): AccountRow => ({
    id: a.id,
    name: a.name,
    roles: access().rolesOfUser(a.id),
    locked: Boolean(a.locked),
    mustChangePassword: Boolean(a.mustChangePassword),
    lastLoginAt: a.lastLoginAt ?? null,
    passwordChangedAt: a.passwordChangedAt ?? null,
    lockedAt: a.lockedAt ?? null,
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
    updatedBy: a.updatedBy ?? null
  });

  const find = (id: string) => {
    const account = ctx.accounts[decodeURIComponent(id).trim().toLowerCase()];
    if (!account) throw new Error(`계정을 찾을 수 없습니다: ${id}`);
    return account;
  };
  const isMe = (a: MockAccount) => (ctx.me() ?? "").toLowerCase() === a.id.toLowerCase();
  const isLocked = (userId: string) => Boolean(ctx.accounts[userId]?.locked);
  const requireAnotherAdmin = (a: MockAccount) => {
    if (access().isAdmin(a.id) && access().activeAdminCount(isLocked) <= 1) {
      throw new Error("마지막 관리자입니다 — 다른 관리자 계정을 먼저 만들어 두세요.");
    }
  };
  const nameOf = (raw: unknown) => {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("이름을 넣으세요.");
    if (name.length > 50) throw new Error("이름은 50자까지입니다.");
    return name;
  };

  return {
    get: (clean: string): unknown => {
      if (clean !== "/accounts") return undefined;
      access().requireFeature("system/users:view");
      return Object.values(ctx.accounts)
        .map(view)
        .sort((a, b) => Number(a.locked) - Number(b.locked) || a.id.localeCompare(b.id));
    },

    /** [결과, 서버와 같은 메시지] */
    mutate: (method: string, clean: string, body: AnyRecord): [unknown, string] | undefined => {
      if (method === "PUT" && clean === "/me/password") {
        const account = ctx.accounts[(ctx.me() ?? "").toLowerCase()];
        if (!account) throw new Error("로그인이 끊겼습니다 — 다시 로그인하세요.");
        if (account.password !== body.currentPassword) throw new Error("지금 비밀번호가 맞지 않습니다.");
        const problem = passwordProblem(account.id, String(body.newPassword ?? ""));
        if (problem) throw new Error(problem);
        if (body.newPassword === body.currentPassword) throw new Error("지금과 다른 비밀번호를 넣어 주세요.");
        account.password = String(body.newPassword);
        account.mustChangePassword = false;
        account.passwordChangedAt = ctx.now();
        const result: LoginResult = {
          user: access().me(account.id, account.name, false),
          token: `mock-jwt-${account.id}-${Date.now()}`
        };
        return [result, "비밀번호를 바꿨습니다."];
      }

      if (!clean.startsWith("/accounts")) return undefined;
      access().requireFeature("system/users:work");

      if (method === "POST" && clean === "/accounts") {
        const id = String(body.id ?? "").trim().toLowerCase();
        if (!ID.test(id)) throw new Error("아이디는 영문 소문자 · 숫자로 시작하고, 영문 소문자 · 숫자 · . _ - 로 3~30자입니다.");
        const name = nameOf(body.name);
        const roles = access().checkRoles(body.roles);
        if (ctx.accounts[id]) throw new Error(`이미 있는 아이디입니다: ${id}`);
        const temp = temporary();
        const account: MockAccount = { password: temp, id, name, mustChangePassword: true, createdAt: ctx.now(), passwordChangedAt: ctx.now() };
        ctx.accounts[id] = account;
        access().forget(id);
        access().setUserRoles(id, roles, { newAccount: true, locked: false, isLocked });
        return [{ account: view(account), temporaryPassword: temp }, `${id} 계정을 만들었습니다 — 임시 비밀번호를 전해 주세요.`];
      }

      const match = clean.match(/^\/accounts\/([^/]+)(?:\/(lock|unlock|reset-password))?$/);
      if (!match) return undefined;
      const account = find(match[1]);
      const action = match[2];

      if (method === "PUT" && !action) {
        const name = body.name == null ? account.name : nameOf(body.name);
        if (body.roles != null) access().setUserRoles(account.id, body.roles, { newAccount: false, locked: Boolean(account.locked), isLocked });
        if (name !== account.name) {
          account.name = name;
          account.updatedAt = ctx.now();
          account.updatedBy = ctx.me() ?? null;
        }
        return [view(account), "저장했습니다 — 역할은 다시 로그인 없이 바로 적용됩니다."];
      }
      if (method === "POST" && action === "lock") {
        if (isMe(account)) throw new Error("내 계정은 잠글 수 없습니다.");
        if (!account.locked) {
          requireAnotherAdmin(account);
          account.locked = true;
          account.lockedAt = ctx.now();
        }
        return [view(account), `${account.id} 계정을 잠갔습니다 — 로그인과 열려 있던 화면이 모두 막힙니다.`];
      }
      if (method === "POST" && action === "unlock") {
        account.locked = false;
        account.lockedAt = null;
        return [view(account), `${account.id} 계정의 잠금을 풀었습니다.`];
      }
      if (method === "POST" && action === "reset-password") {
        if (isMe(account)) throw new Error("내 비밀번호는 '비밀번호 바꾸기'에서 바꿉니다.");
        const temp = temporary();
        account.password = temp;
        account.mustChangePassword = true;
        account.passwordChangedAt = ctx.now();
        return [{ account: view(account), temporaryPassword: temp }, `${account.id} 의 비밀번호를 초기화했습니다 — 임시 비밀번호를 전해 주세요.`];
      }
      return undefined;
    }
  };
}
