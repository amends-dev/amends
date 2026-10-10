import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { ThreadId } from "../thread/ThreadId.ts";

import type { MemberId } from "../workspace/member/id.ts";
import type { Turn } from "./turn.ts";

export class Failure extends Schema.TaggedError<Failure>()("TurnStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("TurnStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  readonly get: (id: Turn.Id) => Effect.Effect<Option.Option<Turn.Record>, Failure>;
  /** The agent's active turn on the thread: queued, running, or cancelling. */
  readonly findActive: (
    memberId: MemberId.Id,
    threadId: ThreadId.Id,
  ) => Effect.Effect<Option.Option<Turn.Record>, Failure>;
  /**
   * The agent's most recent turn on the thread, active or finished: by creation, then by how far
   * its accepted input reaches, which a later turn always extends.
   */
  readonly findLatest: (
    memberId: MemberId.Id,
    threadId: ThreadId.Id,
  ) => Effect.Effect<Option.Option<Turn.Record>, Failure>;
  /** Every active turn in the workspace, oldest first, at most `limit`. */
  readonly listActive: (limit: number) => Effect.Effect<ReadonlyArray<Turn.Record>, Failure>;
  /** The agent's active turns, one at most per thread, oldest first. */
  readonly listActiveByMember: (
    memberId: MemberId.Id,
  ) => Effect.Effect<ReadonlyArray<Turn.Record>, Failure>;
  /**
   * Reject invalid or foreign records, reused IDs, and a second active turn for the same agent
   * and thread. Never upsert.
   */
  readonly insert: (
    record: Turn.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored turn; a missing, foreign, or invalid record conflicts. */
  readonly update: (
    record: Turn.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/turn/store/Service",
) {}

export * as TurnStore from "./store.ts";
