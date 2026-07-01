import { createContext, useContext, type ReactNode } from "react";
import { useEngine } from "../hooks/useEngine";
import type { UseEngineResult } from "../hooks/useEngine";

/**
 * Exported alongside `useEngineContext()` specifically so tests can inject
 * a mock value via `<EngineContext.Provider value={mock}>` without
 * mounting a real canvas/worker. Application code should always go
 * through `useEngineContext()`, never import this directly.
 */
export const EngineContext = createContext<UseEngineResult | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngineContext(): UseEngineResult {
  const ctx = useContext(EngineContext);
  if (!ctx) {
    throw new Error("useEngineContext must be used within an EngineProvider");
  }
  return ctx;
}
