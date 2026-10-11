import { Checkpoint, Store } from "@amends-dev/core/journal";
import { and, eq, sql } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeError, storeFailure } from "./internal/errors.ts";
import { checkpoints, liveProjections } from "./internal/schema.ts";

/**
 * Each projection version's progress through one log while it is rebuilt, written with the
 * projection's rows, and the versions that are live.
 *
 * @category constructors
 */
export const make = Effect.fn("Checkpoints.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const cursorColumns = {
    position: checkpoints.position,
    commitId: checkpoints.commitId,
    index: checkpoints.entryIndex,
    entryId: checkpoints.entryId,
  };
  const driver: Checkpoint.Checkpoint["Service"] = {
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
    setLive: Effect.fn("Checkpoints.setLive")(function* (logId, versions) {
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
  };
  return Checkpoint.make(workspaceId, driver);
});

/**
 * Provide Checkpoint.Checkpoint using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Checkpoint.Checkpoint, make());
