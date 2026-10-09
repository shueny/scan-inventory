import {
  ConflictError,
  InvalidChangeError,
  NotFoundError,
  type ScanDataSource,
} from "./ScanDataSource";
import type {
  Instance,
  InstanceChange,
  InstanceDetail,
  Issue,
  Resolution,
  ResolveResult,
  ScanMeta,
} from "./types";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Any other failed request (server error, network down). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Local full mode (PRD 6.1): every call goes to the FastAPI service (PRD 8.2). */
export class ApiDataSource implements ScanDataSource {
  private readonly fetchFn: Fetch;

  /** `baseUrl` ends with /api, e.g. http://localhost:8000/api. */
  constructor(
    private readonly baseUrl: string,
    fetchFn?: Fetch,
  ) {
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
  }

  getScan(scanId: string): Promise<ScanMeta> {
    return this.request(`/scans/${enc(scanId)}`);
  }

  listInstances(scanId: string): Promise<Instance[]> {
    // The app filters in the browser, so it always asks for every object.
    return this.request(`/scans/${enc(scanId)}/instances?include_background=true`);
  }

  getInstance(scanId: string, id: number): Promise<InstanceDetail> {
    return this.request(`/scans/${enc(scanId)}/instances/${id}`);
  }

  updateInstance(scanId: string, id: number, change: InstanceChange): Promise<InstanceDetail> {
    return this.request(`/scans/${enc(scanId)}/instances/${id}`, "PATCH", change);
  }

  listIssues(scanId: string): Promise<Issue[]> {
    return this.request(`/scans/${enc(scanId)}/issues`);
  }

  resolveIssue(scanId: string, issueId: string, resolution: Resolution): Promise<ResolveResult> {
    return this.request(`/scans/${enc(scanId)}/issues/${enc(issueId)}/resolve`, "POST", resolution);
  }

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchFn(`${this.baseUrl}${path}`, init);
    if (res.ok) return (await res.json()) as T;
    throw toError(res.status, await readDetail(res));
  }
}

const enc = encodeURIComponent;

/** The API's error message: a string, or Pydantic's list of validation errors. */
async function readDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const { detail } = body;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: unknown }) => (typeof d.msg === "string" ? d.msg : JSON.stringify(d)))
        .join("; ");
    }
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

function toError(status: number, detail: string): Error {
  switch (status) {
    case 404: {
      // The API says "<what> not found"; NotFoundError adds " not found" itself.
      return new NotFoundError(detail.replace(/ not found$/, ""));
    }
    case 409:
      return new ConflictError(detail);
    case 422:
      return new InvalidChangeError(detail);
    default:
      return new ApiError(detail, status);
  }
}
