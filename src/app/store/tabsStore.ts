import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { findSection } from "../menuConfig";

/** 좌측 메뉴에서 연 화면 하나 = 본문 상단 탭 하나. path 로 식별한다. */
export type OpenTab = {
  path: string; // 라우트 경로 (예: "/inbound/inbound-schedule")
  label: string; // 탭에 표시할 화면명
  /** 고정 탭 — 자동으로도, 일괄 닫기로도 닫히지 않는다. 고정을 풀어야 닫을 수 있다 */
  pinned?: boolean;
  /** 마지막으로 본 시각(ms) — 한도를 넘으면 가장 오래 안 본 탭부터 닫는다 */
  lastActiveAt?: number;
};

/**
 * 동시에 열어 둘 탭 수. 1366px 노트북에서 사이드바를 펼쳐도 탭 바가 스크롤 없이 들어가는 최대치.
 * 넘치면 막지 않고 가장 오래 안 본 탭을 닫는다 — 화면은 탭을 옮길 때마다 새로 그려져서
 * 탭이 입력 중인 상태를 들고 있지 않으므로 닫아도 잃는 것이 없다.
 */
export const TAB_LIMIT = 10;
/** 고정 탭 수 — 한도 안에서 자동으로 닫을 탭이 늘 남도록 제한한다 */
export const PIN_LIMIT = 3;

/** 탭이 하나도 없을 때 돌아갈 기본 화면. AppRouter 의 index 리다이렉트와 동일. */
export const HOME_PATH = "/dashboard/logistics-status";

/**
 * 분할 보기(절반으로 보기) — 탭 하나를 오른쪽 패널에 나란히 띄운다.
 * 이 폭보다 좁으면 반쪽이 400px 밑으로 내려가 둘 다 못 읽으므로 왼쪽 화면만 그린다
 * (responsive.css 의 --bp-laptop 과 같은 값).
 */
export const SPLIT_MIN_QUERY = "(min-width: 1280px)";
/** 왼쪽 패널 비율 범위 · 기본값 */
export const SPLIT_MIN_RATIO = 0.3;
export const SPLIT_MAX_RATIO = 0.7;
export const SPLIT_DEFAULT_RATIO = 0.5;
export const clampSplitRatio = (ratio: number) =>
  Number.isFinite(ratio) ? Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio)) : SPLIT_DEFAULT_RATIO;

/** 지금 메뉴에 있는 화면 경로인가 — 메뉴에서 빠진 화면(예: 반품 예정 → OMS2)이나 잘못 친 주소는 탭으로 남기지 않는다 */
export const isMenuPath = (path: string) => {
  const [sectionSlug, featureSlug] = path.split("/").filter(Boolean);
  const section = findSection(sectionSlug);
  if (!section) return false;
  return !featureSlug || section.features.some((feature) => feature.slug === featureSlug);
};

/** 고정 탭을 앞으로 모은다 (무리 안의 순서는 그대로) */
const pinnedFirst = (tabs: OpenTab[]) => [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)];

/** path 를 뺀 탭 중 가장 최근에 본 것 — 분할 보기에서 좌우를 맞바꿀 때 쓴다 */
const latestOther = (tabs: OpenTab[], path: string) =>
  tabs.reduce<OpenTab | null>((latest, tab) => {
    if (tab.path === path) return latest;
    return !latest || (tab.lastActiveAt ?? 0) > (latest.lastActiveAt ?? 0) ? tab : latest;
  }, null);

/** 한도를 넘을 때 닫을 탭 — 고정 탭과 keepPath(지금 여는·보고 있는 탭)를 빼고 가장 오래 안 본 탭 */
export const evictionCandidate = (tabs: OpenTab[], keepPath?: string) =>
  tabs.reduce<OpenTab | null>((oldest, tab) => {
    if (tab.pinned || tab.path === keepPath) return oldest;
    return !oldest || (tab.lastActiveAt ?? 0) < (oldest.lastActiveAt ?? 0) ? tab : oldest;
  }, null);

/**
 * 탭 닫기 방식 — 고정 탭은 어느 방식으로도 닫히지 않는다
 * - self   : 이 탭만
 * - others : 이 탭을 제외한 전부
 * - left   : 이 탭 왼쪽 전부
 * - right  : 이 탭 오른쪽 전부
 * - all    : 전부
 */
export type CloseKind = "self" | "others" | "left" | "right" | "all";

/** 닫은 뒤 남는 탭 목록 (순수 함수 — 스토어와 화면 이동 계산이 같이 쓴다) */
export const tabsAfterClose = (tabs: OpenTab[], kind: CloseKind, path: string): OpenTab[] => {
  if (kind === "all") return tabs.filter((tab) => tab.pinned);
  const index = tabs.findIndex((tab) => tab.path === path);
  if (index < 0) return tabs;
  switch (kind) {
    case "self":
      return tabs[index].pinned ? tabs : tabs.filter((tab) => tab.path !== path);
    case "others":
      return tabs.filter((tab, i) => i === index || tab.pinned);
    case "left":
      return tabs.filter((tab, i) => i >= index || tab.pinned);
    case "right":
      return tabs.filter((tab, i) => i <= index || tab.pinned);
    default:
      return tabs;
  }
};

/** 해당 방식으로 닫힐 탭 개수 (우클릭 메뉴 표시/비활성 판단용) */
export const closeCount = (tabs: OpenTab[], kind: CloseKind, path: string) =>
  tabs.length - tabsAfterClose(tabs, kind, path).length;

