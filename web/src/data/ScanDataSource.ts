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
 */
export interface ScanDataSource {
  getScan(scanId: string): Promise<ScanMeta>;
  /** All instances of the scan (263); filtering happens in the client. */
  listInstances(scanId: string): Promise<Instance[]>;
  /** One instance including its review history. */
  getInstance(scanId: string, id: number): Promise<InstanceDetail>;
  updateInstance(scanId: string, id: number, change: InstanceChange): Promise<InstanceDetail>;
  listIssues(scanId: string): Promise<Issue[]>;
  resolveIssue(scanId: string, issueId: string, resolution: Resolution): Promise<ResolveResult>;
  /** Demo only: forget every change made in this browser. */
  resetDemo?(): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}
