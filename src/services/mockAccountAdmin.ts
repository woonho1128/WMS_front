/* ============================================================
   목(mock) — 계정 관리 · 내 비밀번호 바꾸기
   서버 AccountService 와 같은 규칙:
   · 관리자만 (데모는 머리글의 역할 선택을 따른다) · 지우지 않고 잠근다
   · 비밀번호는 임시로 발급 → 받은 사람이 첫 로그인 때 바꾼다
   · 내 계정은 잠그거나 역할을 바꾸거나 초기화하지 못한다 · 마지막 관리자는 잠그거나 내리지 못한다
   ⚠ 목이라 메모리에만 있다 — 새로고침하면 처음 계정으로 돌아간다. 비밀번호는 데모 값이다.
   ============================================================ */

import type { AuthUser, LoginResult } from "./authService";

type AnyRecord = Record<string, any>;

export type MockAccount = {
  password: string;
  user: AuthUser;
  locked?: boolean;
  lastLoginAt?: string | null;
  passwordChangedAt?: string | null;
  lockedAt?: string | null;
  createdAt?: string | null;
};

export type AccountMockCtx = {
  accounts: Record<string, MockAccount>;
  role: () => string | undefined;
  me: () => string | undefined;
  now: () => string;
  roles: readonly string[];
};

const ADMINS_ONLY = "계정 관리는 관리자만 할 수 있습니다.";
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
  const view = (a: MockAccount) => ({
    id: a.user.id,
    name: a.user.name,
    role: a.user.role,
    locked: Boolean(a.locked),
    mustChangePassword: Boolean(a.user.mustChangePassword),
    lastLoginAt: a.lastLoginAt ?? null,
    passwordChangedAt: a.passwordChangedAt ?? null,
    lockedAt: a.lockedAt ?? null,
    createdAt: a.createdAt ?? null,
    updatedAt: null,
    updatedBy: null
  });

  const requireAdmin = () => {
    if (ctx.role() !== "admin") throw new Error(ADMINS_ONLY);
  };
  const find = (id: string) => {
    const account = ctx.accounts[decodeURIComponent(id).trim().toLowerCase()];
    if (!account) throw new Error(`계정을 찾을 수 없습니다: ${id}`);
    return account;
  };
  const isMe = (a: MockAccount) => (ctx.me() ?? "").toLowerCase() === a.user.id.toLowerCase();
  const requireAnotherAdmin = () => {
    const active = Object.values(ctx.accounts).filter((a) => a.user.role === "admin" && !a.locked).length;
    if (active <= 1) throw new Error("마지막 관리자입니다 — 다른 관리자 계정을 먼저 만들어 두세요.");
  };
  const nameOf = (raw: unknown) => {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("이름을 넣으세요.");
    if (name.length > 50) throw new Error("이름은 50자까지입니다.");
    return name;
  };
  const roleOf = (raw: unknown) => {
    const role = String(raw ?? "").trim().toLowerCase();
    if (!ctx.roles.includes(role)) throw new Error(`모르는 역할입니다: ${raw}`);
    return role as AuthUser["role"];
  };

  return {
    get: (clean: string): unknown => {
      if (clean !== "/accounts") return undefined;
      requireAdmin();
      return Object.values(ctx.accounts)
        .map(view)
        .sort((a, b) => Number(a.locked) - Number(b.locked) || a.id.localeCompare(b.id));
    },

    mutate: (method: string, clean: string, body: AnyRecord): unknown => {
      if (method === "PUT" && clean === "/me/password") {
        const account = ctx.accounts[(ctx.me() ?? "").toLowerCase()];
        if (!account) throw new Error("로그인이 끊겼습니다 — 다시 로그인하세요.");
        if (account.password !== body.currentPassword) throw new Error("지금 비밀번호가 맞지 않습니다.");
        const problem = passwordProblem(account.user.id, String(body.newPassword ?? ""));
        if (problem) throw new Error(problem);
        if (body.newPassword === body.currentPassword) throw new Error("지금과 다른 비밀번호를 넣어 주세요.");
        account.password = String(body.newPassword);
        account.user = { ...account.user, mustChangePassword: false };
        account.passwordChangedAt = ctx.now();
        const result: LoginResult = { user: { ...account.user }, token: `mock-jwt-${account.user.id}-${Date.now()}` };
        return result;
      }

      if (!clean.startsWith("/accounts")) return undefined;
      requireAdmin();

      if (method === "POST" && clean === "/accounts") {
        const id = String(body.id ?? "").trim().toLowerCase();
        if (!ID.test(id)) throw new Error("아이디는 영문 소문자 · 숫자로 시작하고, 영문 소문자 · 숫자 · . _ - 로 3~30자입니다.");
        const name = nameOf(body.name);
        const role = roleOf(body.role);
        if (ctx.accounts[id]) throw new Error(`이미 있는 아이디입니다: ${id}`);
        const temp = temporary();
        const account: MockAccount = {
          password: temp,
          user: { id, name, role, mustChangePassword: true },
          createdAt: ctx.now(),
          passwordChangedAt: ctx.now()
        };
        ctx.accounts[id] = account;
        return { account: view(account), temporaryPassword: temp };
      }

      const match = clean.match(/^\/accounts\/([^/]+)(?:\/(lock|unlock|reset-password))?$/);
      if (!match) return undefined;
      const account = find(match[1]);
      const action = match[2];

      if (method === "PUT" && !action) {
        const name = body.name == null ? account.user.name : nameOf(body.name);
        const role = body.role == null ? account.user.role : roleOf(body.role);
        if (role !== account.user.role) {
          if (isMe(account)) throw new Error("내 역할은 바꿀 수 없습니다 — 다른 관리자에게 부탁하세요.");
          if (account.user.role === "admin" && !account.locked) requireAnotherAdmin();
        }
        account.user = { ...account.user, name, role };
        return view(account);
      }
      if (method === "POST" && action === "lock") {
        if (isMe(account)) throw new Error("내 계정은 잠글 수 없습니다.");
        if (!account.locked) {
          if (account.user.role === "admin") requireAnotherAdmin();
          account.locked = true;
          account.lockedAt = ctx.now();
        }
        return view(account);
      }
      if (method === "POST" && action === "unlock") {
        account.locked = false;
        account.lockedAt = null;
        return view(account);
      }
      if (method === "POST" && action === "reset-password") {
        if (isMe(account)) throw new Error("내 비밀번호는 '비밀번호 바꾸기'에서 바꿉니다.");
        const temp = temporary();
        account.password = temp;
        account.user = { ...account.user, mustChangePassword: true };
        account.passwordChangedAt = ctx.now();
        return { account: view(account), temporaryPassword: temp };
      }
      return undefined;
    }
  };
}
