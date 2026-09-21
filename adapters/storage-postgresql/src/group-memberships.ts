import { Group, GroupMembership, GroupMembershipStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Member } from "@amends/core/workspace";
import { and, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
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
