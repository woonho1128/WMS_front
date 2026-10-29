import { create } from "zustand";

export type ThemeMode = "dark" | "light";

const THEME_KEY = "wms.theme";

/** 저장된 테마를 읽는다. 기본값은 관제 톤(dark). */
const readTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* 시크릿 모드 등 저장소 접근 불가 → 기본값 */
  }
  return "dark";
};

/** <html data-theme="..."> 로 테마를 반영하고 저장한다. */
export const applyTheme = (theme: ThemeMode) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* 저장 실패는 무시 — 화면 반영은 이미 끝났다 */
  }
};

/**
 * 화면 상태 (테마 · 사이드바 · 패널).
 * 무엇을 할 수 있는지(역할 · 기능)는 여기 없다 — 로그인한 사람의 기능은 app/access.ts (useAccess · useCan).
 */
type UiState = {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setRightPanelOpen: (value: boolean) => void;
  setBottomPanelOpen: (value: boolean) => void;
};

const initialTheme = readTheme();
applyTheme(initialTheme);

export const useUiStore = create<UiState>((set) => ({
  theme: initialTheme,
  sidebarCollapsed: false,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next: ThemeMode = state.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      return { theme: next };
    }),
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  setRightPanelOpen: (value) => set({ rightPanelOpen: value }),
  setBottomPanelOpen: (value) => set({ bottomPanelOpen: value })
}));
