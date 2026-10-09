// @vitest-environment node
import { memoryEventStore } from "../eventStore";
import { StaticDataSource } from "../StaticDataSource";
import { fixtureFetch } from "./fixtures";
import { contractSuite } from "./suite";

// Fixture files served from memory, events kept in memory: a fresh source is a reset.
contractSuite("StaticDataSource", () =>
  Promise.resolve(
    new StaticDataSource("/data", { fetchFn: fixtureFetch(), storeFor: () => memoryEventStore() }),
  ),
);
