import { API_BASE_URL, DATA_BASE_URL, DATA_MODE } from "../config";
import { ApiDataSource } from "./ApiDataSource";
import type { ScanDataSource } from "./ScanDataSource";
import { StaticDataSource } from "./StaticDataSource";

/** Picks the data source for this build (VITE_DATA_MODE). */
export function createDataSource(): ScanDataSource {
  return DATA_MODE === "api"
    ? new ApiDataSource(API_BASE_URL)
    : new StaticDataSource(DATA_BASE_URL);
}
