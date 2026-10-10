import { API_BASE_URL, DATA_BASE_URL, DATA_MODE, DATA_VERSION } from "../config";
import { browserEventStore, eventsKey } from "./eventStore";
import { ApiDataSource } from "./ApiDataSource";
import type { ScanDataSource } from "./ScanDataSource";
import { StaticDataSource } from "./StaticDataSource";

/** Picks the data source for this build (VITE_DATA_MODE). */
export function createDataSource(): ScanDataSource {
  return DATA_MODE === "api"
    ? new ApiDataSource(API_BASE_URL)
    : new StaticDataSource(DATA_BASE_URL, {
        // Review changes are kept per data version (PRD 8.7).
        storeFor: (scanId) => browserEventStore(eventsKey(scanId, DATA_VERSION)),
      });
}
