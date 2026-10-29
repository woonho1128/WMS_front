import { create } from "zustand";
import { USE_MOCK_API } from "../../services/apiMode";
import { apiGet, apiPut } from "../../services/http";
import { useAuthStore } from "./authStore";
import { isMenuPath } from "./tabsStore";

/* ============================================================
   사용자별 화면 배치 설정 — 메뉴 방식 · 즐겨찾기 · 최근 본 화면
   설계: DOCS/WMS_메뉴방식_즐겨찾기_설계.md

   - 계정마다 따로 저장한다 (같은 PC 에서도 로그인한 사람마다 다르다).
   - 사내 빌드: 서버(`/api/me/nav-prefs`)가 원본 — 다른 PC · 폰에서 로그인해도 같다 (2단계, 2026-10-06).
     브라우저 localStorage `wms.nav.<아이디>` 는 첫 화면을 바로 그리기 위한 사본이다.
     · 열 때: 사본으로 먼저 그리고 → 서버 것을 받아 맞춘다. 서버에 아직 없으면 이 브라우저의 설정을 올린다.
     · 바꿀 때: 사본에 바로 쓰고, 바뀐 칸만 조금 뒤(1초) 서버에 올린다. 못 올린 칸은 사본에 표시해 두었다가 다음에 올린다.
   - 데모 빌드: 서버가 없으므로 브라우저에만 둔다 (1단계 그대로).
   - 이건 업무 데이터가 아니라 화면 배치라, 서버에서 못 읽으면 이 브라우저의 사본(없으면 기본값)으로 연다
     (업무 데이터의 "폴백 금지"와 별개 — 기본 배치로 보여도 잘못 일할 일이 없다). 대신 헤더에 작게 알린다(`sync`).
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

type PrefKey = keyof NavPrefs;
const PREF_KEYS: PrefKey[] = ["navMode", "favorites", "lastScreenBySection", "recent"];

/**
 * 설정이 어디까지 저장됐나.
 * local = 이 브라우저에만(데모 빌드 · 로그아웃) / syncing = 서버 것을 받는 중 / synced = 서버와 같다 /
 * failed = 서버에 못 닿았다 — 이 브라우저에는 남아 있고 다음에 다시 올린다
 */
export type NavSync = "local" | "syncing" | "synced" | "failed";

/** 새 사용자 기본 — 목록형 (사용자 결정 2026-09-22) */
const DEFAULT_PREFS: NavPrefs = { navMode: "list", favorites: [], lastScreenBySection: {}, recent: [] };

const API_PATH = "/me/nav-prefs";
/** 바뀐 칸을 서버에 올리기까지 기다리는 시간 — 화면을 연달아 옮겨도 한 번만 올라간다 */
const PUSH_DELAY_MS = 1000;

const storageKey = (userId: string) => `wms.nav.${userId}`;

const unique = (paths: unknown[]) =>
  Array.from(new Set(paths.filter((path): path is string => typeof path === "string" && isMenuPath(path))));

/** 읽어 온 설정(사본 · 서버)을 쓸 수 있는 모양으로 — 메뉴에서 빠진 화면 · 망가진 값은 버리고 기본값으로 채운다 */
const sanitize = (saved: Partial<NavPrefs> | null | undefined): NavPrefs => {
  const last: Record<string, string> = {};
  Object.entries(saved?.lastScreenBySection ?? {}).forEach(([key, path]) => {
    if (typeof path === "string" && isMenuPath(path)) last[key] = path;
  });
  return {
    navMode: saved?.navMode === "tabs" ? "tabs" : "list",
    favorites: unique(Array.isArray(saved?.favorites) ? saved.favorites : []).slice(0, FAVORITES_LIMIT),
    lastScreenBySection: last,
    recent: unique(Array.isArray(saved?.recent) ? saved.recent : []).slice(0, RECENT_LIMIT)
  };
};

/** 이 브라우저의 사본 — 설정 + 아직 서버에 못 올린 칸(dirty) */
const readCache = (userId: string | null): { prefs: NavPrefs; dirty: PrefKey[] } => {
  if (!userId) return { prefs: DEFAULT_PREFS, dirty: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { prefs: DEFAULT_PREFS, dirty: [] };
    const saved = JSON.parse(raw) as Partial<NavPrefs> & { dirty?: unknown };
    const dirty = Array.isArray(saved.dirty) ? PREF_KEYS.filter((key) => (saved.dirty as unknown[]).includes(key)) : [];
    return { prefs: sanitize(saved), dirty };
  } catch {
    return { prefs: DEFAULT_PREFS, dirty: [] };
  }
};

