import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassInfo, InstanceDetail as Detail } from "../data/types";
import { useViewStore } from "../state/viewStore";
import { ClassLegend } from "./ClassLegend";
import { InstanceDetail } from "./InstanceDetail";

const classes: ClassInfo[] = [
  { id: 0, name: "Structural", color: "#c9ccd1", is_background: true, instance_count: 1 },
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

describe("InstanceDetail", () => {
  it("shows tag, class, P&ID fields, size and the borrowed-zone note", () => {
    render(<InstanceDetail instance={valve} cls={classes[1]} />);

    expect(screen.getByRole("heading", { name: "PSV-108A" })).toBeInTheDocument();
    expect(screen.getByText("Pressure safety valve")).toBeInTheDocument();
    expect(screen.getByText('1.5" (P&ID, inches)')).toBeInTheDocument();
    expect(screen.getByText("ASS - 108")).toBeInTheDocument();
    expect(screen.getByText(/from the nearest tag/)).toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("0.20 × 0.25 × 0.50 m")).toBeInTheDocument();
  });

  it("labels length and diameter as PCA estimates with an explanation", () => {
    render(<InstanceDetail instance={valve} />);

    const badges = screen.getAllByText("estimate (PCA)");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveAttribute("title", expect.stringContaining("bent or branched"));
  });

  it("says when an object has no tag", () => {
    render(<InstanceDetail instance={{ ...valve, tag: null, all_tags: [], has_tag: false }} />);

    expect(screen.getByRole("heading", { name: "No P&ID tag" })).toBeInTheDocument();
  });
});

describe("ClassLegend", () => {
  beforeEach(() => useViewStore.setState({ colorMode: "class", backgroundVisible: true }));

  it("switches colour mode and hides the background through the shared store", async () => {
    const user = userEvent.setup();
    render(<ClassLegend classes={classes} />);

    await user.click(screen.getByRole("radio", { name: "Scan colour" }));
    await user.click(screen.getByRole("checkbox", { name: "Show structure and floor" }));

    expect(useViewStore.getState().colorMode).toBe("rgb");
    expect(useViewStore.getState().backgroundVisible).toBe(false);
    expect(screen.getByRole("radio", { name: "Scan colour" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("lists classes with their object counts", () => {
    render(<ClassLegend classes={classes} />);

    expect(screen.getByText("Pressure safety valve")).toBeInTheDocument();
    expect(screen.getByText("Structural")).toBeInTheDocument();
  });
});
