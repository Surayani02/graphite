// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../components/EmptyState";
import { Kbd } from "../components/Kbd";

describe("Kbd", () => {
  it("renders its label inside a semantic <kbd> element", () => {
    render(<Kbd>⌘K</Kbd>);
    const kbd = screen.getByText("⌘K");
    expect(kbd.tagName).toBe("KBD");
  });
});

describe("EmptyState", () => {
  it("renders title, optional description, and a status role", () => {
    render(<EmptyState title="No document colors" description="Draw a shape to get started." />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("No document colors");
    expect(region).toHaveTextContent("Draw a shape to get started.");
  });

  it("omits the description node when not provided", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByRole("status").childElementCount).toBe(1);
  });
});
