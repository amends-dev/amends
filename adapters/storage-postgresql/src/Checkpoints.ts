/**
 * The PostgreSQL driver for `Checkpoint.Checkpoint`, over two tables: `checkpoints`, the progress
 * of each projection version through a log while it is rebuilt, and `live_projections`, the
 * versions each log's commits apply. A checkpoint is written with the projection's rows, in the
 * same transaction; live commits write neither table. `Checkpoint.make` checks every input before
 * the driver sees it, so the driver keeps only what storage keeps: `set` replaces a key's cursor in
 * one upsert, and `setLive` replaces a log's live versions. Writers to the workspace take turns on
 * its lock, so a read followed by `set` cannot interleave with another runner's. Every statement
 * is scoped to the binding's workspace and runs under its `guard`, which lets a read join the
 * caller's transaction and requires one for a write; failures are the journal store's.
 *
 * @since 0.1.0
 */
import { Checkpoint, StoreError } from "@amends-dev/core/journal";
import { and, eq, sql } from "drizzle-orm";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Binding from "./Binding.ts";
import { raceError } from "./internal/errors.ts";
import { checkpoints, liveProjections } from "./internal/schema.ts";

/**
 * Builds the checkpoint store for the binding's workspace: this module's driver inside
 * `Checkpoint.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
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
        Effect.mapError(StoreError.failed("Checkpoint", "get")),
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
      ).pipe(Effect.mapError(raceError("Checkpoint", "set")));
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
        Effect.mapError(StoreError.failed("Checkpoint", "listLive")),
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
      yield* guard(replace, true).pipe(Effect.mapError(raceError("Checkpoint", "setLive")));
    }),
  };
  return Checkpoint.make(driver);
});

/**
 * Provides `Checkpoint.Checkpoint` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Checkpoint.Checkpoint, make());
