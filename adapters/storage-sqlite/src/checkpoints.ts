import { Checkpoint, Store } from "@amends/core/journal";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";

const cursor = Schema.fromJsonString(Checkpoint.Cursor);
const Rows = Schema.Array(Schema.Struct({ record: cursor }));

/**
 * Each projection version's progress through one log, written with the projection's rows.
 *
 * @category constructors
 */
export const make = Effect.fn("Checkpoints.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  return Checkpoint.Service.of({
    get: (key) =>
      guard(
        sql`SELECT record FROM checkpoints WHERE workspace_id = ${workspaceId} AND log_id = ${key.logId} AND name = ${key.name} AND version = ${key.version}`,
      ).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Rows)),
        Effect.map((rows) => Option.map(Array.head(rows), (row) => row.record)),
        Effect.mapError(storeFailure(Store, "checkpoint.get")),
      ),
    set: Effect.fn("Checkpoints.set")(function* (key, value) {
      yield* Store.Transaction;
      const record = yield* Schema.encodeEffect(cursor)(value).pipe(
        Effect.mapError(storeFailure(Store, "checkpoint.set")),
      );
      yield* guard(
        sql`INSERT INTO checkpoints VALUES (${workspaceId}, ${key.logId}, ${key.name}, ${key.version}, ${record}) ON CONFLICT(workspace_id, log_id, name, version) DO UPDATE SET record = excluded.record`,
        true,
      ).pipe(Effect.mapError(storeError(Store, "checkpoint.set")));
    }),
  });
});

/**
 * Provide Checkpoint.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Checkpoint.Service, make());

export * as Checkpoints from "./checkpoints.ts";
