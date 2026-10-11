import { Checkpoint, Store } from "../journal/index.ts";
import { Effect, Layer, Schema, Option } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary, keyOf } from "./Rows.ts";

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
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: Checkpoint.Checkpoint["Service"] = {
    get: Effect.fn("Checkpoints.get")(
      function* (key) {
        return yield* rows.get((yield* read).records.of("checkpoints"), idOf(key));
      },
      Effect.mapError(storeFailure(Store, "checkpoint.get")),
    ),
    set: Effect.fn("Checkpoints.set")(
      function* (key, cursor) {
        const space = yield* write;
        const row = yield* rows.encode(cursor);
        space.records.of("checkpoints").set(idOf(key), row);
      },
      Effect.mapError(storeFailure(Store, "checkpoint.set")),
    ),
    listLive: Effect.fn("Checkpoints.listLive")(
      function* (logId) {
        const live = yield* liveRows.get((yield* read).records.of("liveProjections"), keyOf(logId));
        return Option.isSome(live)
          ? live.value.toSorted((left, right) => compareBinary(left.name, right.name))
          : [];
      },
      Effect.mapError(storeFailure(Store, "checkpoint.listLive")),
    ),
    setLive: Effect.fn("Checkpoints.setLive")(
      function* (logId, versions) {
        const space = yield* write;
        const row = yield* liveRows.encode(versions);
        space.records.of("liveProjections").set(keyOf(logId), row);
      },
      Effect.mapError(storeFailure(Store, "checkpoint.setLive")),
    ),
  };
  return Checkpoint.make(workspaceId, driver);
});

/**
 * Provide Checkpoint.Checkpoint using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Checkpoint.Checkpoint, make());
