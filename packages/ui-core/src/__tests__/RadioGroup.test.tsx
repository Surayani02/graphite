// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RadioGroup, type RadioOption } from "../components/RadioGroup";

const OPTIONS: readonly RadioOption[] = [
  { value: "dark", label: "Dark", description: "Default." },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

function Fixture({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <RadioGroup label="Theme" value={value} onChange={onChange} options={OPTIONS} />;
}

describe("RadioGroup", () => {
  it("exposes the WAI-ARIA radiogroup pattern with the current value selected", () => {
    render(<Fixture value="dark" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Dark/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Light/ })).not.toBeChecked();
  });

  it("renders optional descriptions", () => {
    render(<Fixture value="dark" onChange={() => {}} />);
    expect(screen.getByText("Default.")).toBeInTheDocument();
  });

  it("reports the chosen value on click", async () => {
    const onChange = vi.fn();
    render(<Fixture value="dark" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /System/ }));
    expect(onChange).toHaveBeenCalledWith("system");
  });

  it("moves selection with arrow keys (roving)", async () => {
    const onChange = vi.fn();
    render(<Fixture value="dark" onChange={onChange} />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledWith("light");
  });
});