/** 저장해 둔 탭 되살리기 — 메뉴에서 빠진 화면은 버리고, 예전 형식(고정·활성 시각 없음)은 채우고, 한도를 넘으면 오래된 것부터 정리 */
const restoreTabs = (saved: OpenTab[]) => {
  let pinSlots = PIN_LIMIT;
  let tabs: OpenTab[] = saved
    .filter((tab) => isMenuPath(tab.path))
    .map((tab, index) => ({
      path: tab.path,
      label: tab.label,
      pinned: Boolean(tab.pinned) && pinSlots-- > 0,
      lastActiveAt: tab.lastActiveAt ?? index
    }));
  while (tabs.length > TAB_LIMIT) {
    const victim = evictionCandidate(tabs);
    if (!victim) break;
    tabs = tabs.filter((tab) => tab !== victim);
  }
  return pinnedFirst(tabs);
};

type TabsState = {
  tabs: OpenTab[];
  /** 한도를 넘어 자동으로 닫힌 탭 — 탭 바가 "다시 열기" 알림을 띄운다 (저장하지 않음) */
  evicted: OpenTab | null;
  /** 오른쪽 패널에 나란히 띄운 화면 경로 — null 이면 한 화면만 */
  splitPath: string | null;
  /** 왼쪽 패널이 차지하는 비율 (SPLIT_MIN_RATIO ~ SPLIT_MAX_RATIO) */
  splitRatio: number;
  /** 화면을 열 때마다 부른다 — 없으면 탭을 추가하고, 있으면 라벨·마지막으로 본 시각을 갱신. 한도를 넘으면 가장 오래 안 본 탭을 닫는다 */
  openTab: (tab: Pick<OpenTab, "path" | "label">) => void;
  closeTabs: (kind: CloseKind, path: string) => void;
  /** 고정 / 고정 해제 — 이미 PIN_LIMIT 개 고정돼 있으면 false */
  togglePin: (path: string) => boolean;
  dismissEvicted: () => void;
  /** 이 탭을 오른쪽 패널로 — 왼쪽은 보고 있던 화면 그대로 */
  openSplit: (path: string) => void;
  closeSplit: () => void;
  setSplitRatio: (ratio: number) => void;
};

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      evicted: null,
      splitPath: null,
      splitRatio: SPLIT_DEFAULT_RATIO,
      openTab: (tab) =>
        set((state) => {
          const now = Date.now();
          // 오른쪽 패널에 있던 화면을 탭에서 다시 고르면 좌우를 맞바꾼다 (한 화면이 양쪽에 겹치지 않게)
          const splitPath =
            state.splitPath === tab.path ? latestOther(state.tabs, tab.path)?.path ?? null : state.splitPath;

          if (state.tabs.some((item) => item.path === tab.path)) {
            return {
              splitPath,
              tabs: state.tabs.map((item) => (item.path === tab.path ? { ...item, label: tab.label, lastActiveAt: now } : item))
            };
          }
          const tabs = [...state.tabs, { path: tab.path, label: tab.label, pinned: false, lastActiveAt: now }];
          // 다시 연 탭의 알림은 치운다
          const evicted = state.evicted?.path === tab.path ? null : state.evicted;
          if (tabs.length <= TAB_LIMIT) return { tabs, evicted, splitPath };
          const victim = evictionCandidate(tabs, tab.path);
          if (!victim) return { tabs, evicted, splitPath };
          return {
            tabs: tabs.filter((item) => item !== victim),
            evicted: victim,
            // 자동으로 닫힌 탭이 오른쪽 패널에 있었으면 분할도 끝난다
            splitPath: splitPath === victim.path ? null : splitPath
          };
        }),
      closeTabs: (kind, path) =>
        set((state) => {
          const tabs = tabsAfterClose(state.tabs, kind, path);
          // 오른쪽 패널의 탭을 닫으면 분할도 끝난다
          // (탭형에서 연 패널처럼 애초에 탭이 없던 화면은 탭을 닫아도 그대로)
          const closedSplit =
            state.tabs.some((item) => item.path === state.splitPath) && !tabs.some((item) => item.path === state.splitPath);
          return { tabs, splitPath: closedSplit ? null : state.splitPath };
        }),
      togglePin: (path) => {
        const { tabs } = get();
        const target = tabs.find((tab) => tab.path === path);
        if (!target) return false;
        if (!target.pinned && tabs.filter((tab) => tab.pinned).length >= PIN_LIMIT) return false;
        set({ tabs: pinnedFirst(tabs.map((tab) => (tab.path === path ? { ...tab, pinned: !tab.pinned } : tab))) });
        return true;
      },
      dismissEvicted: () => set({ evicted: null }),
      openSplit: (path) => {
        // 메뉴에 없는 화면은 패널에도 띄우지 않는다 (탭과 같은 기준)
        if (isMenuPath(path)) set({ splitPath: path });
      },
      closeSplit: () => set({ splitPath: null }),
      setSplitRatio: (ratio) => set({ splitRatio: clampSplitRatio(ratio) })
    }),
    {
      name: "wms-open-tabs",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tabs: state.tabs, splitPath: state.splitPath, splitRatio: state.splitRatio }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<TabsState, "tabs" | "splitPath" | "splitRatio">> | undefined;
        if (!saved?.tabs) return current;
        const tabs = restoreTabs(saved.tabs);
        return {
          ...current,
          tabs,
          // 메뉴에서 빠진 화면은 패널에도 띄우지 않는다. 탭이 있는지는 보지 않는다 —
          // 탭형(DOCS/WMS_메뉴방식_즐겨찾기_설계.md)은 작업 탭 없이 나란히 본다
          splitPath: saved.splitPath && isMenuPath(saved.splitPath) ? saved.splitPath : null,
          splitRatio: clampSplitRatio(saved.splitRatio ?? SPLIT_DEFAULT_RATIO)
        };
      }
    }
  )
);
