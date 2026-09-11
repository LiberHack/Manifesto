import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { setup } from "@nuxt/test-utils/e2e";

/**
 * One Nuxt build shared by every e2e test file.
 *
 * vitest runs `buildFixture` once (globalSetup, see vitest.config.ts); test files
 * call `useFixture()` instead of `setup({ server: true })`, which boots a server
 * from that output in ~2 s instead of rebuilding the app (~45 s) per file.
 */
export const FIXTURE_DIR = resolve(import.meta.dirname, "../.nuxt/test-fixture");

export async function buildFixture(): Promise<() => Promise<void>> {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "build-fixture.mjs"), FIXTURE_DIR],
    { stdio: "inherit", env: { ...process.env, NODE_ENV: "test" } },
  );
  if (result.status !== 0) throw new Error(`fixture build failed (exit ${result.status})`);
  return () => rm(FIXTURE_DIR, { recursive: true, force: true });
}

export function useFixture(): Promise<void> {
  return setup({ build: false, buildDir: FIXTURE_DIR, server: true });
}
