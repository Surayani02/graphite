// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "../features/theme/ThemeToggle";
import { useUIStore } from "../stores/uiStore";

let mediaMatches = false;

beforeEach(() => {
  mediaMatches = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      get matches() {
        return mediaMatches;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
  useUIStore.setState({ themePreference: "dark" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("cycles dark → light → system → dark", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /Theme:/ });

    expect(button.getAttribute("aria-label")).toContain("Dark");
    fireEvent.click(button);
    expect(useUIStore.getState().themePreference).toBe("light");
    fireEvent.click(button);
    expect(useUIStore.getState().themePreference).toBe("system");
    fireEvent.click(button);
    expect(useUIStore.getState().themePreference).toBe("dark");
  });

  it("captions the system preference with the resolved OS theme", () => {
    mediaMatches = true; // OS prefers light
    useUIStore.setState({ themePreference: "system" });
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /currently light/ })).toBeInTheDocument();
  });

  it("announces the next preference in its accessible name", () => {
    useUIStore.setState({ themePreference: "dark" });
    render(<ThemeToggle />);
    // Dark → next is Light.
    expect(screen.getByRole("button", { name: /switch to Light/i })).toBeInTheDocument();
  });
});
