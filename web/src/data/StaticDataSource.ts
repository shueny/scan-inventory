import {
  planInstanceChange,
  planResolution,
  replay,
  sortBySeverity,
  type NewEvent,
  type ReviewState,
} from "../domain/review";
import { browserEventStore, eventsKey, type EventStore } from "./eventStore";
import { NotFoundError, type ScanDataSource } from "./ScanDataSource";
import type {
  Instance,
  InstanceChange,
  InstanceDetail,
  Issue,
  Resolution,
  ResolveResult,
  ReviewEvent,
  ScanMeta,
} from "./types";

type Fetch = (url: string) => Promise<Response>;

// Raw file shapes written by the pipeline (docs/data-schema.md).
type RawInstance = Omit<Instance, "review_status" | "current_class_id">;
type RawIssue = Omit<Issue, "status" | "history">;

interface Base {
  meta: ScanMeta;
  state: ReviewState;
  classIds: Set<number>;
}

export interface StaticOptions {
  fetchFn?: Fetch;
  /** Where review events are kept; default: browser storage, one list per scan. */
  storeFor?: (scanId: string) => EventStore;
  now?: () => Date;
}

/**
 * Public demo mode (PRD 6.1): reads the pipeline's JSON files and keeps review changes
 * as an append-only event list in the browser. The current state is always the static
 * data with every event replayed on top (domain/review.ts), the same events the API
 * writes to its review_event table.
 */
export class StaticDataSource implements ScanDataSource {
  private files = new Map<string, Promise<unknown>>();
  private stores = new Map<string, EventStore>();
  private readonly fetchFn: Fetch;
  private readonly storeFor: (scanId: string) => EventStore;
  private readonly now: () => Date;

  constructor(
    private readonly baseUrl: string,
    options: StaticOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? ((url) => fetch(url));
    this.storeFor = options.storeFor ?? ((scanId) => browserEventStore(eventsKey(scanId)));
    this.now = options.now ?? (() => new Date());
  }

  /** False when browser storage is blocked and changes last only for this page. */
  isPersistent(scanId: string): boolean {
    return this.store(scanId).persistent;
  }

  async getScan(scanId: string): Promise<ScanMeta> {
    return (await this.base(scanId)).meta;
  }

  async listInstances(scanId: string): Promise<Instance[]> {
    const { state } = await this.current(scanId);
    return [...state.instances.values()].sort((a, b) => a.instance_id - b.instance_id);
  }

  async getInstance(scanId: string, id: number): Promise<InstanceDetail> {
    const { state, events } = await this.current(scanId);
    return this.detail(scanId, state, events, id);
  }

  async listIssues(scanId: string): Promise<Issue[]> {
    const { state, events } = await this.current(scanId);
    return sortBySeverity([...state.issues.values()].map((i) => withHistory(i, events)));
  }

  async updateInstance(
    scanId: string,
    id: number,
    change: InstanceChange,
  ): Promise<InstanceDetail> {
    const { classIds } = await this.base(scanId);
    const { state } = await this.current(scanId);
    const planned = planInstanceChange(state, scanId, classIds, id, change);
    this.append(scanId, planned);
    return this.getInstance(scanId, id);
  }

  async resolveIssue(
    scanId: string,
    issueId: string,
    resolution: Resolution,
  ): Promise<ResolveResult> {
    const { classIds } = await this.base(scanId);
    const before = await this.current(scanId);
    const planned = planResolution(before.state, scanId, classIds, issueId, resolution);
    this.append(scanId, planned);

    const { state, events } = await this.current(scanId);
    const issue = state.issues.get(issueId);
    if (!issue) throw new NotFoundError(`issue ${issueId}`); // not reached: checked by the plan
    return {
      issue: withHistory(issue, events),
      instances: issue.instance_ids.map((id) => this.detail(scanId, state, events, id)),
    };
  }

  async resetDemo(): Promise<void> {
    for (const store of this.stores.values()) store.clear();
  }

  // ---------------------------------------------------------------- internals

  private store(scanId: string): EventStore {
    let store = this.stores.get(scanId);
    if (!store) {
      store = this.storeFor(scanId);
      this.stores.set(scanId, store);
    }
    return store;
  }

