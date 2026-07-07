// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Tooltip } from "../components/Tooltip";

/** Floating UI's position computation is async — flush it before asserting. */
const waitForPosition = () => act(async () => {});

describe("Tooltip", () => {
  it("is not rendered until triggered", () => {
    render(
      <Tooltip label="Rectangle">
        <button>R</button>
      </Tooltip>
    );
    expect(screen.queryByText("Rectangle")).not.toBeInTheDocument();
  });

  it("shows on focus", async () => {
    render(
      <Tooltip label="Rectangle" shortcut="R">
        <button>R</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByRole("button"));
    await waitForPosition();
    expect(screen.getByText("Rectangle")).toBeInTheDocument();
    expect(screen.getByText("R", { selector: "kbd" })).toBeInTheDocument();
  });

  it("hides on Escape", async () => {
    render(
      <Tooltip label="Rectangle">
        <button>R</button>
      </Tooltip>
    );
    const button = screen.getByRole("button");
    fireEvent.focus(button);
    await waitForPosition();
    expect(screen.getByText("Rectangle")).toBeInTheDocument();
    fireEvent.keyDown(button, { key: "Escape" });
    await waitForPosition();
    expect(screen.queryByText("Rectangle")).not.toBeInTheDocument();
  });

  it("preserves the child's own event handlers", async () => {
    let clicked = false;
    render(
      <Tooltip label="Rectangle">
        <button
          onClick={() => {
            clicked = true;
          }}
        >
          R
        </button>
      </Tooltip>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });
});
