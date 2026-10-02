import { PgClient } from "@effect/sql-pg";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Redacted } from "effect";
import { fileURLToPath } from "node:url";
import { LocalStatus } from "../src/status.ts";
import { setup } from "./database.ts";

const at = DateTime.makeUnsafe("2026-09-24T21:50:00.000Z");

it("the status reads as a table, with the latest retries beneath it", () => {
  expect(
    LocalStatus.render({
      requests: [
        { request: "AcceptWork", due: 3, scheduled: 12, retrying: 1, oldestDue: Option.some(at) },
        {
          request: "StopDepartedTurns",
          due: 0,
          scheduled: 0,
          retrying: 0,
          oldestDue: Option.none(),
        },
      ],
      retries: [{ request: "AcceptWork", workspaceId: "w-1", memberId: "m-1", attempt: 3, at }],
    }),
  ).toBe(
    [
      "REQUEST            DUE  SCHEDULED  RETRYING  OLDEST DUE",
      "AcceptWork           3         12         1  2026-09-24T21:50:00.000Z",
      "StopDepartedTurns    0          0         0  -",
      "",
      "Retrying",
      "  AcceptWork for m-1 in w-1: attempt 3, next at 2026-09-24T21:50:00.000Z",
    ].join("\n"),
  );
  expect(LocalStatus.render({ requests: [], retries: [] })).toBe(
    "No agent job is waiting or retrying.",
  );
});

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("the status command reports a database that has run no jobs, and changes nothing", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          const run = async (...args: ReadonlyArray<string>) => {
            const child = Bun.spawn(
              [process.execPath, "--no-env-file", "hosts/local/src/status.ts", ...args],
              {
                cwd: fileURLToPath(new URL("../../../", import.meta.url)),
                env: { PATH: process.env.PATH ?? "", AMENDS_DATABASE_URL: url },
                stdout: "pipe",
                stderr: "pipe",
              },
            );
            const [out, err, code] = await Promise.all([
              new Response(child.stdout).text(),
              new Response(child.stderr).text(),
              child.exited,
            ]);
            expect({ code, err }).toEqual({ code: 0, err: "" });
            return out;
          };
          expect(await run()).toBe("No agent job is waiting or retrying.\n");
          expect(JSON.parse(await run("--json"))).toEqual({ requests: [], retries: [] });
        });
        // Reading the status applies no migrations: the database is as empty as it started.
        const tables = yield* Effect.flatMap(
          PgClient.PgClient,
          (sql) =>
            sql<{ readonly count: number }>`
              SELECT count(*)::int AS count FROM pg_tables
              WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
        ).pipe(
          Effect.scoped,
          Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })),
        );
        expect(tables[0]?.count).toBe(0);
      }),
    ),
  );
});
