import { Checkpoint, Store } from "@amends/core/journal";
import { and, eq, sql } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { checkpoints, liveProjections } from "./schema.ts";

/**
 * Each projection version's progress through one log while it is rebuilt, written with the
 * projection's rows, and the versions that are live.
 *
 * @category constructors
 */
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
    set: Effect.fn("Checkpoints.set")(function* (inputKey, inputCursor) {
      yield* Store.Transaction;
      const key = yield* Schema.decodeEffect(Checkpoint.Key)(inputKey).pipe(
        Effect.mapError(storeConflict(Store, "checkpoint.set")),
      );
      const cursor = yield* Schema.decodeEffect(Schema.toType(Checkpoint.Cursor))(inputCursor).pipe(
        Effect.mapError(storeConflict(Store, "checkpoint.set")),
      );
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
    listLive: (logId) =>
      guard(
        db
          .select({ name: liveProjections.name, version: liveProjections.version })
          .from(liveProjections)
          .where(
            and(eq(liveProjections.workspaceId, workspaceId), eq(liveProjections.logId, logId)),
          )
          .orderBy(sql`${liveProjections.name} COLLATE "C"`),
      ).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Checkpoint.LiveVersions)),
        Effect.mapError(storeFailure(Store, "checkpoint.listLive")),
      ),
    setLive: Effect.fn("Checkpoints.setLive")(function* (logId, input) {
      yield* Store.Transaction;
      const versions = yield* Schema.decodeEffect(Checkpoint.LiveVersions)(input).pipe(
        Effect.mapError(storeConflict(Store, "checkpoint.setLive")),
      );
      const clear = db
        .delete(liveProjections)
        .where(and(eq(liveProjections.workspaceId, workspaceId), eq(liveProjections.logId, logId)));
      // Drizzle refuses to build an insert without rows, so an empty register only clears.
      const replace =
        versions.length === 0
          ? clear
          : Effect.andThen(
              clear,
              db
                .insert(liveProjections)
                .values(
                  versions.map(({ name, version }) => ({ workspaceId, logId, name, version })),
                ),
            );
      yield* guard(replace, true).pipe(Effect.mapError(storeError(Store, "checkpoint.setLive")));
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
