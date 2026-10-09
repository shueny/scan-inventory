import { create } from "zustand";

export type ColorMode = "class" | "rgb";

/**
 * UI state shared by the 3D viewer, the lists and the detail panel (PRD 8.4).
 * Server data (instances, issues) does not live here; it comes from the data source.
 */
export interface ViewState {
  selectedId: number | null;
  colorMode: ColorMode;
  backgroundVisible: boolean;
  select: (id: number | null) => void;
  setColorMode: (mode: ColorMode) => void;
  setBackgroundVisible: (visible: boolean) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  selectedId: null,
  colorMode: "class",
  backgroundVisible: true, // shown in muted grey by default (ADR 0007)
  select: (id) => set({ selectedId: id }),
  setColorMode: (colorMode) => set({ colorMode }),
  setBackgroundVisible: (backgroundVisible) => set({ backgroundVisible }),
}));
