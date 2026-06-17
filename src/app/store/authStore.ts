import { create } from "zustand";
import { persist } from "zustand/middleware";
import { login as loginRequest, logout as logoutRequest, type AuthUser } from "../../services/authService";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  status: "idle" | "loading" | "error";
  error: string | null;
  login: (id: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
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
      clearError: () => set({ error: null })
    }),
    {
      name: "wms-auth",
      partialize: (state) => ({ user: state.user, token: state.token })
    }
  )
);

/** 인증 헤더 (이후 API 호출에 사용) */
export const authHeader = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
