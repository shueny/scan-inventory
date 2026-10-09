// Data shapes shared by every data source. They follow docs/data-schema.md.
// Written by hand for now; T5 replaces them with types generated from the API's OpenAPI schema.

export type Vec3 = [number, number, number];

export type LocationSource = "pnid" | "tagged_nearest_tag" | "nearest_tag" | "background";

export type ReviewStatus = "unreviewed" | "confirmed" | "corrected" | "rejected";

export interface ClassInfo {
  id: number;
  name: string;
  color: string; // "#rrggbb"
  is_background: boolean;
  instance_count: number;
}

export interface ScanMeta {
  scan_id: string;
  name: string;
  source: string;
  licence: string;
  doi: string;
  instance_count: number;
  point_count: number;
  classes: ClassInfo[];
  zones: string[];
}

export interface Instance {
  scan_id: string;
  instance_id: number;
  class_id: number;
  class_name: string;
  is_background: boolean;
  point_count: number;
  centroid: Vec3;
  bbox_min: Vec3;
  bbox_max: Vec3;
  bbox_size: Vec3;
  length_est_m: number | null;
  diameter_est_m: number | null;
  has_tag: boolean;
  tag: string | null;
  all_tags: string[];
  element: string | null;
  nominal_inch: number | null;
  system: string | null;
  location: string | null;
  location_source: LocationSource;
  review_status: ReviewStatus;
  current_class_id: number;
}

export interface ReviewEvent {
  id: string;
  scan_id: string;
  instance_id: number;
  issue_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string; // ISO 8601
}

export interface InstanceDetail extends Instance {
  history: ReviewEvent[];
}

export interface InstanceChange {
  review_status?: ReviewStatus;
  current_class_id?: number;
  note?: string;
}

export type IssueType =
  | "class_mismatch"
  | "tag_missing_in_scan"
  | "untagged_equipment"
  | "tag_split"
  | "estimate_unreliable"
  | "zone_borrowed";

export type Severity = "high" | "medium" | "low";

export interface CandidateTag {
  tag: string;
  system: string | null;
  distance_m: number | null;
}

export interface Issue {
  issue_id: string;
  type: IssueType;
  severity: Severity;
  instance_ids: number[];
  tags: string[];
  title: string;
  detail: string;
  suggested_action: "change_class" | "assign_tag" | null;
  suggested_class_id: number | null;
  candidate_tags: CandidateTag[];
  status: "open" | "resolved" | "dismissed";
}

export interface Resolution {
  action: "accept_suggestion" | "change_class" | "assign_tag" | "dismiss";
  class_id?: number;
  tag?: string;
  note?: string;
}

export interface ResolveResult {
  issue: Issue;
  instances: InstanceDetail[];
}
