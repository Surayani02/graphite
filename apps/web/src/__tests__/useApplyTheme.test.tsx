// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { useApplyTheme } from "../features/theme/useApplyTheme";
import { useUIStore } from "../stores/uiStore";

function Harness() {
  useApplyTheme();
  return null;
}

let changeHandlers: Array<() => void> = [];
let mediaMatches = false;

beforeEach(() => {
  changeHandlers = [];
  mediaMatches = false;
  delete document.documentElement.dataset.theme;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      get matches() {
        return mediaMatches;
      },
      addEventListener: (_: string, cb: () => void) => changeHandlers.push(cb),
      removeEventListener: () => {},
    }))
  );
  useUIStore.setState({ themePreference: "dark" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useApplyTheme", () => {
  it("applies the explicit preference on mount", () => {
    useUIStore.setState({ themePreference: "light" });
    render(<Harness />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("reacts to preference changes", () => {
    render(<Harness />);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    act(() => {
      useUIStore.getState().setThemePreference("light");
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("under system, follows a live OS scheme change", () => {
    useUIStore.setState({ themePreference: "system" });
    render(<Harness />);
    expect(document.documentElement.dataset.theme).toBeUndefined(); // system + dark OS
    act(() => {
      mediaMatches = true;
      changeHandlers.forEach((cb) => cb());
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("under a fixed preference, ignores OS changes", () => {
    useUIStore.setState({ themePreference: "dark" });
    render(<Harness />);
    act(() => {
      mediaMatches = true;
      changeHandlers.forEach((cb) => cb());
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
