/**
 * Vitest global setup. Extends `expect` with jest-dom's DOM-specific
 * matchers (toBeInTheDocument, toHaveAttribute, toBeDisabled, ...).
 * Safe to load for every test file — it only adds matchers, it does not
 * change the test environment, so plain logic tests (node environment)
 * are unaffected.
 */
import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrolling. LayersPanel's reveal-on-select calls
// `scrollIntoView`; a silent no-op keeps component tests honest about the
// call path without simulating layout jsdom cannot do.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom does not implement `matchMedia`. Components that feature-detect it
// (useApplyTheme, ThemeToggle) short-circuit when it's absent, but any test
// that renders them through the real shell wants a working default rather
// than the theme system silently disabled — a matchMedia-less environment
// isn't representative of any real browser. Provide a benign default
// (nothing matches, listeners are inert); individual tests that need a
// specific match state still override with vi.stubGlobal.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
