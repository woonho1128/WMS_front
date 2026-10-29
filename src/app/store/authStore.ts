import { create } from "zustand";
import { persist } from "zustand/middleware";
import { login as loginRequest, logout as logoutRequest, type AuthUser, type LoginResult } from "../../services/authService";
import { isUserRole } from "../roles";
import { useUiStore } from "./uiStore";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  status: "idle" | "loading" | "error";
  error: string | null;
  login: (id: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** 비밀번호를 바꾼 뒤 — 서버가 준 새 토큰으로 이어 쓴다 (예전 토큰은 서버에서 끊겼다) */
  replaceSession: (result: LoginResult) => void;
  /** 서버가 로그인이 끊겼다고 할 때(401) — 계정 잠금 · 역할 변경 · 비밀번호 초기화 · 시간 만료. 로그인 화면에 사유를 띄운다 */
  expire: (message: string) => void;
  clearError: () => void;
};

/** 메뉴 · 단추는 로그인한 사람의 역할을 따른다 (데모의 역할 고르기는 그 위에서 바꿔 볼 뿐) */
const followRole = (user: AuthUser | null) => {
  if (user && isUserRole(user.role)) useUiStore.getState().setCurrentRole(user.role);
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      status: "idle",
      error: null,
      login: async (id, password) => {
        set({ status: "loading", error: null });
        try {
          const { user, token } = await loginRequest(id, password);
          followRole(user);
          set({ user, token, status: "idle", error: null });
          return true;
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : "로그인에 실패했습니다."
          });
          return false;
        }
      },
      logout: async () => {
        try {
          await logoutRequest();
        } finally {
          set({ user: null, token: null, status: "idle", error: null });
        }
      },
      replaceSession: ({ user, token }) => {
        followRole(user);
        set({ user, token, status: "idle", error: null });
      },
      expire: (message) => set({ user: null, token: null, status: "error", error: message }),
      clearError: () => set({ error: null })
    }),
    {
      name: "wms-auth",
      partialize: (state) => ({ user: state.user, token: state.token })
    }
  )
);

// 새로고침 — 저장해 둔 로그인의 역할로 시작한다 (예전엔 늘 관리자 메뉴로 시작했다)
followRole(useAuthStore.getState().user);

/** 인증 헤더 (이후 API 호출에 사용) */
export const authHeader = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
