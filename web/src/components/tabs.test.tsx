import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { panelId, tabId, Tabs } from "./Tabs";

function Harness() {
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  return (
    <>
      <Tabs
        group="t"
        label="Demo"
        items={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
          { value: "c", label: "Gamma" },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      <div role="tabpanel" id={panelId("t", tab)} aria-labelledby={tabId("t", tab)}>
        panel {tab}
      </div>
    </>
  );
}

describe("Tabs", () => {
  it("is one Tab stop; arrows, Home and End move the selection and the focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus(); // wraps around
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
  });

  it("names the panel after its tab", () => {
    render(<Harness />);

    expect(screen.getByRole("tabpanel", { name: "Alpha" })).toHaveTextContent("panel a");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute(
      "aria-controls",
      "t-panel-a",
    );
  });
});
