import { Group, GroupFollow, GroupFollowStore, GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { and, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { groupFollows, groupMemberships } from "./schema.ts";

const validate = Schema.decodeEffect(Schema.toType(GroupFollow.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...GroupFollow.Record.fields,
      followedAt: Schema.DateTimeUtcFromDate,
      endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    }),
  ),
);

/** Group follows, active and ended; one active follow per group admission. @category constructors */
export const make = Effect.fn("GroupFollows.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(groupFollows.workspaceId, workspaceId);
  return GroupFollowStore.Service.of({
    workspaceId,
    get: Effect.fn("GroupFollows.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupFollow.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(and(inWorkspace, eq(groupFollows.id, id))),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "get")),
    ),
    findActive: Effect.fn("GroupFollows.findActive")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(
              and(
                inWorkspace,
                eq(groupFollows.groupMembershipId, id),
                eq(groupFollows.status, "active"),
              ),
            ),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActive")),
    ),
    listActiveByGroup: Effect.fn("GroupFollows.listActiveByGroup")(
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(
              and(
                inWorkspace,
                eq(groupFollows.groupId, groupId),
                eq(groupFollows.status, "active"),
              ),
            )
            .orderBy(sql`${groupFollows.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decode));
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
        db
          .select({ id: groupMemberships.id })
          .from(groupMemberships)
          .where(
            and(
              eq(groupMemberships.workspaceId, workspaceId),
              eq(groupMemberships.id, record.groupMembershipId),
              eq(groupMemberships.groupId, record.groupId),
              eq(groupMemberships.memberId, record.memberId),
            ),
          ),
        true,
      ).pipe(Effect.mapError(storeError(GroupFollowStore, "insert")));
      if (related.length === 0)
        return yield* new GroupFollowStore.Conflict({
          operation: "insert",
          message: "Admission is missing or belongs to another group or member",
        });
      yield* guard(
        db.insert(groupFollows).values({
          ...record,
          followedAt: DateTime.toDate(record.followedAt),
          endedAt: null,
        }),
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
        db
          .update(groupFollows)
          .set({ status: "ended", endedAt: DateTime.toDate(endedAt) })
          .where(
            and(
              inWorkspace,
              eq(groupFollows.id, ending.followId),
              eq(groupFollows.groupId, ending.groupId),
              eq(groupFollows.memberId, ending.memberId),
              eq(groupFollows.status, "active"),
            ),
          )
          .returning({ id: groupFollows.id }),
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
