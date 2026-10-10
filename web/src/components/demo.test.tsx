import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DataSourceProvider } from "../data/DataSourceProvider";
import type { ScanDataSource } from "../data/ScanDataSource";
import { useViewStore } from "../state/viewStore";
import { AboutPanel } from "./AboutPanel";
import { DemoBanner } from "./DemoBanner";
import { ScreenGate } from "./ScreenGate";

function withSource(source: Partial<ScanDataSource>) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <DataSourceProvider source={source as ScanDataSource}>
        <DemoBanner />
      </DataSourceProvider>
    </QueryClientProvider>,
  );
  return invalidate;
}

describe("DemoBanner", () => {
  it("says changes stay in this browser and resets only after confirmation", async () => {
    const user = userEvent.setup();
    const resetDemo = vi.fn(() => Promise.resolve());
    useViewStore.setState({ selectedId: 7, selectedIssueId: "x" });
    const invalidate = withSource({ resetDemo, isPersistent: () => true });

    expect(screen.getByText(/saved only in this browser/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(resetDemo).not.toHaveBeenCalled(); // asks first
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(resetDemo).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reset demo" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(screen.getByRole("button", { name: "Yes, reset" }));

    expect(resetDemo).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalled();
    expect(useViewStore.getState()).toMatchObject({ selectedId: null, selectedIssueId: null });
    expect(await screen.findByRole("button", { name: "Reset demo" })).toBeInTheDocument();
  });

  it("tells the visitor when the reset fails, and stays usable", async () => {
    const user = userEvent.setup();
    withSource({ resetDemo: () => Promise.reject(new Error("x")), isPersistent: () => true });

    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(screen.getByRole("button", { name: "Yes, reset" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("did not work");
    expect(screen.getByRole("button", { name: "Yes, reset" })).toBeEnabled();
  });

  it("says so when browser storage is blocked", () => {
    withSource({ resetDemo: () => Promise.resolve(), isPersistent: () => false });
    expect(screen.getByText(/storage is blocked/)).toBeInTheDocument();
  });
});

describe("ScreenGate", () => {
  it("shows the app when WebGL 2 is there and the window is wide enough", () => {
    render(
      <ScreenGate webgl2 width={1440}>
        <p>the app</p>
      </ScreenGate>,
    );
    expect(screen.getByText("the app")).toBeInTheDocument();
  });

  it("explains a missing WebGL 2 with a screenshot instead of a blank page", () => {
    render(
      <ScreenGate webgl2={false} width={1440}>
        <p>the app</p>
      </ScreenGate>,
    );
    expect(screen.queryByText("the app")).toBeNull();
    expect(screen.getByRole("heading", { name: /cannot show the 3D scan/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/demo-screenshot.jpg");
  });

  it("warns on a small screen and lets the visitor continue", async () => {
    const user = userEvent.setup();
    render(
      <ScreenGate webgl2 width={800}>
        <p>the app</p>
      </ScreenGate>,
    );
    expect(screen.getByRole("heading", { name: "Made for a desktop screen" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue anyway" }));

    expect(screen.getByText("the app")).toBeInTheDocument();
  });
});

describe("AboutPanel", () => {
  it("is a labelled dialog with the framing, the repo link and the credit; Escape closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AboutPanel onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "About scan-inventory" })).toBeInTheDocument();
    expect(screen.getByText(/human annotations/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github\.com/ })).toHaveAttribute(
      "href",
      expect.stringContaining("github.com"),
    );
    expect(screen.getByRole("link", { name: "doi:10.5281/zenodo.21775624" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(screen.getByRole("img", { name: /Python pipeline/ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Tab inside the dialog and gives focus back to the opener when it closes", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            About
          </button>
          {open && <AboutPanel onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "About" }));
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "About" })).toHaveFocus();
  });
});
