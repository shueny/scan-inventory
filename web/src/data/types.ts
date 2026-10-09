// Data shapes shared by every data source. They are generated from the API's OpenAPI
// schema (api-schema.d.ts, `make types`), so the frontend and the API cannot drift apart
// (PRD 6). This file only gives the generated schemas short names.

import type { components } from "./api-schema";

type Schemas = components["schemas"];

export type Vec3 = [number, number, number];

export type ClassInfo = Schemas["ClassInfo"];
export type ScanMeta = Schemas["ScanMeta"];
export type Instance = Schemas["InstanceOut"];
export type InstanceDetail = Schemas["InstanceDetail"];
export type ReviewEvent = Schemas["ReviewEventOut"];
export type CandidateTag = Schemas["CandidateTag"];
export type Issue = Schemas["IssueOut"];
export type ResolveResult = Schemas["ResolveResult"];

export type LocationSource = Instance["location_source"];
export type ReviewStatus = Instance["review_status"];
export type IssueType = Issue["type"];
export type Severity = Issue["severity"];
export type IssueStatus = Issue["status"];

// Request bodies. The generated types allow `null` for "not given"; the app leaves the
// field out instead.
type NoNulls<T> = { [K in keyof T]?: Exclude<T[K], null> };
export type InstanceChange = NoNulls<Schemas["InstanceChange"]>;
export type Resolution = NoNulls<Omit<Schemas["Resolution"], "action">> &
  Pick<Schemas["Resolution"], "action">;
