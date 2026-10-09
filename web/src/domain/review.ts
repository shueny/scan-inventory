import { ConflictError, InvalidChangeError, NotFoundError } from "../data/ScanDataSource";
import type {
  Instance,
  InstanceChange,
  Issue,
  Resolution,
  ReviewEvent,
  ReviewStatus,
} from "../data/types";

/**
 * Review rules for the browser event log (StaticDataSource). They mirror the API's
 * services.py: same checks, same events, same resulting state. The shared contract
 * tests run both against the same data to keep them equal.
 *
 * State is never stored directly: it is the static data plus every event replayed in
 * order (`applyEvent`). Planning a change replays its own events on a copy, so there
 * is exactly one place that says what an event does.
 */

/** An event before the store gives it an id, an actor and a time. */
export type NewEvent = Pick<
  ReviewEvent,
  "instance_id" | "issue_id" | "action" | "from_value" | "to_value" | "note"
>;

export interface ReviewState {
  instances: Map<number, Instance>;
  issues: Map<string, Issue>;
}

const NOTE_MAX = 2000;
const TAG_MAX = 64;

/** What one event does to the state. Mutates `state`; callers pass a copy. */
export function applyEvent(state: ReviewState, e: NewEvent): void {
  if (e.action === "close_issue") {
    const issue = e.issue_id === null ? undefined : state.issues.get(e.issue_id);
    if (issue && e.to_value) issue.status = e.to_value as Issue["status"];
    return;
  }
  const inst = e.instance_id === null ? undefined : state.instances.get(e.instance_id);
  if (!inst || e.to_value === null) return;
  switch (e.action) {
    case "set_review_status":
      inst.review_status = e.to_value as ReviewStatus;
      break;
    case "change_class":
      inst.current_class_id = Number(e.to_value);
      break;
    case "assign_tag":
      if (inst.tag === null) inst.tag = e.to_value;
      if (!inst.all_tags.includes(e.to_value)) inst.all_tags = [...inst.all_tags, e.to_value];
      inst.has_tag = true;
      break;
  }
}

/** Deep enough copy for applyEvent: new maps and new instance/issue objects. */
export function cloneState(state: ReviewState): ReviewState {
  return {
    instances: new Map([...state.instances].map(([k, v]) => [k, { ...v }])),
    issues: new Map([...state.issues].map(([k, v]) => [k, { ...v }])),
  };
}

export function replay(state: ReviewState, events: readonly NewEvent[]): ReviewState {
  const next = cloneState(state);
  for (const e of events) applyEvent(next, e);
  return next;
}

// ---------------------------------------------------------------- planning

/** Collects events and applies each one to a scratch copy, like a transaction. */
class Plan {
  readonly events: NewEvent[] = [];
  readonly state: ReviewState;

  constructor(
    state: ReviewState,
    private readonly note: string | null,
    private readonly issueId: string | null,
  ) {
    this.state = cloneState(state);
  }

  emit(instanceId: number | null, action: string, from: unknown, to: unknown): void {
    const e: NewEvent = {
      instance_id: instanceId,
      issue_id: this.issueId,
      action,
      from_value: from === null || from === undefined ? null : String(from),
      to_value: to === null || to === undefined ? null : String(to),
      note: this.note,
    };
    applyEvent(this.state, e);
    this.events.push(e);
  }

  instance(id: number): Instance {
    const inst = this.state.instances.get(id);
    if (!inst) throw new NotFoundError(`instance ${id}`);
    return inst;
  }

  setStatus(id: number, status: ReviewStatus): void {
    const inst = this.instance(id);
    if (inst.review_status !== status)
      this.emit(id, "set_review_status", inst.review_status, status);
  }

  changeClass(id: number, classId: number): void {
    const inst = this.instance(id);
    if (inst.current_class_id !== classId) {
      this.emit(id, "change_class", inst.current_class_id, classId);
    }
  }
}

/** Trimmed note, null when empty; too long is an error (API: max 2000 characters). */
export function cleanNote(note: string | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  if (trimmed.length > NOTE_MAX) {
    throw new InvalidChangeError(`note is longer than ${NOTE_MAX} characters`);
  }
  return trimmed || null;
}

