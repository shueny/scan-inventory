import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { DataSourceProvider } from "../data/DataSourceProvider";
import type { ScanDataSource } from "../data/ScanDataSource";
import type { ViewerOptions } from "./Viewer";
import { ViewerCanvas } from "./ViewerCanvas";

// The WebGL viewer is replaced by a fake whose loading the test controls.
const fake = vi.hoisted(() => ({
  options: null as ViewerOptions | null,
  finishLoad: () => {},
}));
vi.mock("./Viewer", () => ({
  Viewer: class {
    constructor(_el: HTMLElement, options: ViewerOptions) {
      fake.options = options;
    }
    load() {
      return new Promise<void>((resolve) => {
        fake.finishLoad = resolve;
      });
    }
    dispose() {}
    setClasses() {}
    setInstances() {}
    setFilterBoxes() {}
    setColorMode() {}
    setBackgroundVisible() {}
    select() {}
    frameAll() {}
  },
}));

const pending = () => new Promise<never>(() => {});
const source = { getScan: pending, listInstances: pending } as unknown as ScanDataSource;

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataSourceProvider source={source}>
        <ViewerCanvas />
      </DataSourceProvider>
    </QueryClientProvider>,
  );
}

const stats = (visiblePoints: number) =>
  act(() => fake.options?.onStats?.({ fps: 60, visiblePoints, loaded: true }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("loading screen", () => {
  it("shows the step, counts seconds across both steps, and offers Reload after 20 s", async () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("step 1 of 2: tile index");

    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await act(async () => fake.finishLoad());
    expect(screen.getByRole("status")).toHaveTextContent("step 2 of 2: first points");
    expect(screen.getByText("(15 s)")).toHaveAttribute("aria-hidden"); // not announced

    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(screen.getByText(/taking longer than usual/)).toBeInTheDocument(); // 21 s in total
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("goes away once points are drawn and does not come back when nothing is in view", async () => {
    show();
    await act(async () => fake.finishLoad());
    stats(0);
    expect(screen.getByText(/Loading the scan/)).toBeInTheDocument();

    stats(13_288);
    expect(screen.queryByText(/Loading the scan/)).toBeNull();
    stats(0); // camera looks at empty space
    expect(screen.queryByText(/Loading the scan/)).toBeNull();
  });
});
