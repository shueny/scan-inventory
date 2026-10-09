import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassInfo, Instance, Issue } from "../data/types";
import { NO_FILTERS } from "../domain/filters";
import { useViewStore } from "../state/viewStore";
import { Dashboard } from "./Dashboard";

const classes = [
  { id: 0, name: "Structural", is_background: true },
  { id: 8, name: "Pipe" },
  { id: 12, name: "Pressure safety valve" },
] as ClassInfo[];

const base = {
  scan_id: "nora",
  is_background: false,
  bbox_size: [0.1, 0.1, 0.1],
  all_tags: [],
  tag: null,
  element: null,
  nominal_inch: null,
  system: null,
  location_source: "pnid",
  point_count: 100,
  review_status: "unreviewed",
} as unknown as Instance;

const instances: Instance[] = [
  {
    ...base,
    instance_id: 1,
    class_id: 12,
    current_class_id: 12,
    class_name: "Pressure safety valve",
    location: "NW",
    tag: "PSV-1",
    review_status: "confirmed",
  },
  {
    ...base,
    instance_id: 2,
    class_id: 8,
    current_class_id: 8,
    class_name: "Pipe",
    location: "NW",
    length_est_m: 2,
    diameter_est_m: 0.1,
  },
  {
    ...base,
    instance_id: 3,
    class_id: 8,
    current_class_id: 8,
    class_name: "Pipe",
    location: "NE",
    length_est_m: 1,
    diameter_est_m: 0.4,
  },
  {
    ...base,
    instance_id: 4,
    class_id: 0,
    current_class_id: 0,
    class_name: "Structural",
    location: null,
    is_background: true,
  },
];
const issues = [
  { issue_id: "a", severity: "high", status: "open" },
  { issue_id: "b", severity: "low", status: "dismissed" },
] as Issue[];

function show() {
  render(
    <Dashboard instances={instances} issues={issues} classes={classes} zones={["NW", "NE"]} />,
  );
}

beforeEach(() => useViewStore.setState({ filters: NO_FILTERS }));
afterEach(() => vi.restoreAllMocks());

describe("Dashboard", () => {
  it("gives the per-zone chart numbers as a table for screen readers", () => {
    show();
    const table = screen.getByRole("table", { name: "Objects per zone, by class family" });
    const nw = within(table).getByRole("row", { name: /^NW/ });
    expect(
      within(nw)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["1", "1", "2"]);
  });

  it("shows pipe length per zone as an estimate with the unreliable share", () => {
    show();
    const table = screen.getByRole("table", { name: /Pipe length per zone/ });
    expect(screen.getByText("estimate (PCA)")).toHaveAttribute(
      "title",
      expect.stringContaining("0.3 m"),
    );
    expect(within(table).getByRole("row", { name: /^NE/ })).toHaveTextContent("1 · 100 %");
    expect(within(table).getByRole("row", { name: /^All zones/ })).toHaveTextContent("≈ 3.0 m");
  });

  it("shows review progress without background and open issues by severity", () => {
    show();
    expect(screen.getByText(/1 of 3 objects reviewed/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Objects reviewed" })).toHaveAttribute(
      "value",
      "1",
    );
  });

  it("downloads the filtered inventory as CSV, with review status", async () => {
    const user = userEvent.setup();
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:x";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    useViewStore.setState({ filters: { ...NO_FILTERS, zones: ["NW"] } });
    show();

    await user.click(screen.getByRole("button", { name: "Export CSV (2 objects)" }));

    expect(click).toHaveBeenCalledOnce();
    const text = await blob?.text();
    const lines = text?.replace("\uFEFF", "").trimEnd().split("\r\n") ?? [];
    expect(lines).toHaveLength(3); // header + objects 1 and 2 (zone NW only)
    expect(lines[1]).toMatch(/^1,PSV-1,.*,confirmed$/);
    expect(screen.getByText(/Only the objects that pass the current filters/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
    // The blob URL stays alive for a moment so the browser can start the download.
    expect(revoke).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });

  it("shows counts per zone and class as a table on request (PRD 8.5)", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: "Per class" }));

    const table = screen.getByRole("table", { name: "Objects per zone and class" });
    const pipe = within(table).getByRole("row", { name: /^Pipe/ });
    expect(
      within(pipe)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["1", "1", "2"]);
    expect(screen.getByRole("button", { name: "Per class" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("zone-chart")).toBeNull(); // the chart is not drawn meanwhile
    await user.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.getByTestId("zone-chart")).toBeInTheDocument();
  });

  it("still shows the numbers and the export when issues are not loaded", () => {
    render(
      <Dashboard instances={instances} issues={undefined} classes={classes} zones={["NW", "NE"]} />,
    );

    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Pipe length per zone/ })).toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(3);
  });
});
