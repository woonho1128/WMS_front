import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** 좌측 메뉴에서 연 화면 하나 = 본문 상단 탭 하나. path 로 식별한다. */
export type OpenTab = {
  path: string; // 라우트 경로 (예: "/inbound/inbound-schedule")
  label: string; // 탭에 표시할 화면명
};

/** 탭이 하나도 없을 때 돌아갈 기본 화면. AppRouter 의 index 리다이렉트와 동일. */
export const HOME_PATH = "/dashboard/logistics-status";

/**
 * 탭 닫기 방식
 * - self   : 이 탭만
 * - others : 이 탭을 제외한 전부
 * - left   : 이 탭 왼쪽 전부
 * - right  : 이 탭 오른쪽 전부
 * - all    : 전부
 */
export type CloseKind = "self" | "others" | "left" | "right" | "all";

/** 닫은 뒤 남는 탭 목록 (순수 함수 — 스토어와 화면 이동 계산이 같이 쓴다) */
export const tabsAfterClose = (tabs: OpenTab[], kind: CloseKind, path: string): OpenTab[] => {
  const index = tabs.findIndex((tab) => tab.path === path);
  if (kind === "all") return [];
  if (index < 0) return tabs;
  switch (kind) {
    case "self":
      return tabs.filter((tab) => tab.path !== path);
    case "others":
      return [tabs[index]];
    case "left":
      return tabs.slice(index);
    case "right":
      return tabs.slice(0, index + 1);
    default:
      return tabs;
  }
};

/** 해당 방식으로 닫힐 탭 개수 (우클릭 메뉴 표시/비활성 판단용) */
export const closeCount = (tabs: OpenTab[], kind: CloseKind, path: string) =>
  tabs.length - tabsAfterClose(tabs, kind, path).length;

type TabsState = {
  tabs: OpenTab[];
  /** 탭을 열거나(없으면 추가) 라벨을 갱신한다. 이미 있으면 그대로 유지. */
  openTab: (tab: OpenTab) => void;
  closeTabs: (kind: CloseKind, path: string) => void;
};

export const useTabsStore = create<TabsState>()(
  persist(
    (set) => ({
      tabs: [],
      openTab: (tab) =>
        set((state) => {
          const existing = state.tabs.find((item) => item.path === tab.path);
          if (existing) {
            if (existing.label === tab.label) return state;
            return {
              tabs: state.tabs.map((item) =>
                item.path === tab.path ? { ...item, label: tab.label } : item
              )
            };
          }
          return { tabs: [...state.tabs, tab] };
        }),
      closeTabs: (kind, path) => set((state) => ({ tabs: tabsAfterClose(state.tabs, kind, path) }))
    }),
    {
      name: "wms-open-tabs",
      storage: createJSONStorage(() => sessionStorage)
    }
  )
);
