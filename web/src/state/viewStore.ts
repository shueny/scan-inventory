import { create } from "zustand";
import { NO_FILTERS, type InstanceFilters, type Sort } from "../domain/filters";

export type ColorMode = "class" | "rgb";
/** What the panel under the 3D view shows. */
export type BottomTab = "inventory" | "queue" | "dashboard";
/** Which issues the review queue lists. */
export type QueueView = "open" | "closed";

/**
 * UI state shared by the 3D viewer, the filter panel, the table and the detail panel
 * (PRD 8.4). Server data (instances, issues) does not live here; it comes from the data
 * source through TanStack Query.
 */
export interface ViewState {
  selectedId: number | null;
  colorMode: ColorMode;
  backgroundVisible: boolean;
  filters: InstanceFilters;
  sort: Sort;
  bottomTab: BottomTab;
  queueView: QueueView;
  selectedIssueId: string | null;
  select: (id: number | null) => void;
  setColorMode: (mode: ColorMode) => void;
  setBackgroundVisible: (visible: boolean) => void;
  setFilters: (patch: Partial<InstanceFilters>) => void;
  resetFilters: () => void;
  /** Sort by a column; the same column again flips the direction. */
  sortBy: (key: Sort["key"]) => void;
  setBottomTab: (tab: BottomTab) => void;
  setQueueView: (view: QueueView) => void;
  /** Select an issue and its first object (null: none), so 3D and details follow. */
  selectIssue: (issueId: string | null, firstInstanceId: number | null) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  selectedId: null,
  colorMode: "class",
  backgroundVisible: true, // shown in muted grey by default (ADR 0007)
  filters: NO_FILTERS,
  sort: { key: "tag", dir: "asc" },
  bottomTab: "inventory",
  queueView: "open",
  selectedIssueId: null,
  select: (id) => set({ selectedId: id }),
  setColorMode: (colorMode) => set({ colorMode }),
  setBackgroundVisible: (backgroundVisible) => set({ backgroundVisible }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: NO_FILTERS }),
  sortBy: (key) =>
    set((s) => ({
      sort: { key, dir: s.sort.key === key && s.sort.dir === "asc" ? "desc" : "asc" },
    })),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setQueueView: (queueView) => set({ queueView }),
  selectIssue: (selectedIssueId, firstInstanceId) =>
    set({ selectedIssueId, selectedId: firstInstanceId }),
}));
