import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { isMenuPath } from "./tabsStore";

/* ============================================================
   사용자별 화면 배치 설정 — 메뉴 방식 · 즐겨찾기 · 최근 본 화면
   설계: DOCS/WMS_메뉴방식_즐겨찾기_설계.md

   - 계정마다 따로 저장한다 (같은 PC 에서도 로그인한 사람마다 다르다).
     1단계는 브라우저 localStorage `wms.nav.<아이디>`, 2단계에서 서버(`/api/me/nav-prefs`)로 옮긴다.
   - 이건 업무 데이터가 아니라 화면 배치라, 못 읽으면 기본값으로 연다
     (업무 데이터의 "폴백 금지"와 별개 — 기본 배치로 보여도 잘못 일할 일이 없다).
   ============================================================ */

/** 목록형 = 트리 + 연 화면 탭(지금) · 탭형 = 카테고리만 + 그 카테고리 화면 탭(과장님 안) */
export type NavMode = "list" | "tabs";

/** 탭형 좌측 맨 위 ★ — 카테고리처럼 고르면 위 탭 줄이 내 즐겨찾기가 된다 */
export const FAVORITES_KEY = "★";
/** 1366 노트북 탭 줄에 스크롤 없이 들어가는 수 (사용자 결정 2026-09-22) */
export const FAVORITES_LIMIT = 12;
/** 탭형 '최근 본 화면' 목록 길이 */
export const RECENT_LIMIT = 8;

export type NavPrefs = {
  navMode: NavMode;
  /** 화면 경로, 순서대로 */
  favorites: string[];
  /** 카테고리(섹션 slug 또는 ★)별 마지막으로 보던 화면 — 탭형에서 카테고리를 누르면 여기로 간다 */
  lastScreenBySection: Record<string, string>;
  /** 최근 본 화면, 최신 먼저 */
  recent: string[];
};

/** 새 사용자 기본 — 목록형 (사용자 결정 2026-09-22) */
const DEFAULT_PREFS: NavPrefs = { navMode: "list", favorites: [], lastScreenBySection: {}, recent: [] };

const storageKey = (userId: string) => `wms.nav.${userId}`;

const unique = (paths: unknown[]) =>
  Array.from(new Set(paths.filter((path): path is string => typeof path === "string" && isMenuPath(path))));

/** 저장된 설정을 읽는다 — 메뉴에서 빠진 화면 · 망가진 값은 버리고 기본값으로 채운다 */
const read = (userId: string | null): NavPrefs => {
  if (!userId) return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw) as Partial<NavPrefs>;
    const last: Record<string, string> = {};
    Object.entries(saved.lastScreenBySection ?? {}).forEach(([key, path]) => {
      if (typeof path === "string" && isMenuPath(path)) last[key] = path;
    });
    return {
      navMode: saved.navMode === "tabs" ? "tabs" : "list",
      favorites: unique(saved.favorites ?? []).slice(0, FAVORITES_LIMIT),
      lastScreenBySection: last,
      recent: unique(saved.recent ?? []).slice(0, RECENT_LIMIT)
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

const write = (userId: string | null, prefs: NavPrefs) => {
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    /* 저장 실패(시크릿 모드 등)는 무시 — 이번 접속 동안은 화면에 반영돼 있다 */
  }
};

const prefsOf = (state: NavPrefs): NavPrefs => ({
  navMode: state.navMode,
  favorites: state.favorites,
  lastScreenBySection: state.lastScreenBySection,
  recent: state.recent
});

export const sectionOfPath = (path: string) => path.split("/").filter(Boolean)[0] ?? "";