  private append(scanId: string, planned: NewEvent[]): void {
    if (planned.length === 0) return;
    const store = this.store(scanId);
    const events = store.load();
    let id = events.reduce((max, e) => Math.max(max, e.id), 0);
    const createdAt = this.now().toISOString();
    for (const e of planned) {
      events.push({ ...e, id: ++id, scan_id: scanId, actor: "local user", created_at: createdAt });
    }
    store.save(events);
  }

  private async current(scanId: string): Promise<{ state: ReviewState; events: ReviewEvent[] }> {
    const { state } = await this.base(scanId);
    const events = this.store(scanId).load();
    return { state: replay(state, events), events };
  }

  private detail(
    scanId: string,
    state: ReviewState,
    events: ReviewEvent[],
    id: number,
  ): InstanceDetail {
    const instance = state.instances.get(id);
    if (!instance) throw new NotFoundError(`instance ${id} in scan ${scanId}`);
    return { ...instance, history: events.filter((e) => e.instance_id === id) };
  }

  /** Static data for one scan, loaded once; class counts computed like the API does. */
  private async base(scanId: string): Promise<Base> {
    const meta = await this.load<ScanMeta>("scan.json");
    if (meta.scan_id !== scanId) throw new NotFoundError(`scan ${scanId}`);
    const [instancesFile, issuesFile] = await Promise.all([
      this.load<{ instances: RawInstance[] }>("instances.json"),
      this.load<{ issues: RawIssue[] }>("issues.json"),
    ]);

    const counts = new Map<number, number>();
    for (const i of instancesFile.instances) {
      counts.set(i.class_id, (counts.get(i.class_id) ?? 0) + 1);
    }
    const names = new Map(meta.classes.map((c) => [c.id, c.name]));
    return {
      meta: {
        scan_id: meta.scan_id,
        name: meta.name,
        source: meta.source,
        licence: meta.licence,
        doi: meta.doi,
        instance_count: instancesFile.instances.length,
        point_count: meta.point_count,
        classes: meta.classes.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          is_background: c.is_background,
          instance_count: counts.get(c.id) ?? 0,
        })),
        zones: meta.zones,
      },
      classIds: new Set(meta.classes.map((c) => c.id)),
      state: {
        instances: new Map(
          instancesFile.instances.map((raw) => [raw.instance_id, toInstance(raw, names)]),
        ),
        issues: new Map(issuesFile.issues.map((raw) => [raw.issue_id, toIssue(raw)])),
      },
    };
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

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Exactly the fields the API returns, derived the same way: class name from the scan's
 * class list, box size from the box. The files carry a few more pipeline-only fields.
 */
function toInstance(raw: RawInstance, classNames: Map<number, string>): Instance {
  return {
    scan_id: raw.scan_id,
    instance_id: raw.instance_id,
    class_id: raw.class_id,
    class_name: classNames.get(raw.class_id) ?? raw.class_name,
    is_background: raw.is_background,
    point_count: raw.point_count,
    centroid: raw.centroid,
    bbox_min: raw.bbox_min,
    bbox_max: raw.bbox_max,
    bbox_size: [
      round4(raw.bbox_max[0] - raw.bbox_min[0]),
      round4(raw.bbox_max[1] - raw.bbox_min[1]),
      round4(raw.bbox_max[2] - raw.bbox_min[2]),
    ],
    length_est_m: raw.length_est_m,
    diameter_est_m: raw.diameter_est_m,
    has_tag: raw.has_tag,
    tag: raw.tag,
    all_tags: raw.all_tags,
    element: raw.element,
    nominal_inch: raw.nominal_inch,
    system: raw.system,
    location: raw.location,
    location_source: raw.location_source,
    review_status: "unreviewed",
    current_class_id: raw.class_id,
  };
}

function toIssue(raw: RawIssue): Issue {
  return {
    issue_id: raw.issue_id,
    type: raw.type,
    severity: raw.severity,
    instance_ids: raw.instance_ids,
    tags: raw.tags,
    title: raw.title,
    detail: raw.detail,
    suggested_action: raw.suggested_action,
    suggested_class_id: raw.suggested_class_id,
    candidate_tags: raw.candidate_tags,
    status: "open",
    history: [],
  };
}

/** The issue with every event written while resolving it, oldest first (as the API). */
function withHistory(issue: Issue, events: ReviewEvent[]): Issue {
  return { ...issue, history: events.filter((e) => e.issue_id === issue.issue_id) };
}
