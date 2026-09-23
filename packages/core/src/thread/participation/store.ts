import { Context, Schema } from "effect";
import type { Effect, Option, DateTime } from "effect";
import type { Store } from "../../journal/store.ts";
import type { WorkspaceId } from "../../workspace/id.ts";
import type { ThreadParticipation } from "./participation.ts";

import type { ThreadId } from "../id.ts";
import type { GroupMembership } from "../../group/membership/membership.ts";
export class Failure extends Schema.TaggedError<Failure>()("ThreadParticipationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadParticipationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}
/** Internal projection storage. Reads honor the caller transaction; writes require it. */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
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
  readonly listByThread: (
    id: ThreadId.Id,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, Failure>;
  readonly listByAdmission: (
    id: GroupMembership.Id,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, Failure>;
  /** End exactly the addressed active participation; mismatched or terminal records conflict. */
  readonly end: (
    departure: ThreadParticipation.Departure,
    endedAt: DateTime.Utc,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Validate schema and workspace references before insertion. Preserve historical values on replay. */
  readonly insert: (
    record: ThreadParticipation.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/participation/store/Service",
) {}
export * as ThreadParticipationStore from "./store.ts";
