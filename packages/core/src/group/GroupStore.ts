/**
 * The storage contract for groups, which every storage adapter implements and `GroupProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Array, Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import type * as MemberId from "../workspace/MemberId.ts";
import * as Group from "./Group.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing groups.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("GroupStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * direct group for one member set, a missing group, or a direct group renamed.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("GroupStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The group store, bound to one workspace by the host.
 *
 * What a storage adapter implements for groups.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupStore extends Context.Service<
  GroupStore,
  {
    /** The group, if stored. */
    readonly get: (id: Group.Id) => Effect.Effect<Option.Option<Group.Group>, Failure>;
    /**
     * Find several groups in one read. Absent IDs are omitted and each found record appears once;
     * order is unspecified, so callers index results by ID. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<Group.Id>,
    ) => Effect.Effect<ReadonlyArray<Group.Group>, Failure>;
    /** A page of the workspace's public team groups in binary group-ID order, after the cursor. */
    readonly pagePublic: (
      options: Group.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Group.Team>, Failure>;
    /** The direct group with exactly these members, in any order. */
    readonly findDirect: (
      memberIds: ReadonlyArray<MemberId.Id>,
    ) => Effect.Effect<Option.Option<Group.Direct>, Failure>;
    /**
     * Reject reused IDs and a second direct group for the same member set.
     * The creator is recorded as given: references to other read models are checked when facts are
     * published, so this one rebuilds alone. Never upsert.
     */
    readonly insert: (
      record: Group.Group,
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
     * Projection write that advances a group's latest activity time. A time at or before the
     * recorded one changes nothing; a missing group conflicts.
     */
    readonly recordLatest: (
      latest: Group.Latest,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/group/GroupStore") {}

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
    insert: (record) => Effect.flatMap(write("insert", Group.Group, record), driver.insert),
    rename: (renamed) => Effect.flatMap(write("rename", Group.Renamed, renamed), driver.rename),
    getLatest: (ids) =>
      Effect.flatMap(read("getLatest", Schema.Array(Group.Id), ids), driver.getLatest),
    recordLatest: (latest) =>
      Effect.flatMap(write("recordLatest", Group.Latest, latest), driver.recordLatest),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Group.Group));
const latestRows = MemoryDatabase.makeRows(Schema.fromJsonString(Group.Latest));
/** Only a direct group has a member-set key. */
const directKeyOf = (record: Group.Group) =>
  record.kind === "Direct" ? Group.directKey(record.memberIds) : undefined;

/**
 * Group records over the current workspace transaction.
 */
const makeMemory = Effect.fn("GroupStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const driver: GroupStore["Service"] = {
    get: Effect.fn("GroupStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groups"), id);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    getMany: Effect.fn("GroupStore.memory.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("groups"), ids);
      },
      Effect.mapError(storeFailure(Failure, "getMany")),
    ),
    pagePublic: Effect.fn("GroupStore.memory.pagePublic")(
      function* (options) {
        const after = options.after;
        return (yield* rows.all((yield* read).records.of("groups")))
          .flatMap((group) =>
            group.kind === "Team" &&
            group.visibility === "Public" &&
            (after === undefined || MemoryDatabase.compareBinary(group.id, after) > 0)
              ? [group]
              : [],
          )
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.id, right.id))
          .slice(0, options.limit);
      },
      Effect.mapError(storeFailure(Failure, "pagePublic")),
    ),
    findDirect: Effect.fn("GroupStore.memory.findDirect")(
      function* (memberIds) {
        const key = Group.directKey(memberIds);
        const groups = yield* rows.all((yield* read).records.of("groups"));
        return Array.findFirst(groups, (group) =>
          group.kind === "Direct" && directKeyOf(group) === key
            ? Option.some(group)
            : Option.none(),
        );
      },
      Effect.mapError(storeFailure(Failure, "findDirect")),
    ),
    getLatest: Effect.fn("GroupStore.memory.getLatest")(
      function* (ids) {
        return yield* latestRows.getMany((yield* read).records.of("groupLatest"), ids);
      },
      Effect.mapError(storeFailure(Failure, "getLatest")),
    ),
    rename: Effect.fn("GroupStore.memory.rename")(function* (renamed) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "rename")));
      const found = yield* rows
        .get(space.records.of("groups"), renamed.groupId)
        .pipe(Effect.mapError(storeFailure(Failure, "rename")));
      if (Option.isNone(found) || found.value.kind !== "Team")
        return yield* new Conflict({
          operation: "rename",
          message: "Expected a team group",
        });
      const row = yield* rows
        .encode({ ...found.value, name: renamed.name })
        .pipe(Effect.mapError(storeFailure(Failure, "rename")));
      space.records.of("groups").set(renamed.groupId, row);
    }),
    recordLatest: Effect.fn("GroupStore.memory.recordLatest")(function* (latest) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "recordLatest")));
      if (!space.records.of("groups").has(latest.groupId))
        return yield* new Conflict({
          operation: "recordLatest",
          message: "Group is missing",
        });
      const current = yield* latestRows
        .get(space.records.of("groupLatest"), latest.groupId)
        .pipe(Effect.mapError(storeFailure(Failure, "recordLatest")));
      // Only a later time advances; an earlier one changes nothing.
      if (
        Option.isSome(current) &&
        !DateTime.isGreaterThan(latest.occurredAt, current.value.occurredAt)
      )
        return;
      const row = yield* latestRows
        .encode(latest)
        .pipe(Effect.mapError(storeFailure(Failure, "recordLatest")));
      space.records.of("groupLatest").set(latest.groupId, row);
    }),
    insert: Effect.fn("GroupStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("groups").has(record.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Group ID already exists",
        });
      const key = directKeyOf(record);
      if (key !== undefined) {
        const groups = yield* rows
          .all(space.records.of("groups"))
          .pipe(Effect.mapError(storeFailure(Failure, "insert")));
        if (groups.some((group) => directKeyOf(group) === key))
          return yield* new Conflict({
            operation: "insert",
            message: "A direct group already exists for these members",
          });
      }
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("groups").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `GroupStore` in process memory, over the workspace's `Store.MemoryBinding`: group
 * records, and each group's latest activity as a row of its own. It keeps what the contract leaves
 * to storage: a reused ID conflicts, and so does a second direct group for one member set; renaming
 * conflicts unless the group is a stored team, and recording latest activity conflicts for a
 * missing group, while a time no later than the recorded one changes nothing. `make` checks every
 * input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(GroupStore, makeMemory());