const writeCache = (userId: string | null, prefs: NavPrefs, dirty: PrefKey[]) => {
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(dirty.length ? { ...prefs, dirty } : prefs));
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

const pick = (prefs: NavPrefs, keys: PrefKey[]): Partial<NavPrefs> =>
  Object.fromEntries(keys.map((key) => [key, prefs[key]])) as Partial<NavPrefs>;

/** 기본값과 다른 것이 하나라도 있나 — 서버에 처음 올릴 만한 설정인가 */
const hasContent = (prefs: NavPrefs) =>
  prefs.navMode !== "list" || prefs.favorites.length > 0 || prefs.recent.length > 0 || Object.keys(prefs.lastScreenBySection).length > 0;

export const sectionOfPath = (path: string) => path.split("/").filter(Boolean)[0] ?? "";

type NavPrefsState = NavPrefs & {
  userId: string | null;
  /**
   * 탭형에서 지금 고른 칸 — 섹션 slug 또는 ★. 저장하지 않는다(주소로 다시 정해진다).
   * ★ 에서 즐겨찾기 탭을 오가는 동안은 주소의 섹션이 바뀌어도 ★ 에 머문다.
   */
  activeCategory: string | null;
  /** 아직 서버에 못 올린 칸 */
  dirty: PrefKey[];
  sync: NavSync;
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

/** 서버 것을 받는 첫 동기화 — 로그인 직후 첫 화면을 정하기 전에 기다린다 (navPrefsReady) */
let initialSync: Promise<void> = Promise.resolve();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * 서버 것을 받는 사이에 연 화면 — 받은 뒤 서버의 최근 본 화면 · 마지막 화면 위에 얹는다.
 * (화면은 서버 응답보다 먼저 그려지므로 첫 화면의 기록은 늘 이 사이에 생긴다 — 그대로 두면 서버 것을 통째로 덮는다)
 */
let visitsWhilePulling: { recent: string[]; last: Record<string, string> } | null = null;

export const useNavPrefsStore = create<NavPrefsState>((set, get) => {
  const persist = () => {
    const state = get();
    writeCache(state.userId, prefsOf(state), state.dirty);
  };

  /** 서버에 저장하는 빌드 · 로그인한 상태인가 (데모 · 로그아웃이면 브라우저에만 둔다) */
  const usesServer = () => !USE_MOCK_API && Boolean(get().userId);

  const schedulePush = () => {
    if (!usesServer()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void push(), PUSH_DELAY_MS);
  };

  /** 바뀐 칸만 서버에 올린다 — 실패하면 표시만 남기고(사본에 dirty) 다음 변경 · 다음 접속 때 다시 */
  const push = async () => {
    pushTimer = null;
    const { userId, dirty, sync } = get();
    // 서버 것을 받는 중에는 올리지 않는다 — 받기 전에 올리면 다른 기기의 최근 기록을 보지도 않고 덮는다. 받은 뒤 pull 이 올린다
    if (!userId || !dirty.length || sync === "syncing") return;
    const sent = pick(prefsOf(get()), dirty);
    try {
      await apiPut<unknown>(API_PATH, sent);
      if (get().userId !== userId) return; // 그 사이 다른 사람이 로그인했다
      // 올리는 동안 또 바뀐 칸은 남겨 다시 올린다
      const still = get().dirty.filter((key) => !(key in sent) || get()[key] !== sent[key]);
      set({ dirty: still, sync: "synced" });
      persist();
      if (still.length) schedulePush();
    } catch {
      if (get().userId === userId) set({ sync: "failed" });
    }
  };

  /** 바꾼 뒤 사본에 쓰고 서버에 올릴 준비까지 한 번에 */
  const update = (patch: Partial<NavPrefs>) => {
    const keys = Object.keys(patch) as PrefKey[];
    const track = usesServer();
    set((state) => ({ ...patch, dirty: track ? PREF_KEYS.filter((key) => state.dirty.includes(key) || keys.includes(key)) : [] }));
    persist();
    schedulePush();
  };

  /** 서버 것을 받아 맞춘다 — 지난번에 못 올린 칸이 있으면 그것부터 올리고, 서버에 처음이면 이 브라우저 것을 올린다 */
  const pull = async (userId: string) => {
    const before = prefsOf(get());
    const unsent = get().dirty;
    const visits: NonNullable<typeof visitsWhilePulling> = { recent: [], last: {} };
    visitsWhilePulling = visits;
    /** 이 받기가 끝났다 — 그 사이 다른 사람이 로그인해 새로 받기 시작했으면 건드리지 않는다 */
    const stopTracking = () => {
      if (visitsWhilePulling === visits) visitsWhilePulling = null;
    };
    try {
      let server = unsent.length
        ? await apiPut<Partial<NavPrefs> | null>(API_PATH, pick(before, unsent))
        : await apiGet<Partial<NavPrefs> | null>(API_PATH);
      if (get().userId !== userId) return;
      if (!server && hasContent(before)) {
        // 1단계(브라우저 저장)부터 쓰던 사람 — 이 브라우저의 설정이 계정의 첫 설정이 된다
        server = await apiPut<Partial<NavPrefs> | null>(API_PATH, before);
        if (get().userId !== userId) return;
      }
      stopTracking();
      if (!server) {
        // 서버에도 이 브라우저에도 없다 — 기본 배치. 받는 사이 연 화면 기록은 이제 올린다
        set({ sync: "synced" });
        if (get().dirty.length) schedulePush();
        return;
      }
      const fresh = sanitize(server);
      const now = get();
      const patch: Partial<NavPrefs> = {};
      const still: PrefKey[] = [];
      // 메뉴 방식 · 즐겨찾기: 받는 사이 이 화면에서 바꿨으면 그대로 두고(곧 올라간다), 아니면 서버 값
      if (now.navMode !== before.navMode) still.push("navMode");
      else patch.navMode = fresh.navMode;
      if (now.favorites !== before.favorites) still.push("favorites");
      else patch.favorites = fresh.favorites;
      // 최근 본 화면 · 마지막 화면: 서버 것 위에 받는 사이 연 화면을 얹는다
      if (visits.recent.length) {
        patch.recent = unique([...visits.recent, ...fresh.recent]).slice(0, RECENT_LIMIT);
        patch.lastScreenBySection = { ...fresh.lastScreenBySection, ...visits.last };
        still.push("lastScreenBySection", "recent");
      } else {
        patch.recent = fresh.recent;
        patch.lastScreenBySection = fresh.lastScreenBySection;
      }
      set({ ...patch, dirty: still, sync: "synced" });
      persist();
      if (still.length) schedulePush();
    } catch {
      stopTracking();
      if (get().userId === userId) set({ sync: "failed" });
    }
  };

  return {
    ...DEFAULT_PREFS,
    userId: null,
    activeCategory: null,
    dirty: [],
    sync: "local",

    loadFor: (userId) => {
      if (get().userId === userId) return;
      // 앞 사람의 올리려던 칸은 그 사람 사본에 dirty 로 남아 있다 — 다시 로그인하면 올라간다
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
      visitsWhilePulling = null;
      const cached = readCache(userId);
      const remote = Boolean(userId) && !USE_MOCK_API;
      set({ ...cached.prefs, dirty: cached.dirty, userId, activeCategory: null, sync: remote ? "syncing" : "local" });
      initialSync = remote && userId ? pull(userId) : Promise.resolve();
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
      const visited: Record<string, string> = { [section]: path };
      if (stayInFavorites) visited[FAVORITES_KEY] = path;
      if (visitsWhilePulling) {
        visitsWhilePulling.recent = [path, ...visitsWhilePulling.recent.filter((item) => item !== path)];
        Object.assign(visitsWhilePulling.last, visited);
      }
      set({ activeCategory: stayInFavorites ? FAVORITES_KEY : section });
      update({
        lastScreenBySection: { ...lastScreenBySection, ...visited },
        recent: [path, ...recent.filter((item) => item !== path)].slice(0, RECENT_LIMIT)
      });
    }
  };
});

/**
 * 서버의 설정을 받을 때까지 기다린다(길어도 timeoutMs) — 로그인 직후 첫 화면을 정하기 전에 쓴다.
 * 새 PC 에서 로그인한 탭형 사용자가 목록형으로 한 번 그려졌다가 바뀌지 않게.
 */
export const navPrefsReady = (timeoutMs = 1500) =>
  Promise.race([initialSync, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);

/*
 * 로그인한 사람의 설정으로 맞춘다 — 컴포넌트가 아니라 스토어 단계에서.
 * 화면이 한 번이라도 기본값으로 그려지면 탭형 사용자에게 목록형이 번쩍 보이고,
 * 그 사이에 목록형 작업 탭이 쌓인다(2026-09-22 새로고침에서 확인). 로그인 · 로그아웃 · 새로고침 모두 여기서 끝난다.
 */
// 임시 비밀번호로 들어온 동안은 서버가 비밀번호 바꾸기 말고는 막는다 — 바꾼 뒤에 받는다
const syncUser = () => {
  const user = useAuthStore.getState().user;
  useNavPrefsStore.getState().loadFor(user && !user.mustChangePassword ? user.id : null);
};
syncUser();
useAuthStore.subscribe(syncUser);
