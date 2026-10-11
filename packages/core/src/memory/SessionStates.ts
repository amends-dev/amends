/**
 * The memory implementation of `SessionStateStore` from `../turn/SessionStateStore.ts`, over the
 * workspace's `Binding`: what each participation's harness session resumes from, kept as JSON
 * beside the projected records, outside the journal, so rebuilding projections keeps it. Writes
 * require the caller's transaction, and a write replaces what was stored.
 * `SessionStateStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { SessionStateStore } from "../turn/index.ts";
import { Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

/** A participation's session as JSON. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SessionStateStore.Saved)));

/**
 * Each participation's harness session in the workspace's memory, written in its transactions.
 *
 * @category constructors
 * @since 0.1.0
 */
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

/**
 * Provide session storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SessionStateStore.SessionStateStore, make());
