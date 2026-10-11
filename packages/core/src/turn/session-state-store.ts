import { Context, Effect, Schema } from "effect";
import { Agent } from "../agent/agent.ts";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";
import { ThreadParticipationId } from "../thread/ThreadParticipationId.ts";
import { StoreInput } from "../journal/StoreInput.ts";

export class Failure extends Schema.TaggedError<Failure>()("SessionStateStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * What an agent's harness session resumes from, beside its conversation, which the session log
 * keeps: the harness's agent that last ran it, and what that agent returned of its own when it let
 * go of the session, which only it reads.
 */
export const Resume = Schema.Struct({
  agent: Schema.String,
  agentState: Schema.optionalKey(Schema.Json),
});
export interface Resume extends Schema.Schema.Type<typeof Resume> {}

/**
 * What an agent's harness session in a thread was left as when its last turn ended: what it
 * resumes from; the thread position through which it was given the thread's messages, which the
 * next turn's prompt follows; and what it ran on, whose harness the next turn keeps on `Auto`.
 */
export const Saved = Schema.Struct({
  ...Resume.fields,
  promptedThroughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  selection: Agent.Selection,
});
export interface Saved extends Schema.Schema.Type<typeof Saved> {}

/**
 * Each participation's harness session, as its turns leave it, outside the journal: no fact or
 * view holds it, and rebuilding projections keeps it. Writes join the commit that ends the turn,
 * so a reply and the session it came from are stored together or not at all. A participation that
 * ended keeps its session, and taking part again starts another.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
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

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/turn/session-state-store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: Interface): Interface => {
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

export * as SessionStateStore from "./session-state-store.ts";