function checkClass(classIds: ReadonlySet<number>, classId: number, scanId: string): void {
  if (!classIds.has(classId)) {
    throw new InvalidChangeError(`class ${classId} does not exist in scan ${scanId}`);
  }
}

/**
 * PATCH an instance: change review status and/or class. Changing the class without a
 * status marks the object as corrected. Returns the events (none if nothing changes).
 */
export function planInstanceChange(
  state: ReviewState,
  scanId: string,
  classIds: ReadonlySet<number>,
  instanceId: number,
  change: InstanceChange,
): NewEvent[] {
  if (change.review_status === undefined && change.current_class_id === undefined) {
    throw new InvalidChangeError("give review_status and/or current_class_id");
  }
  const plan = new Plan(state, cleanNote(change.note), null);
  plan.instance(instanceId); // 404 before the class check, as in the API
  if (change.current_class_id !== undefined) {
    checkClass(classIds, change.current_class_id, scanId);
    plan.changeClass(instanceId, change.current_class_id);
  }
  const status =
    change.review_status ?? (change.current_class_id !== undefined ? "corrected" : undefined);
  if (status !== undefined) plan.setStatus(instanceId, status);
  return plan.events;
}

/**
 * Resolve or dismiss an issue and change its objects, all or nothing. Checks run in the
 * API's order: the request body first (422), then unknown ids (404), then the state (409).
 */
export function planResolution(
  state: ReviewState,
  scanId: string,
  classIds: ReadonlySet<number>,
  issueId: string,
  resolution: Resolution,
): NewEvent[] {
  const note = cleanNote(resolution.note);
  const tag = resolution.tag?.trim();
  if (resolution.action === "change_class" && resolution.class_id === undefined) {
    throw new InvalidChangeError("change_class needs class_id");
  }
  if (resolution.action === "assign_tag" && !tag) {
    throw new InvalidChangeError("assign_tag needs tag");
  }
  if (tag !== undefined && tag.length > TAG_MAX) {
    throw new InvalidChangeError(`tag is longer than ${TAG_MAX} characters`);
  }

  const issue = state.issues.get(issueId);
  if (!issue) throw new NotFoundError(`issue ${issueId}`);
  if (issue.status !== "open") {
    throw new ConflictError(`issue ${issueId} is already ${issue.status}`);
  }
  const plan = new Plan(state, note, issueId);
  const ids = issue.instance_ids;
  ids.forEach((id) => plan.instance(id)); // every object of the issue must exist

  let action = resolution.action;
  let classId = resolution.class_id;
  if (action === "accept_suggestion") {
    if (issue.suggested_action !== "change_class" || issue.suggested_class_id === null) {
      throw new InvalidChangeError(
        "this issue has no class suggestion to accept; use assign_tag or dismiss",
      );
    }
    action = "change_class";
    classId = issue.suggested_class_id;
  }

  if (action === "change_class") {
    if (ids.length === 0 || classId === undefined) {
      throw new InvalidChangeError("change_class needs an issue with objects and a class");
    }
    checkClass(classIds, classId, scanId);
    for (const id of ids) {
      plan.changeClass(id, classId);
      plan.setStatus(id, "corrected");
    }
  } else if (action === "assign_tag") {
    const [id] = ids;
    if (ids.length !== 1 || id === undefined || !tag) {
      throw new InvalidChangeError("assign_tag needs an issue with exactly one object");
    }
    plan.emit(id, "assign_tag", plan.instance(id).tag, tag);
    plan.setStatus(id, "corrected");
  }

  const closed = action === "dismiss" ? "dismissed" : "resolved";
  const targets: (number | null)[] = ids.length > 0 ? ids : [null];
  for (const target of targets) plan.emit(target, "close_issue", issue.status, closed);
  return plan.events;
}

// ---------------------------------------------------------------- sorting

const SEVERITY_RANK: Record<Issue["severity"], number> = { high: 0, medium: 1, low: 2 };

/** High -> low severity; within a severity the original order is kept (stable sort). */
export function sortBySeverity(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
