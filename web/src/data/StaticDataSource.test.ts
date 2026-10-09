import { fixtureFetch, SCAN } from "./contract/fixtures";
import { browserEventStore, eventsKey, memoryEventStore } from "./eventStore";
import { StaticDataSource } from "./StaticDataSource";

// Behaviour shared with the API is in contract/suite.ts. These tests cover what only the
// static demo does: file loading and the review events kept in browser storage.

/** A minimal in-memory Storage; `full` refuses writes like a full quota. */
function fakeStorage(options: { full?: boolean } = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (options.full) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

function source(storage: Storage, fetchFn = fixtureFetch()) {
  return new StaticDataSource("/data", {
    fetchFn,
    storeFor: (scanId) => browserEventStore(eventsKey(scanId), storage),
  });
}

describe("StaticDataSource files", () => {
  it("downloads each file only once", async () => {
    const calls: string[] = [];
    const fetchAll = fixtureFetch();
    const s = new StaticDataSource("/data", {
      fetchFn: (url) => (calls.push(url), fetchAll(url)),
      storeFor: () => memoryEventStore(),
    });

    await Promise.all([s.listInstances(SCAN), s.getInstance(SCAN, 1), s.listIssues(SCAN)]);

    expect(calls.sort()).toEqual(["/data/instances.json", "/data/issues.json", "/data/scan.json"]);
  });

  it("reports a failed download and retries on the next call", async () => {
    let fail = true;
    const fetchAll = fixtureFetch();
    const s = new StaticDataSource("/data", {
      fetchFn: (url) =>
        fail ? Promise.resolve(new Response("down", { status: 503 })) : fetchAll(url),
      storeFor: () => memoryEventStore(),
    });

    await expect(s.getScan(SCAN)).rejects.toThrow("HTTP 503");
    fail = false;
    await expect(s.getScan(SCAN)).resolves.toMatchObject({ scan_id: SCAN });
  });
});

describe("StaticDataSource review events in the browser", () => {
  it("keeps changes after a page reload (a new source on the same storage)", async () => {
    const storage = fakeStorage();
    await source(storage).updateInstance(SCAN, 2, { review_status: "rejected", note: "ghost" });

    const reloaded = await source(storage).getInstance(SCAN, 2);

    expect(reloaded.review_status).toBe("rejected");
    expect(reloaded.history).toHaveLength(1);
    expect(JSON.parse(storage.getItem("scan-inventory:test:v1:events") ?? "[]")).toHaveLength(1);
  });

  it("numbers events 1, 2, 3 and stamps them with the given time", async () => {
    const storage = fakeStorage();
    const s = new StaticDataSource("/data", {
      fetchFn: fixtureFetch(),
      storeFor: (id) => browserEventStore(eventsKey(id), storage),
      now: () => new Date("2026-10-09T12:00:00Z"),
    });

    await s.updateInstance(SCAN, 3, { current_class_id: 1 });
    await s.updateInstance(SCAN, 2, { review_status: "confirmed" });

    const all = JSON.parse(storage.getItem(eventsKey(SCAN)) ?? "[]") as { id: number }[];
    expect(all.map((e) => e.id)).toEqual([1, 2, 3]);
    expect((await s.getInstance(SCAN, 2)).history[0]?.created_at).toBe("2026-10-09T12:00:00.000Z");
  });

  it("resetDemo forgets every change", async () => {
    const storage = fakeStorage();
    const s = source(storage);
    await s.resolveIssue(SCAN, "class_mismatch:1", { action: "accept_suggestion" });

    await s.resetDemo();

    expect((await s.getInstance(SCAN, 1)).review_status).toBe("unreviewed");
    expect((await s.listIssues(SCAN)).every((i) => i.status === "open")).toBe(true);
    expect(storage.getItem(eventsKey(SCAN))).toBeNull();
  });

  it("works in memory when browser storage is blocked, and says so", async () => {
    const blocked = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const s = new StaticDataSource("/data", { fetchFn: fixtureFetch() }); // default store

    await s.updateInstance(SCAN, 2, { review_status: "confirmed" });

    expect((await s.getInstance(SCAN, 2)).review_status).toBe("confirmed");
    expect(s.isPersistent(SCAN)).toBe(false);
    blocked.mockRestore();
  });

  it("falls back to memory when storage refuses writes (e.g. full)", async () => {
    const s = source(fakeStorage({ full: true }));

    await s.updateInstance(SCAN, 2, { review_status: "confirmed" });

    expect((await s.getInstance(SCAN, 2)).review_status).toBe("confirmed");
    expect(s.isPersistent(SCAN)).toBe(false);
  });

  it("ignores unreadable stored data and events stored for another data version", async () => {
    const storage = fakeStorage();
    storage.setItem(eventsKey(SCAN), "{not json");
    storage.setItem(eventsKey(SCAN, "v0"), JSON.stringify([{ id: 1, action: "change_class" }]));

    const detail = await source(storage).getInstance(SCAN, 1);

    expect(detail.review_status).toBe("unreviewed");
    expect(detail.history).toEqual([]);
  });
});
