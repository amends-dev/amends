import { SessionStateStore } from "../turn/index.ts";
import { Effect, Layer, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeFailure } from "./errors.ts";
import * as Rows from "./rows.ts";

/** A participation's session as JSON. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SessionStateStore.Saved)));

/** Each participation's harness session in the workspace's memory, written in its transactions. @category constructors */
export const make = Effect.fn("SessionStates.make")(function* () {
  const { read, write } = yield* Binding.Binding;
  const driver: SessionStateStore.SessionStateStore["Service"] = {
    get: Effect.fn("SessionStates.get")(
      function* (participationId) {
        return yield* rows.get((yield* read).sessionStates, participationId);
      },
      Effect.mapError(storeFailure(SessionStateStore, "get")),
    ),
    set: Effect.fn("SessionStates.set")(
      function* (participationId, saved) {
        const row = yield* rows.encode(saved);
        (yield* write).sessionStates.set(participationId, row);
      },
      Effect.mapError(storeFailure(SessionStateStore, "set")),
    ),
  };
  return SessionStateStore.make(driver);
});

/** Provide session storage over the caller's binding. @category layers */
export const layer = Layer.effect(SessionStateStore.SessionStateStore, make());
