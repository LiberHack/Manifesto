import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  createTestContext,
  exposeContextToEnv,
  startServer,
  stopServer,
} from "@nuxt/test-utils/e2e";

/**
 * One build, one server, for the whole vitest run.
 *
 * Builds the app into .nuxt/test-fixture (in a child process: Nuxt's `close`
 * hook makes the vitest main process exit before any test runs when the build
 * happens in-process), starts the built server once, and publishes its URL
 * through NUXT_TEST_CONTEXT. Workers inherit that env, so test files only need
 * `fetch` / `$fetch` / `url` from `@nuxt/test-utils/e2e` — no `setup()` call.
 */
const FIXTURE_DIR = resolve(import.meta.dirname, "../.nuxt/test-fixture");
const OUTPUT_DIR = resolve(FIXTURE_DIR, "output");

export default async function globalSetup(): Promise<() => Promise<void>> {
  const build = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "build-fixture.mjs"), FIXTURE_DIR],
    { stdio: "inherit", env: { ...process.env, NODE_ENV: "test" } },
  );
  if (build.status !== 0) throw new Error(`fixture build failed (exit ${build.status})`);

  createTestContext({
    rootDir: resolve(import.meta.dirname, ".."),
    build: false,
    server: true,
    nuxtConfig: { buildDir: FIXTURE_DIR, nitro: { output: { dir: OUTPUT_DIR } } },
  });
  await startServer();
  exposeContextToEnv();

  return async () => {
    await stopServer();
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  };
}
