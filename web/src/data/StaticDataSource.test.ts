import { NotFoundError } from "./ScanDataSource";
import { StaticDataSource } from "./StaticDataSource";

const files: Record<string, unknown> = {
  "/data/scan.json": { scan_id: "nora", name: "NORA", classes: [], zones: ["NW"] },
  "/data/instances.json": {
    summary: {},
    instances: [
      { scan_id: "nora", instance_id: 1, class_id: 12, tag: "PSV-1" },
      { scan_id: "nora", instance_id: 2, class_id: 8, tag: null },
    ],
  },
  "/data/issues.json": { issues: [{ issue_id: "class_mismatch:1", severity: "high" }] },
};

function fakeFetch() {
  const calls: string[] = [];
  const fn = (url: string) => {
    calls.push(url);
    const body = files[url];
    return Promise.resolve(
      body ? new Response(JSON.stringify(body)) : new Response("missing", { status: 404 }),
    );
  };
  return { fn, calls };
}

describe("StaticDataSource", () => {
  it("lists instances as unreviewed with their annotated class as current class", async () => {
    const source = new StaticDataSource("/data", fakeFetch().fn);

    const instances = await source.listInstances("nora");

    expect(instances).toHaveLength(2);
    expect(instances[0]).toMatchObject({
      instance_id: 1,
      review_status: "unreviewed",
      current_class_id: 12,
    });
  });

  it("returns one instance with an empty history", async () => {
    const source = new StaticDataSource("/data", fakeFetch().fn);

    const detail = await source.getInstance("nora", 2);

    expect(detail.instance_id).toBe(2);
    expect(detail.history).toEqual([]);
  });

  it("rejects unknown scans and instances with NotFoundError", async () => {
    const source = new StaticDataSource("/data", fakeFetch().fn);

    await expect(source.getScan("other")).rejects.toBeInstanceOf(NotFoundError);
    await expect(source.getInstance("nora", 999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marks every issue as open", async () => {
    const source = new StaticDataSource("/data", fakeFetch().fn);

    const [issue] = await source.listIssues("nora");

    expect(issue?.status).toBe("open");
  });

  it("downloads each file only once", async () => {
    const { fn, calls } = fakeFetch();
    const source = new StaticDataSource("/data", fn);

    await Promise.all([source.listInstances("nora"), source.getInstance("nora", 1)]);

    expect(calls.filter((u) => u.endsWith("instances.json"))).toHaveLength(1);
    expect(calls.filter((u) => u.endsWith("scan.json"))).toHaveLength(1);
  });

  it("reports a failed download and retries on the next call", async () => {
    let fail = true;
    const source = new StaticDataSource("/data", (url) =>
      fail
        ? Promise.resolve(new Response("down", { status: 503 }))
        : Promise.resolve(new Response(JSON.stringify(files[url]))),
    );

    await expect(source.getScan("nora")).rejects.toThrow("HTTP 503");
    fail = false;
    await expect(source.getScan("nora")).resolves.toMatchObject({ scan_id: "nora" });
  });

  it("does not support review changes yet", async () => {
    const source = new StaticDataSource("/data", fakeFetch().fn);

    await expect(
      source.updateInstance("nora", 1, { review_status: "confirmed" }),
    ).rejects.toThrow();
  });
});
