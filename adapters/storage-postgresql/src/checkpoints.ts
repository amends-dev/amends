import { Checkpoint, Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { checkpoints } from "./schema.ts";

/** Each projection version's progress through one log, written with the projection's rows. */
export const make = Effect.fn("Checkpoints.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const cursorColumns = {
    position: checkpoints.position,
    commitId: checkpoints.commitId,
    index: checkpoints.entryIndex,
    entryId: checkpoints.entryId,
  };
  return Checkpoint.Service.of({
    get: Effect.fn("Checkpoints.get")(function* (key) {
      const rows = yield* guard(
        db
          .select(cursorColumns)
          .from(checkpoints)
          .where(
            and(
              eq(checkpoints.workspaceId, workspaceId),
              eq(checkpoints.logId, key.logId),
              eq(checkpoints.name, key.name),
              eq(checkpoints.version, key.version),
            ),
          ),
      ).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Checkpoint.Cursor))),
        Effect.mapError(storeFailure(Store, "checkpoint.get")),
      );
      return Array.head(rows);
    }),
    set: Effect.fn("Checkpoints.set")(function* (key, cursor) {
      yield* Store.Transaction;
      const progress = {
        position: cursor.position,
        commitId: cursor.commitId,
        entryIndex: cursor.index,
        entryId: cursor.entryId,
      };
      yield* guard(
        db
          .insert(checkpoints)
          .values({
            workspaceId,
            logId: key.logId,
            name: key.name,
            version: key.version,
            ...progress,
          })
          .onConflictDoUpdate({
            target: [
              checkpoints.workspaceId,
              checkpoints.logId,
              checkpoints.name,
              checkpoints.version,
            ],
            set: progress,
          }),
        true,
      ).pipe(Effect.mapError(storeError(Store, "checkpoint.set")));
    }),
  });
});

export const layer = Layer.effect(Checkpoint.Service, make());

export * as Checkpoints from "./checkpoints.ts";
