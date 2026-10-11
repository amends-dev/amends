/**
 * The storage contract for what each participation's harness session resumes from, which every
 * storage adapter implements and `TurnExecution` writes as a turn ends: the harness's agent that
 * ran the session last and what it returned of its own, how far the agent has been prompted, and
 * the selection its last turn ran on, so the agent's next turn in the thread resumes on the same
 * harness. It is kept outside the journal: no fact holds it, and rebuilding projections keeps it.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import * as Agent from "../agent/Agent.ts";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts";
import * as StoreInput from "../journal/StoreInput.ts";

/**
 * Storage failed while reading or writing session states.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("SessionStateStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

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
    ) => Effect.Effect<Option.Option<Saved>, Failure>;
    /** Store the participation's session, in place of any it had. */
    readonly set: (
      participationId: ThreadParticipationId.Id,
      saved: Saved,
    ) => Effect.Effect<void, Failure, Store.Transaction>;
  }
>()("@amends-dev/core/turn/session-state-store/Service") {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: SessionStateStore["Service"]): SessionStateStore["Service"] => {
  const read = StoreInput.read(Failure);
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
