import { expect, test as it } from "bun:test";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Migrations } from "../src/migrations.ts";
import { temporary as withDatabase, views, core, inDatabase, workspaceId } from "./support.ts";
import { Codec, Log } from "@amends/core/journal";
import { Effect, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

it("the append-key migration preserves existing journal bytes and adds durable keyed writes", async () =>
  withDatabase(async (location) => {
    const logId = Log.Id.make("legacy");
    const key = Log.IdempotencyKey.make("new-occurrence");
    const bytes = await Effect.runPromise(
      Codec.makeForSchema(Schema.String).encode("legacy payload"),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* SqliteMigrator.run({
          loader: Migrations.loader.pipe(
            Effect.map((migrations) => migrations.filter(([id]) => id < 3)),
          ),
        });
        const sql = yield* SqlClient.SqlClient;
        yield* sql`INSERT INTO commits (workspace_id,id,recorded_at,entry_count) VALUES (${workspaceId},'old-commit','2026-01-01T00:00:00.000Z',1)`;
        yield* sql`INSERT INTO log_batches (workspace_id,log_id,position,commit_id) VALUES (${workspaceId},${logId},0,'old-commit')`;
        yield* sql`INSERT INTO log_entries (workspace_id,id,log_id,position,commit_id,entry_index,recorded_at,payload) VALUES (${workspaceId},'old-entry',${logId},0,'old-commit',0,'2026-01-01T00:00:00.000Z',${bytes})`;
      }).pipe(Effect.provide(SqliteClient.layer({ filename: location, busyTimeout: 0 }))),
    );
    await inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
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
