import { Group, GroupMembership, GroupMembershipStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Member } from "@amends/core/workspace";
import { and, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { groupMemberships, groups, members } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(GroupMembership.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...GroupMembership.Record.fields, admittedAt: Schema.DateTimeUtcFromDate }),
  ),
);

/** Recorded group admissions; one active admission per group and workspace membership. @category constructors */
export const make = Effect.fn("GroupMemberships.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(groupMemberships.workspaceId, workspaceId);
  return GroupMembershipStore.Service.of({
    workspaceId,
    get: Effect.fn("GroupMemberships.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, eq(groupMemberships.id, id))),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "get")),
    ),
    getMany: Effect.fn("GroupMemberships.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(GroupMembership.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, inIds(groupMemberships.id, ids))),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "getMany")),
    ),
    findActive: Effect.fn("GroupMemberships.findActive")(
      function* (groupInput, memberInput) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.groupId, groupId),
                eq(groupMemberships.memberId, memberId),
                eq(groupMemberships.status, "active"),
              ),
            ),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupMemberships.findActiveMany")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const memberIds = yield* Schema.decodeEffect(Schema.Array(Member.Id))(input);
        if (memberIds.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.groupId, groupId),
                eq(groupMemberships.status, "active"),
                inIds(groupMemberships.memberId, memberIds),
              ),
            ),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "findActiveMany")),
    ),
    listByGroup: Effect.fn("GroupMemberships.listByGroup")(
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, eq(groupMemberships.groupId, groupId)))
            .orderBy(sql`${groupMemberships.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "listByGroup")),
    ),
    pageActiveByGroup: Effect.fn("GroupMemberships.pageActiveByGroup")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(GroupMembership.ListOptions)(input);
        const orderedId = sql`${groupMemberships.id} COLLATE "C"`;
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.groupId, groupId),
                eq(groupMemberships.status, "active"),
                options.after === undefined ? undefined : sql`${orderedId} > ${options.after}`,
              ),
            )
            .orderBy(orderedId)
            .limit(options.limit),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "pageActiveByGroup")),
    ),
    pageActiveByMember: Effect.fn("GroupMemberships.pageActiveByMember")(
      function* (memberInput, input) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const options = yield* Schema.decodeEffect(GroupMembership.ByMemberOptions)(input);
        const orderedGroup = sql`${groupMemberships.groupId} COLLATE "C"`;
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.memberId, memberId),
                eq(groupMemberships.status, "active"),
                options.afterGroupId === undefined
                  ? undefined
                  : sql`${orderedGroup} > ${options.afterGroupId}`,
              ),
            )
            .orderBy(orderedGroup)
            .limit(options.limit),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "pageActiveByMember")),
    ),
    listActiveByMember: Effect.fn("GroupMemberships.listActiveByMember")(
      function* (input) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.memberId, memberId),
                eq(groupMemberships.status, "active"),
              ),
            )
            .orderBy(sql`${groupMemberships.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decode));
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
      const rows = yield* guard(
        db
          .update(groupMemberships)
          .set({ status: "removed" })
          .where(
            and(
              inWorkspace,
              eq(groupMemberships.id, removal.membershipId),
              eq(groupMemberships.groupId, removal.groupId),
              eq(groupMemberships.memberId, removal.memberId),
              eq(groupMemberships.status, "active"),
            ),
          )
          .returning({ id: groupMemberships.id }),
        true,
      ).pipe(Effect.mapError(storeError(GroupMembershipStore, "markRemoved")));
      if (rows.length === 0)
        return yield* new GroupMembershipStore.Conflict({
          operation: "markRemoved",
          message: "Expected the specified active group admission",
        });
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
      const related = yield* guard(
        db
          .select({ id: groups.id })
          .from(groups)
          .innerJoin(members, eq(members.workspaceId, groups.workspaceId))
          .where(
            and(
              eq(groups.workspaceId, workspaceId),
              eq(groups.id, record.groupId),
              eq(members.id, record.memberId),
            ),
          ),
        true,
      ).pipe(Effect.mapError(storeError(GroupMembershipStore, "insert")));
      if (related.length === 0)
        return yield* new GroupMembershipStore.Conflict({
          operation: "insert",
          message: "Group or workspace membership is missing",
        });
      yield* guard(
        db
          .insert(groupMemberships)
          .values({ ...record, admittedAt: DateTime.toDate(record.admittedAt) }),
        true,
      ).pipe(Effect.mapError(storeError(GroupMembershipStore, "insert")));
    }),
  });
});

/** Provide group admission storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupMembershipStore.Service, make());

export * as GroupMemberships from "./group-memberships.ts";
