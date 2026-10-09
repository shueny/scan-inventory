import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DataSourceProvider } from "../data/DataSourceProvider";
import { useInstance } from "../data/hooks";
import type { ScanDataSource } from "../data/ScanDataSource";
import type { ClassInfo, Instance, InstanceDetail as Detail, ReviewEvent } from "../data/types";
import { NO_FILTERS } from "../domain/filters";
import { useViewStore } from "../state/viewStore";
import { FilterPanel } from "./FilterPanel";
import { InstanceDetail } from "./InstanceDetail";
import { InventoryTable } from "./InventoryTable";
import { describeEvent } from "./ReviewHistory";

const classes: ClassInfo[] = [
  { id: 0, name: "Structural", color: "#c9ccd1", is_background: true, instance_count: 1 },
  { id: 8, name: "Pipe", color: "#3b6ea8", is_background: false, instance_count: 1 },
  {
    id: 12,
    name: "Pressure safety valve",
    color: "#ff2d6f",
    is_background: false,
    instance_count: 1,
  },
];

const valve: Detail = {
  scan_id: "nora",
  instance_id: 155,
  class_id: 12,
  class_name: "Pressure safety valve",
  is_background: false,
  point_count: 12345,
  centroid: [1, 2, 37],
  bbox_min: [0.9, 1.9, 36.8],
  bbox_max: [1.1, 2.15, 37.3],
  bbox_size: [0.2, 0.25, 0.5],
  length_est_m: 0.48,
  diameter_est_m: 0.12,
  has_tag: true,
  tag: "PSV-108A",
  all_tags: ["PSV-108A"],
  element: "safety valve",
  nominal_inch: 1.5,
  system: "ASS - 108",
  location: "SC",
  location_source: "tagged_nearest_tag",
  review_status: "unreviewed",
  current_class_id: 12,
  history: [],
};

const pipe: Instance = {
  ...valve,
  instance_id: 7,
  class_id: 8,
  class_name: "Pipe",
  current_class_id: 8,
  tag: null,
  all_tags: [],
  has_tag: false,
  element: null,
  nominal_inch: 4,
  system: null,
  location: "NW",
};
const floor: Instance = { ...pipe, instance_id: 1, class_id: 0, current_class_id: 0 };
floor.is_background = true;
floor.location = null;

/** A data source holding one object; PATCH changes it and records an event. */
function fakeSource(start: Detail): ScanDataSource & { calls: unknown[] } {
  let detail = start;
  const calls: unknown[] = [];
  const fail = () => Promise.reject(new Error("not used"));
  return {
    calls,
    getScan: fail,
    listInstances: fail,
    listIssues: fail,
    resolveIssue: fail,
    getInstance: () => Promise.resolve(detail),
    updateInstance: (_scan, _id, change) => {
      calls.push(change);
      const event: ReviewEvent = {
        id: detail.history.length + 1,
        scan_id: "nora",
        instance_id: detail.instance_id,
        issue_id: null,
        action: "set_review_status",
        from_value: detail.review_status,
        to_value: change.review_status ?? "corrected",
        note: change.note?.trim() ?? null,
        actor: "local user",
        created_at: "2026-10-09T12:00:00Z",
      };
      detail = {
        ...detail,
        review_status: change.review_status ?? "corrected",
        history: [...detail.history, event],
      };
      return Promise.resolve(detail);
    },
  };
}

function withData(source: ScanDataSource, children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <DataSourceProvider source={source}>{children}</DataSourceProvider>
    </QueryClientProvider>
  );
}

function SelectedDetail({ id }: { id: number }) {
  const detail = useInstance(id);
  return detail.data ? <InstanceDetail instance={detail.data} classes={classes} /> : null;
}

beforeEach(() =>
  useViewStore.setState({
    selectedId: null,
    colorMode: "class",
    backgroundVisible: true,
    filters: NO_FILTERS,
    sort: { key: "tag", dir: "asc" },
  }),
);

describe("InstanceDetail", () => {
  const show = (instance: Detail) =>
    render(
      withData(fakeSource(instance), <InstanceDetail instance={instance} classes={classes} />),
    );

  it("shows tag, class, P&ID fields, size and the borrowed-zone note", () => {
    show(valve);

    expect(screen.getByRole("heading", { name: "PSV-108A" })).toBeInTheDocument();
    expect(screen.getByText('1.5" (P&ID, inches)')).toBeInTheDocument();
    expect(screen.getByText("ASS - 108")).toBeInTheDocument();
    expect(screen.getByText(/from the nearest tag/)).toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("0.20 × 0.25 × 0.50 m")).toBeInTheDocument();
  });

  it("labels length and diameter as PCA estimates with an explanation", () => {
    show(valve);

    const badges = screen.getAllByText("estimate (PCA)");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveAttribute("title", expect.stringContaining("bent or branched"));
  });

  it("says when an object has no tag, and shows a corrected class with its origin", () => {
    show({ ...valve, tag: null, all_tags: [], has_tag: false, current_class_id: 8 });

    expect(screen.getByRole("heading", { name: "No P&ID tag" })).toBeInTheDocument();
    expect(screen.getByText("Annotated as Pressure safety valve")).toBeInTheDocument();
  });
});

