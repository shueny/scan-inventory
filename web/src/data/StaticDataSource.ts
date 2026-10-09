import { NotFoundError, type ScanDataSource } from "./ScanDataSource";
import type {
  Instance,
  InstanceChange,
  InstanceDetail,
  Issue,
  Resolution,
  ResolveResult,
  ScanMeta,
} from "./types";

type Fetch = (url: string) => Promise<Response>;

const NOT_YET = "Review changes are not available yet (T5)";

// Raw file shapes written by the pipeline (docs/data-schema.md).
type RawInstance = Omit<Instance, "review_status" | "current_class_id">;
type RawIssue = Omit<Issue, "status">;

/**
 * Reads the pipeline's JSON files (scan.json, instances.json, issues.json) as static
 * files. Read-only in T3; T5 adds the browser event log for review changes.
 */
export class StaticDataSource implements ScanDataSource {
  private files = new Map<string, Promise<unknown>>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: Fetch = (url) => fetch(url),
  ) {}

  async getScan(scanId: string): Promise<ScanMeta> {
    const meta = await this.load<ScanMeta>("scan.json");
    if (meta.scan_id !== scanId) throw new NotFoundError(`scan ${scanId}`);
    return meta;
  }

  async listInstances(scanId: string): Promise<Instance[]> {
    await this.getScan(scanId);
    const file = await this.load<{ instances: RawInstance[] }>("instances.json");
    return file.instances.map((raw) => ({
      ...raw,
      review_status: "unreviewed",
      current_class_id: raw.class_id,
    }));
  }

  async getInstance(scanId: string, id: number): Promise<InstanceDetail> {
    const instance = (await this.listInstances(scanId)).find((i) => i.instance_id === id);
    if (!instance) throw new NotFoundError(`instance ${id}`);
    return { ...instance, history: [] };
  }

  async listIssues(scanId: string): Promise<Issue[]> {
    await this.getScan(scanId);
    const file = await this.load<{ issues: RawIssue[] }>("issues.json");
    return file.issues.map((raw) => ({ ...raw, status: "open" }));
  }

  // Review changes arrive in T5 (browser event log).
  updateInstance(_scanId: string, _id: number, _change: InstanceChange): Promise<InstanceDetail> {
    return Promise.reject(new Error(NOT_YET));
  }

  resolveIssue(_scanId: string, _issueId: string, _r: Resolution): Promise<ResolveResult> {
    return Promise.reject(new Error(NOT_YET));
  }

  /** Each file is downloaded once and shared by every call. */
  private load<T>(name: string): Promise<T> {
    let file = this.files.get(name);
    if (!file) {
      file = this.fetchFn(`${this.baseUrl}/${name}`).then((res) => {
        if (!res.ok) throw new Error(`Could not load ${name}: HTTP ${res.status}`);
        return res.json();
      });
      file.catch(() => this.files.delete(name)); // allow a retry after a failure
      this.files.set(name, file);
    }
    return file as Promise<T>;
  }
}
