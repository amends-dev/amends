import { Group, GroupMembership, GroupMembershipStore } from "../group/index.ts";
import { Array, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeFailure } from "./errors.ts";
import * as Rows from "./rows.ts";
import { compareBinary } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(GroupMembership.Record));
const byId = (left: GroupMembership.Record, right: GroupMembership.Record) =>
  compareBinary(left.id, right.id);

/** Recorded group admissions; one active admission per group and workspace membership. @category constructors */
export const make = Effect.fn("GroupMemberships.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.of("groupMemberships")));
  const driver: GroupMembershipStore.GroupMembershipStore["Service"] = {
    get: Effect.fn("GroupMemberships.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groupMemberships"), id);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "get")),
    ),
    getMany: Effect.fn("GroupMemberships.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("groupMemberships"), ids);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "getMany")),
    ),
    findActive: Effect.fn("GroupMemberships.findActive")(
      function* (groupId, memberId) {
        return Array.findFirst(
          yield* all,
          (record) =>
            record.groupId === groupId &&
            record.memberId === memberId &&
            record.status === "active",
        );
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupMemberships.findActiveMany")(
      function* (groupId, input) {
        const memberIds = new Set(input);
        if (memberIds.size === 0) return [];
        return (yield* all).filter(
          (record) =>
            record.groupId === groupId &&
            record.status === "active" &&
            memberIds.has(record.memberId),
        );
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "findActiveMany")),
    ),
    summarize: Effect.fn("GroupMemberships.summarize")(
      function* (groupInput, memberInput) {
        const groupIds = new Set(groupInput);
        const memberId = memberInput;
        if (groupIds.size === 0) return [];
        const summaries = new Map<Group.Id, Group.Summary>();
        for (const record of yield* all) {
          if (record.status !== "active" || !groupIds.has(record.groupId)) continue;
          const summary = summaries.get(record.groupId);
          summaries.set(record.groupId, {
            groupId: record.groupId,
            members: (summary?.members ?? 0) + 1,
            joined: (summary?.joined ?? false) || record.memberId === memberId,
          });
        }
        return [...summaries.values()];
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "summarize")),
    ),
    listByGroup: Effect.fn("GroupMemberships.listByGroup")(
      function* (groupId) {
        return (yield* all).filter((record) => record.groupId === groupId).toSorted(byId);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "listByGroup")),
    ),
    pageActiveByGroup: Effect.fn("GroupMemberships.pageActiveByGroup")(
      function* (groupId, options) {
        const after = options.after;
        return (yield* all)
          .filter(
            (record) =>
              record.groupId === groupId &&
              record.status === "active" &&
              (after === undefined || compareBinary(record.id, after) > 0),
          )
          .toSorted(byId)
          .slice(0, options.limit);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "pageActiveByGroup")),
    ),
    pageActiveByMember: Effect.fn("GroupMemberships.pageActiveByMember")(
      function* (memberId, options) {
        const after = options.afterGroupId;
        return (yield* all)
          .filter(
            (record) =>
              record.memberId === memberId &&
              record.status === "active" &&
              (after === undefined || compareBinary(record.groupId, after) > 0),
          )
          .toSorted((left, right) => compareBinary(left.groupId, right.groupId))
          .slice(0, options.limit);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "pageActiveByMember")),
    ),
    listActiveByMember: Effect.fn("GroupMemberships.listActiveByMember")(
      function* (memberId) {
        return (yield* all)
          .filter((record) => record.memberId === memberId && record.status === "active")
          .toSorted(byId);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "listActiveByMember")),
    ),
    markRemoved: Effect.fn("GroupMemberships.markRemoved")(function* (removal) {
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(GroupMembershipStore, "markRemoved")),
      );
      const current = yield* rows
        .get(space.records.of("groupMemberships"), removal.membershipId)
        .pipe(Effect.mapError(storeFailure(GroupMembershipStore, "markRemoved")));
      if (
        Option.isNone(current) ||
        current.value.groupId !== removal.groupId ||
        current.value.memberId !== removal.memberId ||
        current.value.status !== "active"
      )
        return yield* new GroupMembershipStore.Conflict({
          operation: "markRemoved",
          message: "Expected the specified active group admission",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "removed" })
        .pipe(Effect.mapError(storeFailure(GroupMembershipStore, "markRemoved")));
      space.records.of("groupMemberships").set(removal.membershipId, row);
    }),
    insert: Effect.fn("GroupMemberships.insert")(function* (record) {
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(GroupMembershipStore, "insert")),
      );
      const admissions = yield* rows
        .all(space.records.of("groupMemberships"))
        .pipe(Effect.mapError(storeFailure(GroupMembershipStore, "insert")));
      if (
        space.records.of("groupMemberships").has(record.id) ||
        admissions.some(
          (admission) =>
            admission.groupId === record.groupId &&
            admission.memberId === record.memberId &&
            admission.status === "active",
        )
      )
        return yield* new GroupMembershipStore.Conflict({
          operation: "insert",
          message: "Admission ID reused, or the member is already admitted",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(GroupMembershipStore, "insert")));
      space.records.of("groupMemberships").set(record.id, row);
    }),
  };
  return GroupMembershipStore.make(workspaceId, driver);
});

/** Provide group admission storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupMembershipStore.GroupMembershipStore, make());