describe("Review actions", () => {
  it("confirms with a note, then shows the new status and the history entry", async () => {
    const user = userEvent.setup();
    const source = fakeSource(valve);
    render(withData(source, <SelectedDetail id={155} />));

    await user.type(await screen.findByRole("textbox"), "checked on site");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText("Status: Unreviewed → Confirmed")).toBeInTheDocument();
    expect(screen.getByText("“checked on site”")).toBeInTheDocument();
    expect(source.calls).toEqual([{ review_status: "confirmed", note: "checked on site" }]);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("changes the class with the dropdown", async () => {
    const user = userEvent.setup();
    const source = fakeSource(valve);
    render(withData(source, <SelectedDetail id={155} />));

    const change = await screen.findByRole("button", { name: "Change class" });
    expect(change).toBeDisabled(); // same class as now
    await user.selectOptions(screen.getByLabelText("New class"), "Pipe");
    await user.click(change);

    expect(source.calls).toEqual([{ current_class_id: 8 }]);
  });
});

describe("describeEvent", () => {
  const e = (action: string, from: string | null, to: string | null) =>
    ({ action, from_value: from, to_value: to, issue_id: "class_mismatch:1" }) as ReviewEvent;

  it("words each kind of event", () => {
    expect(describeEvent(e("change_class", "12", "8"), classes)).toBe(
      "Class: Pressure safety valve → Pipe",
    );
    expect(describeEvent(e("set_review_status", "unreviewed", "rejected"), classes)).toBe(
      "Status: Unreviewed → Rejected",
    );
    expect(describeEvent(e("assign_tag", null, "PT-9"), classes)).toBe("Tag assigned: PT-9");
    expect(describeEvent(e("close_issue", "open", "resolved"), classes)).toBe(
      "Issue class_mismatch:1 resolved",
    );
  });
});

describe("FilterPanel", () => {
  const zones = ["NW", "SC"];
  const instances = [valve, pipe, floor];

  it("switches colour mode and hides the background through the shared store", async () => {
    const user = userEvent.setup();
    render(<FilterPanel classes={classes} zones={zones} instances={instances} />);

    await user.click(screen.getByRole("radio", { name: "Scan colour" }));
    await user.click(screen.getByRole("checkbox", { name: "Show structure and floor" }));

    expect(useViewStore.getState().colorMode).toBe("rgb");
    expect(useViewStore.getState().backgroundVisible).toBe(false);
  });

  it("shows zones with counts and filters by zone, tag and class", async () => {
    const user = userEvent.setup();
    render(<FilterPanel classes={classes} zones={zones} instances={instances} />);

    const nw = screen.getByRole("checkbox", { name: /^NW/ });
    expect(nw.closest("label")).toHaveTextContent("NW1");
    await user.click(nw);
    expect(useViewStore.getState().filters.zones).toEqual(["SC"]);

    await user.type(screen.getByRole("searchbox"), "psv");
    expect(useViewStore.getState().filters.q).toBe("psv");

    await user.click(screen.getByRole("checkbox", { name: /Pipe/ }));
    expect(useViewStore.getState().filters.classIds).toEqual([12]);

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(useViewStore.getState().filters).toEqual(NO_FILTERS);
  });
});

describe("InventoryTable", () => {
  const instances = [valve, pipe, floor];

  it("lists the filtered objects without background and selects a row on click", async () => {
    const user = userEvent.setup();
    render(<InventoryTable instances={instances} classes={classes} />);

    expect(screen.getByText("2 of 2 objects")).toBeInTheDocument();
    await user.click(screen.getByText("PSV-108A"));

    expect(useViewStore.getState().selectedId).toBe(155);
    expect(screen.getByText("PSV-108A").closest("tr")).toHaveAttribute("aria-selected", "true");
  });

  it("sorts by a column and flips direction on a second click", async () => {
    const user = userEvent.setup();
    render(<InventoryTable instances={instances} classes={classes} />);
    const firstCell = () =>
      within(screen.getAllByRole("row")[1] as HTMLElement).getAllByRole("cell")[1];

    await user.click(screen.getByRole("button", { name: /Class/ }));
    expect(firstCell()).toHaveTextContent("Pipe");
    expect(screen.getByRole("columnheader", { name: /Class/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    await user.click(screen.getByRole("button", { name: /Class/ }));
    expect(firstCell()).toHaveTextContent("Pressure safety valve");
  });

  it("selects with the keyboard", async () => {
    const user = userEvent.setup();
    render(<InventoryTable instances={instances} classes={classes} />);

    screen.getByText("#7").closest("tr")?.focus();
    await user.keyboard("{Enter}");

    expect(useViewStore.getState().selectedId).toBe(7);
  });
});
