import { Suspense, lazy } from "react";

const ShortcutRecorderDialogLazy = lazy(async () => ({
  default: (await import("./ShortcutRecorderDialog")).ShortcutRecorderDialog,
}));

/**
 * Always-rendered lazy boundary around the shortcut recorder (Phase 8 PC-2
 * — ADR-033; the same island pattern as `ExportDialogHost`). Mount
 * semantics are unchanged — permanently mounted, nothing while closed —
 * but the dialog's code leaves the startup closure. The recorder carries
 * no open-latency SLO (unlike the palette, which stays eager — ADR-033
 * §2) and is reached through the palette, so its chunk — requested at the
 * shell's first render — is resident well before any open.
 */
export function ShortcutRecorderDialogHost() {
  return (
    <Suspense fallback={null}>
      <ShortcutRecorderDialogLazy />
    </Suspense>
  );
}
