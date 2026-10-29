import type { AccessUser } from "../app/access";
import { API_BASE, USE_MOCK_API, fetchApi } from "./apiMode";

/** 로그인한 사람 — 역할(여러 개) · 기능 · 보이는 메뉴 · 권한 버전 (서버 /auth/me 와 같은 모양) */
export type AuthUser = AccessUser;

export type LoginResult = {
  user: AuthUser;
  token: string;
};

export { API_BASE };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 비밀번호 규칙 — 서버와 같다 (화면은 미리 알려 줄 뿐, 진짜 검사는 서버) */
export const PASSWORD_RULE = "8자 이상, 영문과 숫자를 섞어 주세요.";

type Envelope<T> = { success: boolean; data: T | null; message: string | null };

/**
 * 로그인.
 *
 * 데모 빌드면 목 계정, 아니면 백엔드 `/auth/login`. **폴백은 없다** —
 * 백엔드가 안 붙으면 목 계정으로 들여보내지 않고 오류를 낸다 (apiMode.ts 참고).
 */
export async function login(id: string, password: string): Promise<LoginResult> {
  const key = id.trim();

  if (USE_MOCK_API) {
    // 데모 빌드에서만 목 코드를 불러온다 — 실서비스 빌드에서는 이 줄이 통째로 빠진다
    const { mockLogin } = await import("./mockApi");
    return mockLogin(key, password);
  }

  const res = await fetchApi("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: key, password })
  });
  const json = (await res.json().catch(() => null)) as Envelope<LoginResult> | null;
  if (!res.ok || !json?.success || !json.data) {
    throw new Error(json?.message ?? "로그인에 실패했습니다.");
  }
  return { user: json.data.user, token: json.data.token };
}

/** 내 정보를 다시 받는다 (권한이 바뀌었을 때) — 끊긴 로그인이면 status 401 */
export class MeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function fetchMe(token: string): Promise<AuthUser> {
  if (USE_MOCK_API) {
    const { mockMe } = await import("./mockApi");
    return mockMe();
  }
  const res = await fetchApi("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => null)) as Envelope<AuthUser> | null;
  if (!res.ok || !json?.success || !json.data) {
    throw new MeError(json?.message ?? `내 정보를 받지 못했습니다 (${res.status})`, res.status);
  }
  return json.data;
}

export async function logout(): Promise<void> {
  await delay(50);
}
