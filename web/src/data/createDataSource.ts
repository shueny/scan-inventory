import { DATA_BASE_URL, DATA_MODE } from "../config";
import type { ScanDataSource } from "./ScanDataSource";
import { StaticDataSource } from "./StaticDataSource";

/** Picks the data source for this build (VITE_DATA_MODE). */
export function createDataSource(): ScanDataSource {
  if (DATA_MODE === "api") {
    throw new Error("VITE_DATA_MODE=api needs ApiDataSource, which arrives in T5");
  }
  return new StaticDataSource(DATA_BASE_URL);
}
