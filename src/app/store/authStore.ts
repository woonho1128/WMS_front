import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  MeError,
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  type AuthUser,
  type LoginResult
} from "../../services/authService";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  status: "idle" | "loading" | "error";
  error: string | null;
  login: (id: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** 비밀번호를 바꾼 뒤 — 서버가 준 새 토큰으로 이어 쓴다 (예전 토큰은 서버에서 끊겼다) */
  replaceSession: (result: LoginResult) => void;
  /** 서버가 로그인이 끊겼다고 할 때(401) — 계정 잠금 · 비밀번호 초기화 · 시간 만료. 로그인 화면에 사유를 띄운다 */
  expire: (message: string) => void;
  clearError: () => void;
};

const LOGIN_AGAIN = "로그인이 끊겼습니다 — 다시 로그인하세요.";

/** 예전(역할 하나) 모양으로 저장된 로그인 — 기능 목록이 없다. 새로 받을 때까지 빈 메뉴로 둔다 */
const normalize = (user: AuthUser | null): AuthUser | null => {
  if (!user) return null;
  return {
    ...user,
    roles: Array.isArray(user.roles) ? user.roles : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    features: Array.isArray(user.features) ? user.features : [],
    menus: Array.isArray(user.menus) ? user.menus : [],
    authVersion: typeof user.authVersion === "number" ? user.authVersion : -1,
    admin: Boolean(user.admin)
  };
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
          set({ user: normalize(user), token, status: "idle", error: null });
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
      replaceSession: ({ user, token }) => set({ user: normalize(user), token, status: "idle", error: null }),
      expire: (message) => set({ user: null, token: null, status: "error", error: message }),
      clearError: () => set({ error: null })
    }),
    {
      name: "wms-auth",
      partialize: (state) => ({ user: state.user, token: state.token }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AuthState>;
        return { ...current, ...saved, user: normalize(saved.user ?? null) };
      }
    }
  )
);

/* ============================================================
   권한이 바뀌면 바로 — 다시 로그인 없이 (설계 7장 '바로 적용')
   응답마다 실린 권한 버전(X-Auth-Version)이 가진 것과 다르면 /auth/me 를 다시 받아
   메뉴 · 단추를 다시 그린다. 403 을 받았을 때 · 창으로 돌아왔을 때도 한 번 확인한다.
   ============================================================ */

let refreshing: Promise<void> | null = null;
let lastCheck = 0;

/** 내 정보를 다시 받는다 — 겹쳐 부르면 한 번만 */
export const refreshAccess = (): Promise<void> => {
  const { token, user } = useAuthStore.getState();
  if (!token || !user) return Promise.resolve();
  if (refreshing) return refreshing;
  lastCheck = Date.now();
  refreshing = fetchMe(token)
    .then((me) => {
      // 그 사이 로그아웃 · 다른 사람으로 로그인했으면 버린다
      const now = useAuthStore.getState();
      if (now.token === token) useAuthStore.setState({ user: normalize(me) });
    })
    .catch((error) => {
      if (error instanceof MeError && error.status === 401 && useAuthStore.getState().token === token) {
        useAuthStore.getState().expire(error.message || LOGIN_AGAIN);
      }
      // 연결이 안 되면 가진 권한으로 계속 — 다음 응답에서 다시 본다
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

/** 응답의 권한 버전을 본다 — http.ts 가 응답마다 부른다 */
export const noteAuthVersion = (version: number | null | undefined) => {
  const user = useAuthStore.getState().user;
  if (version == null || !Number.isFinite(version) || !user) return;
  if (version !== user.authVersion) void refreshAccess();
};

/** 403 — 권한이 줄었을 수 있다. 너무 잦지 않게 한 번 확인 */
export const checkAccessSoon = () => {
  if (Date.now() - lastCheck > 3000) void refreshAccess();
};

// 새로고침 — 저장해 둔 로그인의 권한을 한 번 새로 받는다 (그 사이 바뀌었을 수 있다)
if (typeof window !== "undefined") {
  const { user, token } = useAuthStore.getState();
  if (user && token && !user.mustChangePassword) void refreshAccess();
  // 창으로 돌아오면 한 번 확인 (다른 창에서 관리자가 바꿨을 수 있다)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > 10_000) void refreshAccess();
  });
}

/** 인증 헤더 (이후 API 호출에 사용) */
export const authHeader = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
