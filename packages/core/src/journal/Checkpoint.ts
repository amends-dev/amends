/**
 * The store a host implements for projection progress: how far each projection version being
 * rebuilt has read its log, and which versions are live on each log, applied by every commit so
 * that they need no progress of their own. `Projection.makeRunner` reads and writes it while
 * rebuilding, and `Journal` reads the live versions once per commit, before its first
 * publication. Writes enlist in the journal's `Store.Transaction`, beside the projection's own
 * store writes.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Commit from "./Commit.ts";
import * as Entry from "./Entry.ts";
import * as Store from "./Store.ts";
import * as StoreInput from "./StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import { storeFailure } from "./internal/storeFailure.ts";
import * as MemoryDatabase from "./MemoryDatabase.ts";

/**
 * Names one projection version's progress on one log: the log, the projection's name, and its
 * version. Each projection version owns progress for one domain log.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Key = Schema.Struct({
  logId: Entry.LogId,
  name: Schema.NonEmptyString,
  version: Schema.Finite,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Key extends Schema.Schema.Type<typeof Key> {}

/**
 * The last applied entry. The index tracks successive publications within an
 * open commit; durable checkpoints must end at the last entry of their batch.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Cursor = Schema.Struct({
  position: Entry.Position,
  commitId: Commit.Id,
  index: Schema.Natural,
  entryId: Entry.Id,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

/**
 * A projection version that every commit to its log applies.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LiveVersion = Schema.Struct({
  name: Key.fields.name,
  version: Key.fields.version,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface LiveVersion extends Schema.Schema.Type<typeof LiveVersion> {}

/**
 * A log's live projection versions: at most one version of each projection name.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LiveVersions = Schema.Array(LiveVersion).check(
  Schema.makeFilter(
    (versions) =>
      new Set(versions.map(({ name }) => name)).size === versions.length ||
      "A projection name can have only one live version",
  ),
);

/**
 * The checkpoint store, bound to one workspace by the host, which shares the journal's native
 * transaction.
 *
 * What a storage adapter implements for projection progress.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class Checkpoint extends Context.Service<
  Checkpoint,
  {
    /**
     * Progress of a consumer that reads behind the log, such as a projection being rebuilt.
     * Use the current transaction's view when present, otherwise committed state.
     */
    readonly get: (key: Key) => Effect.Effect<Option.Option<Cursor>, Store.Failure>;
    /**
     * Enlist in the active Store.Transaction, alongside the projection's domain
     * writes. Reads followed by set must be serializable, including an absent key:
     * concurrent runners must serialize or fail with Conflict, never both apply
     * the same batch. Reject expired or foreign transaction handles. Do not retry.
     */
    readonly set: (
      key: Key,
      cursor: Cursor,
    ) => Effect.Effect<void, Store.Failure | Store.Conflict, Store.Transaction>;
    /**
     * The projection versions live on this log, in binary name order. A version is live when
     * every commit since it went live applied it, so it needs no progress of its own. Use the
     * current transaction's view when present, otherwise committed state.
     */
    readonly listLive: (
      logId: Entry.LogId,
    ) => Effect.Effect<ReadonlyArray<LiveVersion>, Store.Failure>;
    /**
     * Replace this log's live versions with exactly these, enlisted in the active
     * Store.Transaction. Reject expired or foreign transaction handles. Do not retry.
     */
    readonly setLive: (
      logId: Entry.LogId,
      versions: ReadonlyArray<LiveVersion>,
    ) => Effect.Effect<void, Store.Failure | Store.Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/journal/Checkpoint") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: Checkpoint["Service"],
): Checkpoint["Service"] => {
  const read = StoreInput.read(Store.Failure);
  const write = StoreInput.write(Store.Conflict, workspaceId);
  return {
    get: (key) => Effect.flatMap(read("checkpoint.get", Key, key), driver.get),
    set: Effect.fn("Checkpoint.set")(function* (key, cursor) {
      return yield* driver.set(
        yield* write("checkpoint.set", Key, key),
        yield* write("checkpoint.set", Cursor, cursor),
      );
    }),
    listLive: (logId) =>
      Effect.flatMap(read("checkpoint.listLive", Entry.LogId, logId), driver.listLive),
    setLive: Effect.fn("Checkpoint.setLive")(function* (logId, versions) {
      return yield* driver.setLive(
        yield* write("checkpoint.setLive", Entry.LogId, logId),
        yield* write("checkpoint.setLive", LiveVersions, versions),
      );
    }),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Cursor));
/** A log's live versions, stored together as one row. */
const liveRows = MemoryDatabase.makeRows(Schema.fromJsonString(LiveVersions));
const idOf = (key: Key) => MemoryDatabase.keyOf(key.logId, key.name, key.version);

/**
 * Each projection version's progress through one log while it is rebuilt, written with the
 * projection's rows, and the versions that are live.
 */
const makeMemory = Effect.fn("Checkpoint.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const driver: Checkpoint["Service"] = {
    get: Effect.fn("Checkpoint.memory.get")(
      function* (key) {
        return yield* rows.get((yield* read).records.of("checkpoints"), idOf(key));
      },
      Effect.mapError(storeFailure(Store.Failure, "checkpoint.get")),
    ),
    set: Effect.fn("Checkpoint.memory.set")(
      function* (key, cursor) {
        const space = yield* write;
        const row = yield* rows.encode(cursor);
        space.records.of("checkpoints").set(idOf(key), row);
      },
      Effect.mapError(storeFailure(Store.Failure, "checkpoint.set")),
    ),
    listLive: Effect.fn("Checkpoint.memory.listLive")(
      function* (logId) {
        const live = yield* liveRows.get(
          (yield* read).records.of("liveProjections"),
          MemoryDatabase.keyOf(logId),
        );
        return Option.isSome(live)
          ? live.value.toSorted((left, right) =>
              MemoryDatabase.compareBinary(left.name, right.name),
            )
          : [];
      },
      Effect.mapError(storeFailure(Store.Failure, "checkpoint.listLive")),
    ),
    setLive: Effect.fn("Checkpoint.memory.setLive")(
      function* (logId, versions) {
        const space = yield* write;
        const row = yield* liveRows.encode(versions);
        space.records.of("liveProjections").set(MemoryDatabase.keyOf(logId), row);
      },
      Effect.mapError(storeFailure(Store.Failure, "checkpoint.setLive")),
    ),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `Checkpoint` in process memory, over the workspace's `Store.MemoryBinding`: each
 * projection version's progress through one log while it is rebuilt, and the versions live on each
 * log, kept as one row per log. Both are written in the caller's transaction, with the projection's
 * rows, so progress and rows commit together. Its failures are the journal's `Store.Failure`.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(Checkpoint, makeMemory());
