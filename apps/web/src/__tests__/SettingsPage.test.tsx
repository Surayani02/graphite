// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import SettingsPage from "../features/settings/SettingsPage";
import { ensureBuiltinCommands } from "../features/commands/builtin";
import { useUIStore } from "../stores/uiStore";

// Commands must exist for the keymap editor to list rows.
ensureBuiltinCommands();

// SettingsPage renders a <Link>, so it needs a router context. Build a tiny
// two-route memory router mirroring the real tree's shape (editor + settings).
function renderSettings() {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>editor</div>,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: SettingsPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  useUIStore.setState({
    themePreference: "dark",
    shortcutOverrides: {},
    shortcutRecorderOpen: false,
    shortcutRecorderTarget: null,
  });
});

describe("SettingsPage — appearance", () => {
  it("renders the theme radio group with the current preference selected", async () => {
    renderSettings();
    await screen.findByRole("radiogroup", { name: "Theme" });
    expect(screen.getByRole("radio", { name: /Dark/ })).toBeChecked();
  });

  it("selecting a theme writes the preference instantly (no save button)", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("radio", { name: /Light/ }));
    expect(useUIStore.getState().themePreference).toBe("light");
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});

describe("SettingsPage — keymap editor", () => {
  it("lists commands with their live chords", async () => {
    renderSettings();
    expect(await screen.findByRole("option", { name: /Save Document/ })).toBeInTheDocument();
  });

  it("reflects a persisted override in the displayed chord", async () => {
    useUIStore.setState({ shortcutOverrides: { "tool.rectangle": "q" } });
    renderSettings();
    const row = await screen.findByRole("option", { name: /Rectangle Tool/ });
    expect(row).toHaveTextContent("Q");
  });

  it("selecting a command opens the recorder targeting it", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("option", { name: /Ellipse Tool/ }));
    expect(useUIStore.getState().shortcutRecorderOpen).toBe(true);
    expect(useUIStore.getState().shortcutRecorderTarget).toBe("tool.ellipse");
  });

  it("search filters the command list", async () => {
    renderSettings();
    await userEvent.type(await screen.findByRole("searchbox"), "ellipse");
    expect(screen.getByRole("option", { name: /Ellipse Tool/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Save Document/ })).not.toBeInTheDocument();
  });

  it("Reset all clears every override", async () => {
    useUIStore.setState({ shortcutOverrides: { "tool.rectangle": "q" } });
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Reset all" }));
    expect(useUIStore.getState().shortcutOverrides).toEqual({});
  });

  it("links back to the editor route", async () => {
    renderSettings();
    const link = await screen.findByRole("link", { name: "Back to editor" });
    expect(link).toHaveAttribute("href", "/");
  });
});
