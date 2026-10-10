import { Context, Schema } from "effect";
import type { Array, Effect } from "effect";
import type { ThreadParticipationId } from "../thread/ThreadParticipationId.ts";
import type { SessionLog } from "./session-log.ts";

export class Failure extends Schema.TaggedError<Failure>()("SessionLogStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/** The log holds an entry past where its writer read it to: someone else wrote there meanwhile. */
export class Conflict extends Schema.TaggedError<Conflict>()("SessionLogStore.Conflict", {
  participationId: Schema.String,
  after: Schema.Int,
}) {}

/**
 * The host's storage for session logs: one append-only log for each participation in the
 * workspace. Logs take part in no commit, so a host may keep them apart from its other stores, in
 * one built for appending. A log's first entry is at position 1, and each next one follows it.
 */
export interface Interface {
  /** The position of the log's latest entry, or 0 while it has none. */
  readonly head: (participationId: ThreadParticipationId.Id) => Effect.Effect<number, Failure>;
  /**
   * Append `entries` in order after the entry at `after`, the log's latest as the writer read it,
   * or 0 for an empty log. A log that holds an entry past `after` takes none of them and fails with
   * Conflict, so a writer that fell behind, as one another replaced has, cannot write past it.
   */
  readonly append: (
    participationId: ThreadParticipationId.Id,
    entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>,
    after: number,
  ) => Effect.Effect<Array.NonEmptyReadonlyArray<SessionLog.Recorded>, Failure | Conflict>;
  /** The log's entries past `after`, oldest first, at most `limit` of them. */
  readonly read: (
    participationId: ThreadParticipationId.Id,
    options: { readonly after: number; readonly limit: number },
  ) => Effect.Effect<ReadonlyArray<SessionLog.Recorded>, Failure>;
  /** Completes once the log holds an entry past `after`. */
  readonly waitForAppend: (
    participationId: ThreadParticipationId.Id,
    after: number,
  ) => Effect.Effect<void, Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/session-log-store/Service",
) {}

export * as SessionLogStore from "./session-log-store.ts";
