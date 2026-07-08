// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";

function Fixture({ selected, onChange }: { selected: string; onChange: (k: string) => void }) {
  return (
    <Tabs selectedKey={selected} onSelectionChange={onChange}>
      <TabList label="Panels">
        <Tab id="layers">Layers</Tab>
        <Tab id="assets">Assets</Tab>
      </TabList>
      <TabPanel id="layers">layer content</TabPanel>
      <TabPanel id="assets">asset content</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("exposes the WAI-ARIA tabs pattern and renders only the selected panel", () => {
    render(<Fixture selected="layers" onChange={() => {}} />);
    expect(screen.getByRole("tablist", { name: "Panels" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Assets" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("layer content")).toBeInTheDocument();
    expect(screen.queryByText("asset content")).not.toBeInTheDocument();
  });

  it("reports selection changes as plain string keys on click", async () => {
    const onChange = vi.fn();
    render(<Fixture selected="layers" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Assets" }));
    expect(onChange).toHaveBeenCalledWith("assets");
  });

  it("moves selection with arrow keys (automatic activation)", async () => {
    const onChange = vi.fn();
    render(<Fixture selected="layers" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Layers" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("assets");
  });
});
