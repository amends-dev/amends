import { Checkpoint, Store } from "@amends/core/journal";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, keyOf, Rows } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Checkpoint.Cursor));
/** A log's live versions, stored together as one row. */
const liveRows = Rows.make(Schema.fromJsonString(Checkpoint.LiveVersions));
const idOf = (key: Checkpoint.Key) => keyOf(key.logId, key.name, key.version);

/**
 * Each projection version's progress through one log while it is rebuilt, written with the
 * projection's rows, and the versions that are live.
 *
 * @category constructors
 */
export const make = Effect.fn("Checkpoints.make")(function* () {
  const { read, write } = yield* Binding.Service;
  return Checkpoint.Service.of({
    get: Effect.fn("Checkpoints.get")(
      function* (key) {
        return yield* rows.get((yield* read).records.checkpoints, idOf(key));
      },
      Effect.mapError(storeFailure(Store, "checkpoint.get")),
    ),
    set: Effect.fn("Checkpoints.set")(function* (inputKey, inputCursor) {
      yield* Store.Transaction;
      const key = yield* Schema.decodeEffect(Checkpoint.Key)(inputKey).pipe(
        Effect.mapError(storeConflict(Store, "checkpoint.set")),
      );
      const cursor = yield* Schema.decodeEffect(Schema.toType(Checkpoint.Cursor))(inputCursor).pipe(
        Effect.mapError(storeConflict(Store, "checkpoint.set")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(Store, "checkpoint.set")));
      const row = yield* rows
        .encode(cursor)
        .pipe(Effect.mapError(storeFailure(Store, "checkpoint.set")));
      space.records.checkpoints.set(idOf(key), row);
    }),
    listLive: Effect.fn("Checkpoints.listLive")(
      function* (logId) {
        const live = yield* liveRows.get((yield* read).records.liveProjections, keyOf(logId));
        return live._tag === "Some"
          ? live.value.toSorted((left, right) => compareBinary(left.name, right.name))
          : [];
      },
      Effect.mapError(storeFailure(Store, "checkpoint.listLive")),
    ),
    setLive: Effect.fn("Checkpoints.setLive")(function* (logId, input) {
      yield* Store.Transaction;
      const versions = yield* Schema.decodeEffect(Checkpoint.LiveVersions)(input).pipe(
        Effect.mapError(storeConflict(Store, "checkpoint.setLive")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(Store, "checkpoint.setLive")));
      const row = yield* liveRows
        .encode(versions)
        .pipe(Effect.mapError(storeFailure(Store, "checkpoint.setLive")));
      space.records.liveProjections.set(keyOf(logId), row);
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
