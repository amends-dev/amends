/**
 * The storage contract for what each participation's harness session resumes from, which every
 * storage adapter implements and `TurnExecution` writes as a turn ends: the harness's agent that
 * ran the session last and what it returned of its own, how far the agent has been prompted, and
 * the selection its last turn ran on, so the agent's next turn in the thread resumes on the same
 * harness. It is kept outside the journal: no fact holds it, and rebuilding projections keeps it.
 *
 * @since 0.1.0
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Agent from "../agent/Agent.ts";
import type * as Option from "effect/Option";
import * as Store from "../journal/Store.ts";
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";
import * as StoreError from "../journal/StoreError.ts";

/**
 * What an agent's harness session resumes from, beside its conversation, which the session log
 * keeps: the harness's agent that last ran it, and what that agent returned of its own when it let
 * go of the session, which only it reads.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Resume = Schema.Struct({
  agent: Schema.String,
  agentState: Schema.optionalKey(Schema.Json),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Resume extends Schema.Schema.Type<typeof Resume> {}

/**
 * What an agent's harness session in a thread was left as when its last turn ended: what it
 * resumes from; the thread position through which it was given the thread's messages, which the
 * next turn's prompt follows; and what it ran on, whose harness the next turn keeps on `Auto`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Saved = Schema.Struct({
  ...Resume.fields,
  promptedThroughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  selection: Agent.Selection,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Saved extends Schema.Schema.Type<typeof Saved> {}

/**
 * The session state store, bound to one workspace by the host: each participation's harness
 * session, as its turns leave it, outside the journal: no fact or view holds it, and rebuilding
 * projections keeps it. Writes join the commit that ends the turn, so a reply and the session it
 * came from are stored together or not at all. A participation that ended keeps its session, and
 * taking part again starts another.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema before the driver sees it, so a driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class SessionStateStore extends Context.Service<
  SessionStateStore,
  {
    /** The participation's session as its last turn left it, or none before its first ended. */
    readonly get: (
      participationId: ThreadParticipationId.Id,
    ) => Effect.Effect<Option.Option<Saved>, StoreError.StoreError>;
    /** Store the participation's session, in place of any it had. */
    readonly set: (
      participationId: ThreadParticipationId.Id,
      saved: Saved,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
  }
>()("@amends-dev/core/turn/SessionStateStore") {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: SessionStateStore["Service"]): SessionStateStore["Service"] => {
  const read = StoreInput.read("SessionStateStore");
  return {
    get: (participationId) =>
      Effect.flatMap(read("get", ThreadParticipationId.Id, participationId), driver.get),
    set: Effect.fn("SessionStateStore.set")(function* (participationId, saved) {
      return yield* driver.set(
        yield* read("set", ThreadParticipationId.Id, participationId),
        yield* read("set", Saved, saved),
      );
    }),
  };
};

/** A participation's session as JSON. */
const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(Saved)));

/**
 * Each participation's harness session in the workspace's memory, written in its transactions.
 */
const makeMemory = Effect.fn("SessionStateStore.makeMemory")(function* () {
  const { read, write } = yield* Store.MemoryBinding;
  const driver: SessionStateStore["Service"] = {
    get: Effect.fn("SessionStateStore.memory.get")(
      function* (participationId) {
        return yield* rows.get((yield* read).sessionStates, participationId);
      },
      Effect.mapError(StoreError.failed("SessionStateStore", "get")),
    ),
    set: Effect.fn("SessionStateStore.memory.set")(
      function* (participationId, saved) {
        const row = yield* rows.encode(saved);
        (yield* write).sessionStates.set(participationId, row);
      },
      Effect.mapError(StoreError.failed("SessionStateStore", "set")),
    ),
  };
  return make(driver);
});

/**
 * Provide `SessionStateStore` in process memory, over the workspace's `Store.MemoryBinding`: what
 * each participation's harness session resumes from, kept as JSON beside the projected records,
 * outside the journal, so rebuilding projections keeps it. Writes require the caller's transaction,
 * and a write replaces what was stored. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(SessionStateStore, makeMemory());
