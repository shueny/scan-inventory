import type { ReviewEvent } from "./types";

/**
 * Where the static demo keeps its review events: an append-only list, saved in the
 * browser (PRD 6.1, 8.7). If browser storage is blocked (private window, disabled site
 * data), the list lives in memory for this page only and `persistent` is false.
 */
export interface EventStore {
  readonly persistent: boolean;
  load(): ReviewEvent[];
  save(events: readonly ReviewEvent[]): void;
  clear(): void;
}

/** Storage key per scan and data version; events of another version are never read. */
export function eventsKey(scanId: string, version = "v1"): string {
  return `scan-inventory:${scanId}:${version}:events`;
}

export function memoryEventStore(initial: readonly ReviewEvent[] = []): EventStore {
  let events = [...initial];
  return {
    persistent: false,
    load: () => [...events],
    save: (next) => {
      events = [...next];
    },
    clear: () => {
      events = [];
    },
  };
}

function browserStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = "scan-inventory:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null; // blocked or not available
  }
}

export function browserEventStore(key: string, storage = browserStorage()): EventStore {
  if (!storage) return memoryEventStore();
  const fallback = memoryEventStore();
  let failed = false;
  return {
    get persistent() {
      return !failed;
    },
    load() {
      if (failed) return fallback.load();
      try {
        const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? (parsed as ReviewEvent[]) : [];
      } catch {
        return []; // unreadable data is ignored, not fatal
      }
    },
    save(events) {
      fallback.save(events);
      if (failed) return;
      try {
        storage.setItem(key, JSON.stringify(events));
      } catch {
        failed = true; // e.g. quota exceeded: keep working in memory
      }
    },
    clear() {
      fallback.clear();
      try {
        storage.removeItem(key);
      } catch {
        // nothing to clear
      }
    },
  };
}
