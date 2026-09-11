import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    environment: "nuxt",
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
    {
      // Nuxt appends "import" to the SSR resolve conditions and vitest 4 forwards
      // them to the workers as `node --conditions`. With "import" set, Node's native
      // require() of dual packages (magic-string, estree-walker, ...) picks the ESM
      // entry and @vue/compiler-sfc crashes when the e2e fixture builds.
      name: "manifesto:drop-import-condition",
      configResolved(config) {
        const ssr = config.ssr.resolve;
        if (ssr?.conditions) ssr.conditions = ssr.conditions.filter((c) => c !== "import");
      },
    },
  ],
});
