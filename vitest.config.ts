import { defineConfig } from "vitest/config";

// Scope unit tests to src/*.test.ts so the Playwright e2e/*.spec.ts suite (a
// different runner) isn't swept into the vitest run. `npm test` = unit, `npm run
// e2e` = browser click-through.
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
