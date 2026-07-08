// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableListBox } from "../components/SearchableListBox";

const ALL = ["Save Document", "Select Tool", "Rectangle Tool"] as const;

function Fixture({ onAction }: { onAction: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const items = ALL.filter((t) => t.toLowerCase().includes(query.toLowerCase()));
  return (
    <SearchableListBox<string>
      label="Commands"
      placeholder="Type a command"
      query={query}
      onQueryChange={setQuery}
      sections={[{ id: "commands", title: "Commands", items }]}
      itemKey={(t) => t}
      itemText={(t) => t}
      renderItem={(t) => <span>{t}</span>}
      onAction={onAction}
      emptyState={<span>Nothing found</span>}
    />
  );
}

describe("SearchableListBox", () => {
  it("renders a searchbox, section header, and every item as an option", () => {
    render(<Fixture onAction={() => {}} />);
    expect(screen.getByRole("searchbox", { name: "Commands" })).toBeInTheDocument();
    expect(screen.getByText("Commands", { selector: "header" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("renders exactly the externally-filtered items as the query changes", async () => {
    render(<Fixture onAction={() => {}} />);
    await userEvent.type(screen.getByRole("searchbox"), "rect");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Rectangle Tool" })).toBeInTheDocument();
  });

  it("Enter activates the auto-focused first result after typing", async () => {
    const onAction = vi.fn();
    render(<Fixture onAction={onAction} />);
    await userEvent.type(screen.getByRole("searchbox"), "save");
    await userEvent.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledWith("Save Document");
  });

  it("ArrowDown moves virtual focus before Enter activates", async () => {
    const onAction = vi.fn();
    render(<Fixture onAction={onAction} />);
    await userEvent.click(screen.getByRole("searchbox"));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalledWith("Save Document");
  });

  it("shows the empty state when nothing matches", async () => {
    render(<Fixture onAction={() => {}} />);
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    // RAC keeps the listbox structurally valid by rendering the empty state
    // inside a single option-role wrapper — assert no *real* item survives.
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Nothing found");
    expect(screen.queryByRole("option", { name: "Rectangle Tool" })).not.toBeInTheDocument();
  });
});
