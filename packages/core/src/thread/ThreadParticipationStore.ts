/**
 * The storage contract for participations, which every storage adapter implements and
 * `ThreadParticipationProjection` writes. Reads honor the caller's transaction when there is one;
 * writes require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import type { Effect, Option, DateTime } from "effect";
import type { Store } from "../journal/store.ts";

import type { ThreadParticipation } from "./ThreadParticipation.ts";

import type { ThreadId } from "./ThreadId.ts";
import type { GroupMembership } from "../group/membership/membership.ts";

/**
 * Storage failed while reading or writing participations.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ThreadParticipationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * active participation for one participant, or an ending that names no active participation.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadParticipationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * What a storage adapter implements for participations.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly get: (
    id: ThreadParticipation.Id,
  ) => Effect.Effect<Option.Option<ThreadParticipation.Record>, Failure>;
  /**
   * Find several participations, active or ended, in one read. Absent IDs are omitted and each
   * found record appears once; order is unspecified, so callers index results by ID. An empty
   * request reads nothing.
   */
  readonly getMany: (
    ids: ReadonlyArray<ThreadParticipation.Id>,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, Failure>;
  /**
   * Every participation the thread has had, active or ended, in stable ID order. A history read
   * for inspection; operations use the bounded reads below.
   */
  readonly listByThread: (
    id: ThreadId.Id,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, Failure>;
  /**
   * A page of the thread's active participations in binary participation-ID order, after the
   * exclusive cursor.
   */
  readonly pageActiveByThread: (
    id: ThreadId.Id,
    options: ThreadParticipation.ListOptions,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, Failure>;
  /**
   * The thread's active participations of these participants, in one read. Each found record
   * appears once; order is unspecified, so callers index results by participant. An empty
   * request reads nothing.
   */
  readonly findActive: (
    id: ThreadId.Id,
    participants: ReadonlyArray<ThreadParticipation.Reference>,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, Failure>;
  /**
   * End every active participation held through this group admission at `endedAt`, however many
   * there are, in one write; ended ones keep their time. A departure from the group ends them all.
   */
  readonly endByAdmission: (
    id: GroupMembership.Id,
    endedAt: DateTime.Utc,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** End exactly the addressed active participation; mismatched or terminal records conflict. */
  readonly end: (
    departure: ThreadParticipation.Departure,
    endedAt: DateTime.Utc,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Reject malformed or foreign records, an ended one, reused IDs, and a second active
   * participation for one participant in the thread. The thread and admission are recorded as
   * given, checked when the participant is admitted. Preserve historical values on replay.
   */
  readonly insert: (
    record: ThreadParticipation.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

/**
 * The participation store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/ThreadParticipationStore",
) {}

export * as ThreadParticipationStore from "./ThreadParticipationStore.ts";
