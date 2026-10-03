import { configDefaults } from "vitest/config";
import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    environment: "nuxt",
    // Git worktrees of other branches live in .worktrees/; their tests are not ours.
    exclude: [...configDefaults.exclude, ".worktrees/**"],
    // Build the e2e fixture once for the whole run (see tests/fixture.ts).
    globalSetup: ["tests/global-setup.ts"],
  },
  plugins: [
    {
      name: "ignore-bun-test",
      enforce: "pre",
      resolveId(id) {
        if (id === "bun:test") {
          return { id: "bun:test", external: true };
        }
      },
    },
  ],
});
