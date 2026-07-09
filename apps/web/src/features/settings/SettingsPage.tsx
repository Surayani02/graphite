import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ShortcutRecorderDialog } from "../shortcuts/ShortcutRecorderDialog";
import { AppearanceSettings } from "./AppearanceSettings";
import { KeymapEditor } from "./KeymapEditor";

/**
 * Settings page (M5), the "/settings" route's lazy component. Two sections —
 * appearance and the keymap editor — plus a route link back to the editor.
 * It mounts its own ShortcutRecorderDialog so "Rebind" works here without
 * the editor present: the recorder is a self-contained modal over the store,
 * not something that needs EngineProvider, which is exactly why /settings can
 * stay GPU-free (ADR-016). This is a default export so the route's
 * lazyRouteComponent import resolves to it directly.
 */
export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-surface-canvas text-content-primary">
      <header className="flex h-11 items-center gap-3 border-b border-border-subtle bg-surface-panel px-3">
        <Link
          to="/"
          aria-label="Back to editor"
          className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs text-content-secondary hover:bg-surface-panel-hover"
        >
          <ArrowLeft size={14} aria-hidden />
          Editor
        </Link>
        <span className="font-mono text-xs font-semibold tracking-wide text-content-secondary">
          Settings
        </span>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        <AppearanceSettings />
        <KeymapEditor />
      </main>

      <ShortcutRecorderDialog />
    </div>
  );
}
