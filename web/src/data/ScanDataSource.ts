import type {
  Instance,
  InstanceChange,
  InstanceDetail,
  Issue,
  Resolution,
  ResolveResult,
  ScanMeta,
} from "./types";

/**
 * The only way the app reads or changes data (PRD 6.1). Components and hooks never
 * call fetch directly. ApiDataSource (local full mode) and StaticDataSource (public
 * demo) implement it; the mode is chosen at build time with VITE_DATA_MODE.
 * Both pass the same contract tests (src/data/contract/).
 */
export interface ScanDataSource {
  getScan(scanId: string): Promise<ScanMeta>;
  /** All instances of the scan, background included; filtering happens in the client. */
  listInstances(scanId: string): Promise<Instance[]>;
  /** One instance including its review history. */
  getInstance(scanId: string, id: number): Promise<InstanceDetail>;
  updateInstance(scanId: string, id: number, change: InstanceChange): Promise<InstanceDetail>;
  /** All issues, sorted high -> low severity. */
  listIssues(scanId: string): Promise<Issue[]>;
  resolveIssue(scanId: string, issueId: string, resolution: Resolution): Promise<ResolveResult>;
  /** Demo only: forget every change made in this browser. */
  resetDemo?(): Promise<void>;
}

// The same three errors as the API (HTTP 404, 422, 409), so the UI handles both modes alike.

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** Well-formed but not allowed, e.g. an unknown class (API: 422). */
export class InvalidChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidChangeError";
  }
}

/** Conflicts with the current state, e.g. the issue is already closed (API: 409). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
