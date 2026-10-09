import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { MemberId } from "../workspace/member/id.ts";
import type { Group } from "./group.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("GroupStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  readonly get: (id: Group.Id) => Effect.Effect<Option.Option<Group.Record>, Failure>;
  /**
   * Find several groups in one read. Absent IDs are omitted and each found record appears once;
   * order is unspecified, so callers index results by ID. An empty request reads nothing.
   */
  readonly getMany: (
    ids: ReadonlyArray<Group.Id>,
  ) => Effect.Effect<ReadonlyArray<Group.Record>, Failure>;
  /** A page of the workspace's public team groups in binary group-ID order, after the cursor. */
  readonly pagePublic: (
    options: Group.ListOptions,
  ) => Effect.Effect<ReadonlyArray<Group.TeamRecord>, Failure>;
  /** The direct group with exactly these members, in any order. */
  readonly findDirect: (
    memberIds: ReadonlyArray<MemberId.Id>,
  ) => Effect.Effect<Option.Option<Group.DirectRecord>, Failure>;
  /**
   * Reject invalid/foreign records, reused IDs, and a second direct group for the same member set.
   * The creator is recorded as given: references to other read models are checked when facts are
   * published, so this one rebuilds alone. Never upsert.
   */
  readonly insert: (
    record: Group.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Projection write that sets a team group's name. A missing, foreign, or direct group conflicts;
   * the same name again changes nothing.
   */
  readonly rename: (
    renamed: Group.Renamed,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Latest content activity of several groups in one read. Groups without any, and absent IDs,
   * are omitted; order is unspecified.
   */
  readonly getLatest: (
    ids: ReadonlyArray<Group.Id>,
  ) => Effect.Effect<ReadonlyArray<Group.Latest>, Failure>;
  /**
   * Projection write that advances a group's latest activity time. A time at or before the recorded
   * one changes nothing; a missing, foreign, or malformed group conflicts.
   */
  readonly recordLatest: (
    latest: Group.Latest,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/store/Service",
) {}

export * as GroupStore from "./store.ts";
