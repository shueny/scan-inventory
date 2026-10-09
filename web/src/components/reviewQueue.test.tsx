import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataSourceProvider } from "../data/DataSourceProvider";
import { memoryEventStore } from "../data/eventStore";
import { useInstances, useIssues, useScan } from "../data/hooks";
import { StaticDataSource } from "../data/StaticDataSource";
import { useViewStore } from "../state/viewStore";
import { ReviewQueue } from "./ReviewQueue";

// The real StaticDataSource on the committed fixture plant (scan "nora", 6 objects,
// 5 issues), so these tests go through the same resolve rules as the demo.
const FIXTURES = join(process.cwd(), "e2e", "fixtures", "data");
const fetchFixture = (url: string) =>
  Promise.resolve(new Response(readFileSync(join(FIXTURES, url.replace(/^\/data\//, "")), "utf8")));

function Queue() {
  const scan = useScan();
  const instances = useInstances();
  const issues = useIssues();
  if (!scan.data || !instances.data || !issues.data) return <p>loading</p>;
  return (
    <ReviewQueue issues={issues.data} instances={instances.data} classes={scan.data.classes} />
  );
}

function renderQueue() {
  const source = new StaticDataSource("/data", {
    fetchFn: fetchFixture,
    storeFor: () => memoryEventStore(),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DataSourceProvider source={source}>
        <Queue />
      </DataSourceProvider>
    </QueryClientProvider>,
  );
  return source;
}

beforeEach(() => useViewStore.setState({ selectedId: null, selectedIssueId: null }));

describe("ReviewQueue", () => {
  it("lists open issues high to low severity, grouped by type", async () => {
    renderQueue();

    expect(await screen.findByRole("tab", { name: "Open (5)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "▲HighClass mismatch (1)",
      "■MediumTag missing in scan (1)",
      "■MediumUntagged equipment (1)",
      "●LowTag split (1)",
      "●LowEstimate unreliable (1)",
    ]);
  });

  it("selecting an issue selects its first object; an issue without objects selects none", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(await screen.findByRole("button", { name: "tag_split:P-9" }));
    expect(useViewStore.getState()).toMatchObject({
      selectedIssueId: "tag_split:P-9",
      selectedId: 1,
    });

    await user.click(screen.getByRole("button", { name: "tag_missing_in_scan:PT-9" }));
    expect(useViewStore.getState()).toMatchObject({ selectedId: null });
  });

  it("accepts a class suggestion with a note and moves the issue to Resolved", async () => {
    const user = userEvent.setup();
    const source = renderQueue();
    await user.click(await screen.findByRole("button", { name: "class_mismatch:1" }));

    await user.type(screen.getByRole("textbox", { name: /Note/ }), "P&ID wins");
    await user.click(
      screen.getByRole("button", { name: "✓ Accept: change class to Pressure safety valve" }),
    );

    expect(await screen.findByRole("tab", { name: "Open (4)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resolved" })).toBeInTheDocument();
    expect(screen.getAllByText("#1")).toHaveLength(2); // class change and status change
    expect(
      screen.getByText("Class: Piping components → Pressure safety valve"),
    ).toBeInTheDocument();
    expect(screen.getByText(/By local user/)).toBeInTheDocument();
    expect(screen.getByText("“P&ID wins”")).toBeInTheDocument();
    expect((await source.getInstance("nora", 1)).current_class_id).toBe(12);

    await user.click(screen.getByRole("tab", { name: "Resolved (1)" }));
    expect(screen.getByRole("button", { name: /class_mismatch:1/ })).toHaveTextContent("Resolved");
  });

  it("assigns a suggested tag to untagged equipment", async () => {
    const user = userEvent.setup();
    const source = renderQueue();
    await user.click(await screen.findByRole("button", { name: "untagged_equipment:2" }));

    const assign = screen.getByRole("group", { name: "Assign a P&ID tag" });
    expect(within(assign).getByRole("radio", { name: /PT-9/ })).toBeChecked();
    await user.click(within(assign).getByRole("button", { name: "Assign tag" }));

    expect(await screen.findByText("Tag assigned: PT-9")).toBeInTheDocument();
    expect((await source.getInstance("nora", 2)).tag).toBe("PT-9");
  });

  it("offers only the actions that fit, and can close every issue type", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(await screen.findByRole("button", { name: "tag_missing_in_scan:PT-9" }));
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change class" })).toBeNull();
    for (const id of [
      "tag_missing_in_scan:PT-9",
      "tag_split:P-9",
      "estimate_unreliable:3",
      "untagged_equipment:2",
      "class_mismatch:1",
    ]) {
      await user.click(screen.getByRole("tab", { name: /^Open/ }));
      await user.click(screen.getByRole("button", { name: id }));
      await user.click(screen.getByRole("button", { name: /^✕ / }));
      expect(await screen.findByRole("heading", { name: "Dismissed" })).toBeInTheDocument();
    }

    expect(screen.getByRole("tab", { name: "Open (0)" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Open (0)" }));
    expect(screen.getByText("No open issues. Everything is reviewed.")).toBeInTheDocument();
  });
});
