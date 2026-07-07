import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** 좌측 메뉴에서 연 화면 하나 = 본문 상단 탭 하나. path 로 식별한다. */
export type OpenTab = {
  path: string; // 라우트 경로 (예: "/inbound/inbound-schedule")
  label: string; // 탭에 표시할 화면명
};

/** 탭이 하나도 없을 때 돌아갈 기본 화면. AppRouter 의 index 리다이렉트와 동일. */
export const HOME_PATH = "/dashboard/logistics-status";

type TabsState = {
  tabs: OpenTab[];
  /** 탭을 열거나(없으면 추가) 라벨을 갱신한다. 이미 있으면 그대로 유지. */
  openTab: (tab: OpenTab) => void;
  closeTab: (path: string) => void;
  closeOthers: (path: string) => void;
  closeAll: () => void;
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
      closeTab: (path) => set((state) => ({ tabs: state.tabs.filter((item) => item.path !== path) })),
      closeOthers: (path) => set((state) => ({ tabs: state.tabs.filter((item) => item.path === path) })),
      closeAll: () => set({ tabs: [] })
    }),
    {
      name: "wms-open-tabs",
      storage: createJSONStorage(() => sessionStorage)
    }
  )
);
