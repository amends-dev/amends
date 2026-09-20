import { expect } from "bun:test";
import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { migrationsFolder } from "../src/database.ts";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, views, core, inDatabase, workspaceId } from "./support.ts";
const { it, withDatabase } = await setup();
import { Codec, Log } from "@amends/core/journal";
import { Effect, Option, Schema, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";

it("the append-key migration preserves existing journal bytes and adds durable keyed writes", async () =>
  withDatabase(async (location) => {
    const logId = Log.Id.make("legacy");
    const key = Log.IdempotencyKey.make("new-occurrence");
    const bytes = await Effect.runPromise(
      Codec.makeForSchema(Schema.String).encode("legacy payload"),
    );
    const prior = await mkdtemp(join(tmpdir(), "amends-idempotency-migration-"));
    try {
      for (const name of await readdir(migrationsFolder))
        if (name < "20260920210855_log_append_keys")
          await cp(join(migrationsFolder, name), join(prior, name), { recursive: true });
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* migrate(yield* PgDrizzle.makeWithDefaults(), { migrationsFolder: prior });
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO commits (workspace_id,id,recorded_at,entry_count) VALUES (${workspaceId},'old-commit','2026-01-01T00:00:00.000Z',1)`;
          yield* sql`INSERT INTO log_batches (workspace_id,log_id,position,commit_id) VALUES (${workspaceId},${logId},0,'old-commit')`;
          yield* sql`INSERT INTO log_entries (workspace_id,id,log_id,position,commit_id,entry_index,recorded_at,payload) VALUES (${workspaceId},'old-entry',${logId},0,'old-commit',0,'2026-01-01T00:00:00.000Z',${bytes})`;
        }).pipe(
          Effect.provide(PgClient.layer({ url: Redacted.make(location), maxConnections: 2 })),
        ),
      );
    } finally {
      await rm(prior, { recursive: true, force: true });
    }
    await inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        yield* Effect.gen(function* () {
          const log = (yield* Log.Service).open({ id: logId, schema: Schema.String });
          const old = yield* log.read({ limit: 10 });
          expect(old[0]?.entries[0]?.payload).toBe("legacy payload");
          const stored = yield* bound.store.read(logId, { limit: 10 });
          expect(stored[0]?.entries[0]?.payload).toEqual(bytes);
          expect(yield* log.getAppend(key)).toEqual(Option.none());
          const first = yield* log.append("new payload", {
            idempotencyKey: key,
            expectedAfter: Option.some(Log.Position.make(0)),
          });
          expect(yield* log.append("new payload", { idempotencyKey: key })).toEqual(first);
          expect((yield* log.read({ limit: 10 })).flatMap((batch) => batch.entries)).toHaveLength(
            2,
          );
        }).pipe(Effect.provide(core(bound)));
      }),
    );
  }));
