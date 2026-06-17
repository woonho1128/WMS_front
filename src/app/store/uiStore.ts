import { create } from "zustand";
import type { UserRole } from "../roles";

type UiState = {
  currentRole: UserRole;
  darkMode: boolean;
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  setCurrentRole: (role: UserRole) => void;
  toggleDarkMode: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setRightPanelOpen: (value: boolean) => void;
  setBottomPanelOpen: (value: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  currentRole: "admin",
  darkMode: false,
  sidebarCollapsed: false,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  setCurrentRole: (role) => set({ currentRole: role }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  setRightPanelOpen: (value) => set({ rightPanelOpen: value }),
  setBottomPanelOpen: (value) => set({ bottomPanelOpen: value })
}));
