import { Store } from "../journal/index.ts";
import { SessionStateStore } from "../turn/index.ts";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

/** A participation's session as JSON. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SessionStateStore.Saved)));

/** Each participation's harness session in the workspace's memory, written in its transactions. @category constructors */
export const make = Effect.fn("SessionStates.make")(function* () {
  const { read, write } = yield* Binding.Service;
  return SessionStateStore.Service.of({
    get: Effect.fn("SessionStates.get")(
      function* (participationId) {
        return yield* rows.get((yield* read).sessionStates, participationId);
      },
      Effect.mapError(storeFailure(SessionStateStore, "get")),
    ),
    set: Effect.fn("SessionStates.set")(
      function* (participationId, saved) {
        yield* Store.Transaction;
        const row = yield* rows.encode(saved);
        (yield* write).sessionStates.set(participationId, row);
      },
      Effect.mapError(storeFailure(SessionStateStore, "set")),
    ),
  });
});

/** Provide session storage over the caller's binding. @category layers */
export const layer = Layer.effect(SessionStateStore.Service, make());

export * as SessionStates from "./session-states.ts";
