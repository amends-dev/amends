import { ReadState, ReadStateStore } from "@amends/core/read-state";
import { Group } from "@amends/core/group";
import { Thread } from "@amends/core/thread";
import { Member } from "@amends/core/workspace";
import { and, eq, sql } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { inIds } from "./id-list.ts";
import { groupReadTimes, threadReadPositions } from "./schema.ts";

const decodePositions = Schema.decodeUnknownEffect(Schema.Array(ReadState.ThreadPosition));
const decodeGroups = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ReadState.GroupRead.fields, readAt: Schema.DateTimeUtcFromDate }),
  ),
);

/**
 * Private read state in plain columns. Writes are single upserts that keep the later value; they
 * join the caller's transaction when there is one and otherwise commit on their own, without the
 * workspace lock that orders journal commits.
 *
 * @category constructors
 */
export const make = Effect.fn("ReadStates.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  return ReadStateStore.Service.of({
    getThreadPositions: Effect.fn("ReadStates.getThreadPositions")(
      function* (memberInput, threadInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const threadIds = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(threadInput);
        if (threadIds.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(threadReadPositions)
            .where(
              and(
                eq(threadReadPositions.workspaceId, workspaceId),
                eq(threadReadPositions.memberId, memberId),
                inIds(threadReadPositions.threadId, threadIds),
              ),
            ),
        ).pipe(Effect.flatMap(decodePositions));
      },
      Effect.mapError(storeFailure(ReadStateStore, "getThreadPositions")),
    ),
    advanceThread: Effect.fn("ReadStates.advanceThread")(function* (input) {
      const position = yield* Schema.decodeEffect(ReadState.ThreadPosition)(input).pipe(
        Effect.mapError(storeConflict(ReadStateStore, "advanceThread")),
      );
      if (position.workspaceId !== workspaceId)
        return yield* new ReadStateStore.Conflict({
          operation: "advanceThread",
          message: "Read position belongs to another workspace",
        });
      yield* guard(
        db
          .insert(threadReadPositions)
          .values(position)
          .onConflictDoUpdate({
            target: [
              threadReadPositions.workspaceId,
              threadReadPositions.memberId,
              threadReadPositions.threadId,
            ],
            set: {
              readThrough: sql`greatest(${threadReadPositions.readThrough}, excluded.read_through)`,
            },
          }),
      ).pipe(Effect.mapError(storeError(ReadStateStore, "advanceThread")));
    }),
    getGroupReads: Effect.fn("ReadStates.getGroupReads")(
      function* (memberInput, groupInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const groupIds = yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput);
        if (groupIds.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(groupReadTimes)
            .where(
              and(
                eq(groupReadTimes.workspaceId, workspaceId),
                eq(groupReadTimes.memberId, memberId),
                inIds(groupReadTimes.groupId, groupIds),
              ),
            ),
        ).pipe(Effect.flatMap(decodeGroups));
      },
      Effect.mapError(storeFailure(ReadStateStore, "getGroupReads")),
    ),
    advanceGroup: Effect.fn("ReadStates.advanceGroup")(function* (input) {
      const groupRead = yield* Schema.decodeEffect(Schema.toType(ReadState.GroupRead))(input).pipe(
        Effect.mapError(storeConflict(ReadStateStore, "advanceGroup")),
      );
      if (groupRead.workspaceId !== workspaceId)
        return yield* new ReadStateStore.Conflict({
          operation: "advanceGroup",
          message: "Group read time belongs to another workspace",
        });
      yield* guard(
        db
          .insert(groupReadTimes)
          .values({ ...groupRead, readAt: DateTime.toDate(groupRead.readAt) })
          .onConflictDoUpdate({
            target: [groupReadTimes.workspaceId, groupReadTimes.memberId, groupReadTimes.groupId],
            set: {
              readAt: sql`greatest(${groupReadTimes.readAt}, excluded.read_at)`,
            },
          }),
      ).pipe(Effect.mapError(storeError(ReadStateStore, "advanceGroup")));
    }),
  });
});

/** Provide read-state storage over the caller's binding. @category layers */
export const layer = Layer.effect(ReadStateStore.Service, make());

export * as ReadStates from "./read-states.ts";
