import { Group, GroupFollow, GroupFollowStore, GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Member } from "@amends/core/workspace";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";

const validate = Schema.decodeEffect(Schema.toType(GroupFollow.Record));
const codec = Schema.fromJsonString(GroupFollow.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: GroupFollow.Record.fields.workspaceId,
      id: GroupFollow.Id,
      groupId: Group.Id,
      memberId: Member.Id,
      groupMembershipId: GroupMembership.Id,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.groupId === row.record.groupId &&
            row.memberId === row.record.memberId &&
            row.groupMembershipId === row.record.groupMembershipId) ||
          "Group follow columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: GroupFollow.Record }>) =>
  rows.map(({ record }) => record);

/** Group follows, active and ended; one active follow per group admission. @category constructors */
export const make = Effect.fn("GroupFollows.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, group_id AS groupId, member_id AS memberId, group_membership_id AS groupMembershipId, record`;
  return GroupFollowStore.Service.of({
    workspaceId,
    get: Effect.fn("GroupFollows.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupFollow.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM group_follows WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "get")),
    ),
    findActive: Effect.fn("GroupFollows.findActive")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM group_follows WHERE workspace_id = ${workspaceId} AND group_membership_id = ${id} AND json_extract(record, '$.status') = 'active'`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupFollows.findActiveMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(GroupMembership.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          sql`SELECT ${columns} FROM group_follows WHERE workspace_id = ${workspaceId} AND group_membership_id ${inIds(sql, ids)} AND json_extract(record, '$.status') = 'active'`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActiveMany")),
    ),
    listActiveByGroup: Effect.fn("GroupFollows.listActiveByGroup")(
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM group_follows WHERE workspace_id = ${workspaceId} AND group_id = ${groupId} AND json_extract(record, '$.status') = 'active' ORDER BY id COLLATE BINARY`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "listActiveByGroup")),
    ),
    insert: Effect.fn("GroupFollows.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(GroupFollowStore, "insert")),
      );
      if (
        record.workspaceId !== workspaceId ||
        record.status !== "active" ||
        record.endedAt !== null
      )
        return yield* new GroupFollowStore.Conflict({
          operation: "insert",
          message: "Expected an active follow in this workspace",
        });
      // The admission must belong to the same group and member; whether it is current is the
      // application's check, so replay can restore follows of later-ended admissions.
      const related = yield* guard(
        sql`SELECT id FROM group_memberships WHERE workspace_id = ${workspaceId} AND id = ${record.groupMembershipId} AND group_id = ${record.groupId} AND member_id = ${record.memberId}`,
        true,
      ).pipe(Effect.mapError(storeError(GroupFollowStore, "insert")));
      if (related.length === 0)
        return yield* new GroupFollowStore.Conflict({
          operation: "insert",
          message: "Admission is missing or belongs to another group or member",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(GroupFollowStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO group_follows (workspace_id, id, group_id, member_id, group_membership_id, record) VALUES (${workspaceId}, ${record.id}, ${record.groupId}, ${record.memberId}, ${record.groupMembershipId}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(GroupFollowStore, "insert")));
    }),
    end: Effect.fn("GroupFollows.end")(function* (input, time) {
      yield* Store.Transaction;
      const ending = yield* Schema.decodeEffect(GroupFollow.Ending)(input).pipe(
        Effect.mapError(storeConflict(GroupFollowStore, "end")),
      );
      const endedAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        time,
      ).pipe(Effect.mapError(storeConflict(GroupFollowStore, "end")));
      if (ending.workspaceId !== workspaceId)
        return yield* new GroupFollowStore.Conflict({
          operation: "end",
          message: "Ending belongs to another workspace",
        });
      const rows = yield* guard(
        sql`UPDATE group_follows SET record = json_set(record, '$.status', 'ended', '$.endedAt', ${DateTime.formatIso(endedAt)}) WHERE workspace_id = ${workspaceId} AND id = ${ending.followId} AND group_id = ${ending.groupId} AND member_id = ${ending.memberId} AND json_extract(record, '$.status') = 'active' RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(GroupFollowStore, "end")));
      if (rows.length !== 1)
        return yield* new GroupFollowStore.Conflict({
          operation: "end",
          message: "Follow is missing, mismatched, or already ended",
        });
    }),
  });
});

/** Provide group follow storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupFollowStore.Service, make());

export * as GroupFollows from "./group-follows.ts";
