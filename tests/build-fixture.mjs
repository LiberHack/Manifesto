// Builds the shared e2e fixture. Run as a child process by tests/global-setup.ts:
// Nuxt's `close` hook tears down enough of the event loop that a build inside the
// vitest main process makes vitest exit before running a single test.
import { resolve } from "node:path";
import { loadNuxt, buildNuxt } from "@nuxt/kit";

const buildDir = process.argv[2];
const nuxt = await loadNuxt({
  cwd: resolve(import.meta.dirname, ".."),
  overrides: { buildDir, nitro: { output: { dir: resolve(buildDir, "output") } } },
});
await buildNuxt(nuxt);
await nuxt.close();
