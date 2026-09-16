import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface SupabaseStub {
  url: string;
  close: () => Promise<void>;
}

/**
 * Minimal PostgREST stand-in for the e2e fixture.
 *
 * The suite must never talk to the real Supabase project, but pointing it at a
 * closed port is not free either: supabase-js retries network failures, so one
 * query takes ~7s and blows vitest's 5s timeout on every route that reads the
 * database. Answering "no rows" instantly keeps those routes fast and
 * deterministic — they exercise our auth, validation and empty-state paths,
 * never real data.
 */
export async function startSupabaseStub(): Promise<SupabaseStub> {
  const server = createServer((_req, res) => {
    const accept = _req.headers.accept ?? "";

    // `.single()` / `.maybeSingle()` ask for a single object. PGRST116 is how
    // PostgREST reports 0 rows, which supabase-js turns into `data: null`.
    if (accept.includes("pgrst.object+json")) {
      res.writeHead(406, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
      );
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Range": "*/0",
    });
    res.end("[]");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
