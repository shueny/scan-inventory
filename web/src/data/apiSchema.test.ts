// @vitest-environment node
import { readFileSync } from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("generated API types", () => {
  it("match openapi.json (run `make types` after an API change)", async () => {
    const schema = JSON.parse(read("./openapi.json")) as Parameters<typeof openapiTS>[0];
    const expected = astToString(await openapiTS(schema, { arrayLength: true }));

    const file = read("./api-schema.d.ts");
    const withoutBanner = file.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, "");

    expect(withoutBanner).toBe(expected);
  });
});
