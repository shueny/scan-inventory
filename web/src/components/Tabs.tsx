import { useRef, type KeyboardEvent } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

/** Ids that tie a tab to its panel (aria-controls / aria-labelledby). */
export const tabId = (group: string, value: string) => `${group}-tab-${value}`;
export const panelId = (group: string, value: string) => `${group}-panel-${value}`;

/**
 * Tab bar following the WAI-ARIA tabs pattern: one Tab stop for the whole bar (the
 * selected tab), Left/Right arrows move between tabs, Home/End jump to the ends, and
 * each tab names its panel. The caller renders the panel with `panelId` / `tabId`.
 */
export function Tabs<T extends string>({
  group,
  label,
  items,
  selected,
  onSelect,
  variant = "pill",
}: {
  group: string;
  label: string;
  items: TabItem<T>[];
  selected: T;
  onSelect: (value: T) => void;
  variant?: "pill" | "underline";
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const move = (e: KeyboardEvent, from: number) => {
    const last = items.length - 1;
    const to =
      e.key === "ArrowRight"
        ? (from + 1) % items.length
        : e.key === "ArrowLeft"
          ? (from + last) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    const item = to === null ? undefined : items[to];
    if (!item) return;
    e.preventDefault();
    onSelect(item.value);
    refs.current.get(item.value)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={variant === "underline" ? "flex gap-1 px-2 pt-1" : "flex gap-1 px-2 py-1"}
    >
      {items.map((item, i) => {
        const active = item.value === selected;
        const style =
          variant === "underline"
            ? `-mb-px border-b-2 px-3 py-1.5 text-sm ${
                active
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`
            : `rounded px-2.5 py-1 text-xs ${active ? "bg-ink text-white" : "text-ink hover:bg-canvas"}`;
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) refs.current.set(item.value, el);
              else refs.current.delete(item.value);
            }}
            type="button"
            role="tab"
            id={tabId(group, item.value)}
            aria-selected={active}
            aria-controls={panelId(group, item.value)}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(item.value)}
            onKeyDown={(e) => move(e, i)}
            className={style}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
