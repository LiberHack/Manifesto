import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    environment: "nuxt",
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
