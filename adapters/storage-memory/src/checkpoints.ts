import { Checkpoint, Store } from "@amends/core/journal";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { keyOf, Rows } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Checkpoint.Cursor));
const idOf = (key: Checkpoint.Key) => keyOf(key.logId, key.name, key.version);

/**
 * Each projection version's progress through one log, written with the projection's rows.
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
  });
});

/**
 * Provide Checkpoint.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Checkpoint.Service, make());

export * as Checkpoints from "./checkpoints.ts";
