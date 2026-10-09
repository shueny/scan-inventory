import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The API's own test data (api/tests/fixtures/): scan "test", 6 objects, 6 issues.
 * Both data sources are checked against it, so they are compared on identical data.
 */
// Tests run from web/ (pnpm scripts). import.meta.url is not a file: URL under jsdom.
const FIXTURES = join(process.cwd(), "..", "api", "tests", "fixtures");

export const SCAN = "test";

/** A fetch that serves the fixture files under /data, for StaticDataSource. */
export function fixtureFetch(): (url: string) => Promise<Response> {
  return (url) => {
    const name = url.replace(/^\/data\//, "");
    try {
      return Promise.resolve(new Response(readFileSync(join(FIXTURES, name), "utf8")));
    } catch {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
  };
}
