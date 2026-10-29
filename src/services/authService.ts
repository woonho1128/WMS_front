import type { UserRole } from "../app/roles";
import { API_BASE, USE_MOCK_API, fetchApi } from "./apiMode";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
  /** 임시 비밀번호로 들어왔다 — 비밀번호부터 바꾼다 (그 전에는 서버가 다른 요청을 막는다) */
  mustChangePassword?: boolean;
};

export type LoginResult = {
  user: AuthUser;
  token: string;
};

export { API_BASE };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 비밀번호 규칙 — 서버와 같다 (화면은 미리 알려 줄 뿐, 진짜 검사는 서버) */
export const PASSWORD_RULE = "8자 이상, 영문과 숫자를 섞어 주세요.";

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
  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data: LoginResult | null; message: string | null }
    | null;
  if (!res.ok || !json?.success || !json.data) {
    throw new Error(json?.message ?? "로그인에 실패했습니다.");
  }
  return { user: json.data.user, token: json.data.token };
}

export async function logout(): Promise<void> {
  await delay(50);
}
