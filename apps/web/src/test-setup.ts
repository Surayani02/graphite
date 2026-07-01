/**
 * Vitest global setup. Extends `expect` with jest-dom's DOM-specific
 * matchers (toBeInTheDocument, toHaveAttribute, toBeDisabled, ...).
 * Safe to load for every test file — it only adds matchers, it does not
 * change the test environment, so plain logic tests (node environment)
 * are unaffected.
 */
import "@testing-library/jest-dom/vitest";
