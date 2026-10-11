import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";

import type * as MemberId from "../workspace/MemberId.ts";
import * as Group from "./Group.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("GroupStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Internal projection storage. Reads honor an existing transaction; writes require one.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export class GroupStore extends Context.Service<
  GroupStore,
  {
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
     * Reject reused IDs and a second direct group for the same member set.
     * The creator is recorded as given: references to other read models are checked when facts are
     * published, so this one rebuilds alone. Never upsert.
     */
    readonly insert: (
      record: Group.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Projection write that sets a team group's name. A missing or direct group conflicts;
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
     * one changes nothing; a missing group conflicts.
     */
    readonly recordLatest: (
      latest: Group.Latest,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/group/store/Service") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: GroupStore["Service"],
): GroupStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Group.Id, id), driver.get),
    getMany: (ids) => Effect.flatMap(read("getMany", Schema.Array(Group.Id), ids), driver.getMany),
    pagePublic: (options) =>
      Effect.flatMap(read("pagePublic", Group.ListOptions, options), driver.pagePublic),
    findDirect: (memberIds) =>
      Effect.flatMap(
        read("findDirect", Group.DirectMembers, Group.directMembers(memberIds)),
        driver.findDirect,
      ),
    insert: (record) => Effect.flatMap(write("insert", Group.Record, record), driver.insert),
    rename: (renamed) => Effect.flatMap(write("rename", Group.Renamed, renamed), driver.rename),
    getLatest: (ids) =>
      Effect.flatMap(read("getLatest", Schema.Array(Group.Id), ids), driver.getLatest),
    recordLatest: (latest) =>
      Effect.flatMap(write("recordLatest", Group.Latest, latest), driver.recordLatest),
  };
};
