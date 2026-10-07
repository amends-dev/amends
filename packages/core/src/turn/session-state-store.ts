import { Session } from "@amends/harness-v2";
import { Context, Schema } from "effect";
import { AgentV2 } from "../agent-v2/agent.ts";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { ThreadParticipationId } from "../thread/participation/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("SessionStateStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * What an agent's harness session in a thread was left as when its last turn ended: the
 * session's state, which the next turn resumes from; the thread position through which it was
 * given the thread's messages, which the next turn's prompt follows; and what it ran on, whose
 * harness the next turn keeps on `Auto`, as only that harness reads its own state.
 */
export const Saved = Schema.Struct({
  state: Session.SessionState,
  promptedThroughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  selection: AgentV2.Selection,
});
export interface Saved extends Schema.Schema.Type<typeof Saved> {}

/**
 * Each participation's harness session, as its turns leave it, outside the journal: no fact or
 * view holds a conversation, and rebuilding projections keeps them. Writes join the commit that
 * ends the turn, so a reply and the state it came from are stored together or not at all. A
 * participation that ended keeps its session, and taking part again starts another.
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
  "@amends/core/turn/session-state-store/Service",
) {}

export * as SessionStateStore from "./session-state-store.ts";