type NavPrefsState = NavPrefs & {
  userId: string | null;
  /**
   * 탭형에서 지금 고른 칸 — 섹션 slug 또는 ★. 저장하지 않는다(주소로 다시 정해진다).
   * ★ 에서 즐겨찾기 탭을 오가는 동안은 주소의 섹션이 바뀌어도 ★ 에 머문다.
   */
  activeCategory: string | null;
  /** 로그인한 사람의 설정으로 바꾼다 (로그아웃이면 기본값) */
  loadFor: (userId: string | null) => void;
  setNavMode: (mode: NavMode) => void;
  /** 넣거나 뺀다 — 이미 가득 차 있으면 "full" */
  toggleFavorite: (path: string) => "added" | "removed" | "full";
  /**
   * 즐겨찾기 순서 바꾸기 — path 를 target 자리로.
   * 번호가 아니라 경로로 받는다: 역할 때문에 숨은 즐겨찾기가 끼어 있으면 화면의 번호와 저장된 번호가 다르다.
   */
  reorderFavorite: (path: string, target: string) => void;
  /** 역할별 추천으로 채운다 (비어 있을 때의 안내 버튼) */
  fillFavorites: (paths: string[]) => void;
  setActiveCategory: (key: string) => void;
  /** 화면을 열 때마다 — 카테고리별 마지막 화면 · 최근 본 화면 · 탭형의 고른 칸을 갱신 */
  recordVisit: (path: string) => void;
};

export const useNavPrefsStore = create<NavPrefsState>((set, get) => {
  /** 바꾼 뒤 저장까지 한 번에 */
  const update = (patch: Partial<NavPrefs>) => {
    set(patch);
    const state = get();
    write(state.userId, prefsOf(state));
  };

  return {
    ...DEFAULT_PREFS,
    userId: null,
    activeCategory: null,

    loadFor: (userId) => {
      if (get().userId === userId) return;
      set({ ...read(userId), userId, activeCategory: null });
    },

    setNavMode: (mode) => update({ navMode: mode }),

    toggleFavorite: (path) => {
      const { favorites } = get();
      if (favorites.includes(path)) {
        update({ favorites: favorites.filter((item) => item !== path) });
        return "removed";
      }
      if (favorites.length >= FAVORITES_LIMIT) return "full";
      update({ favorites: [...favorites, path] });
      return "added";
    },

    reorderFavorite: (path, target) => {
      const favorites = [...get().favorites];
      const from = favorites.indexOf(path);
      const to = favorites.indexOf(target);
      if (from < 0 || to < 0 || from === to) return;
      favorites.splice(from, 1);
      favorites.splice(to, 0, path);
      update({ favorites });
    },

    fillFavorites: (paths) => {
      const merged = unique([...get().favorites, ...paths]).slice(0, FAVORITES_LIMIT);
      update({ favorites: merged });
    },

    setActiveCategory: (key) => set({ activeCategory: key }),

    recordVisit: (path) => {
      if (!isMenuPath(path)) return;
      const { favorites, activeCategory, lastScreenBySection, recent } = get();
      const section = sectionOfPath(path);
      // ★ 안에서 즐겨찾기를 오가는 중이면 ★ 에 머물고, 아니면 주소의 섹션이 고른 칸이 된다
      const stayInFavorites = activeCategory === FAVORITES_KEY && favorites.includes(path);
      const nextLast = { ...lastScreenBySection, [section]: path };
      if (stayInFavorites) nextLast[FAVORITES_KEY] = path;
      set({ activeCategory: stayInFavorites ? FAVORITES_KEY : section });
      update({
        lastScreenBySection: nextLast,
        recent: [path, ...recent.filter((item) => item !== path)].slice(0, RECENT_LIMIT)
      });
    }
  };
});

/*
 * 로그인한 사람의 설정으로 맞춘다 — 컴포넌트가 아니라 스토어 단계에서.
 * 화면이 한 번이라도 기본값으로 그려지면 탭형 사용자에게 목록형이 번쩍 보이고,
 * 그 사이에 목록형 작업 탭이 쌓인다(2026-09-22 새로고침에서 확인). 로그인 · 로그아웃 · 새로고침 모두 여기서 끝난다.
 */
const syncUser = () => useNavPrefsStore.getState().loadFor(useAuthStore.getState().user?.id ?? null);
syncUser();
useAuthStore.subscribe(syncUser);
