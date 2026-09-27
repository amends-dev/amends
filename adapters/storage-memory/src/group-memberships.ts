import { Group, GroupMembership, GroupMembershipStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Member } from "@amends/core/workspace";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(GroupMembership.Record));
const rows = Rows.make(Schema.fromJsonString(GroupMembership.Record));
const byId = (left: GroupMembership.Record, right: GroupMembership.Record) =>
  compareBinary(left.id, right.id);

/** Recorded group admissions; one active admission per group and workspace membership. @category constructors */
export const make = Effect.fn("GroupMemberships.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.groupMemberships));
  return GroupMembershipStore.Service.of({
    workspaceId,
    get: Effect.fn("GroupMemberships.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* rows.get((yield* read).records.groupMemberships, id);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "get")),
    ),
    getMany: Effect.fn("GroupMemberships.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(GroupMembership.Id))(input);
        return yield* rows.getMany((yield* read).records.groupMemberships, ids);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "getMany")),
    ),
    findActive: Effect.fn("GroupMemberships.findActive")(
      function* (groupInput, memberInput) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
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
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const memberIds = new Set(yield* Schema.decodeEffect(Schema.Array(Member.Id))(input));
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
        const groupIds = new Set(yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput));
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
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
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return (yield* all).filter((record) => record.groupId === groupId).toSorted(byId);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "listByGroup")),
    ),
    pageActiveByGroup: Effect.fn("GroupMemberships.pageActiveByGroup")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(GroupMembership.ListOptions)(input);
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
      function* (memberInput, input) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const options = yield* Schema.decodeEffect(GroupMembership.ByMemberOptions)(input);
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
      function* (input) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(input);
        return (yield* all)
          .filter((record) => record.memberId === memberId && record.status === "active")
          .toSorted(byId);
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "listActiveByMember")),
    ),
    markRemoved: Effect.fn("GroupMemberships.markRemoved")(function* (input) {
      yield* Store.Transaction;
      const removal = yield* Schema.decodeEffect(GroupMembership.Removal)(input).pipe(
        Effect.mapError(storeConflict(GroupMembershipStore, "markRemoved")),
      );
      if (removal.workspaceId !== workspaceId)
        return yield* new GroupMembershipStore.Conflict({
          operation: "markRemoved",
          message: "Removal belongs to another workspace",
        });
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(GroupMembershipStore, "markRemoved")),
      );
      const current = yield* rows
        .get(space.records.groupMemberships, removal.membershipId)
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
      space.records.groupMemberships.set(removal.membershipId, row);
    }),
    insert: Effect.fn("GroupMemberships.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(GroupMembershipStore, "insert")),
      );
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new GroupMembershipStore.Conflict({
          operation: "insert",
          message: "Expected an active group membership in this workspace",
        });
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(GroupMembershipStore, "insert")),
      );
      const admissions = yield* rows
        .all(space.records.groupMemberships)
        .pipe(Effect.mapError(storeFailure(GroupMembershipStore, "insert")));
      if (
        space.records.groupMemberships.has(record.id) ||
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
      space.records.groupMemberships.set(record.id, row);
    }),
  });
});

/** Provide group admission storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupMembershipStore.Service, make());

export * as GroupMemberships from "./group-memberships.ts";
