import { Group, GroupMembership, GroupMembershipStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Member } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(GroupMembership.Record));
const codec = Schema.fromJsonString(GroupMembership.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: GroupMembership.Record.fields.workspaceId,
      id: GroupMembership.Id,
      groupId: Group.Id,
      memberId: Member.Id,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.groupId === row.record.groupId &&
            row.memberId === row.record.memberId) ||
          "Group membership columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: GroupMembership.Record }>) =>
  rows.map(({ record }) => record);

/** Recorded group admissions; one active admission per group and workspace membership. @category constructors */
export const make = Effect.fn("GroupMemberships.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, group_id AS groupId, member_id AS memberId, record`;
  return GroupMembershipStore.Service.of({
    workspaceId,
    get: Effect.fn("GroupMemberships.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "get")),
    ),
    getMany: Effect.fn("GroupMemberships.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(GroupMembership.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND id ${inIds(sql, ids)}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "getMany")),
    ),
    findActive: Effect.fn("GroupMemberships.findActive")(
      function* (groupInput, memberInput) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND group_id = ${groupId} AND member_id = ${memberId} AND json_extract(record, '$.status') = 'active'`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "findActive")),
    ),
    listByGroup: Effect.fn("GroupMemberships.listByGroup")(
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND group_id = ${groupId} ORDER BY id COLLATE BINARY`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "listByGroup")),
    ),
    pageActiveByGroup: Effect.fn("GroupMemberships.pageActiveByGroup")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(GroupMembership.ListOptions)(input);
        const after = options.after === undefined ? sql`` : sql`AND id > ${options.after}`;
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND group_id = ${groupId} AND json_extract(record, '$.status') = 'active' ${after} ORDER BY id COLLATE BINARY LIMIT ${options.limit}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "pageActiveByGroup")),
    ),
    pageActiveByMember: Effect.fn("GroupMemberships.pageActiveByMember")(
      function* (memberInput, input) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const options = yield* Schema.decodeEffect(GroupMembership.ByMemberOptions)(input);
        const after =
          options.afterGroupId === undefined ? sql`` : sql`AND group_id > ${options.afterGroupId}`;
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND member_id = ${memberId} AND json_extract(record, '$.status') = 'active' ${after} ORDER BY group_id COLLATE BINARY LIMIT ${options.limit}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(GroupMembershipStore, "pageActiveByMember")),
    ),
    listActiveByMember: Effect.fn("GroupMemberships.listActiveByMember")(
      function* (input) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM group_memberships WHERE workspace_id = ${workspaceId} AND member_id = ${memberId} AND json_extract(record, '$.status') = 'active' ORDER BY id COLLATE BINARY`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
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
        sql`UPDATE group_memberships SET record = json_set(record, '$.status', 'removed') WHERE workspace_id = ${workspaceId} AND id = ${removal.membershipId} AND group_id = ${removal.groupId} AND member_id = ${removal.memberId} AND json_extract(record, '$.status') = 'active' RETURNING id`,
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
        sql`SELECT groups.id FROM groups JOIN members ON members.workspace_id = groups.workspace_id WHERE groups.workspace_id = ${workspaceId} AND groups.id = ${record.groupId} AND members.id = ${record.memberId}`,
        true,
      ).pipe(Effect.mapError(storeError(GroupMembershipStore, "insert")));
      if (related.length === 0)
        return yield* new GroupMembershipStore.Conflict({
          operation: "insert",
          message: "Group or workspace membership is missing",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(GroupMembershipStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO group_memberships (workspace_id, id, group_id, member_id, record) VALUES (${workspaceId}, ${record.id}, ${record.groupId}, ${record.memberId}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(GroupMembershipStore, "insert")));
    }),
  });
});

/** Provide group admission storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupMembershipStore.Service, make());

export * as GroupMemberships from "./group-memberships.ts";
