import { ReadState, ReadStateStore } from "@amends-dev/core/read-state";
import { and, eq, sql } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
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
  const driver: ReadStateStore.Interface = {
    getThreadPositions: Effect.fn("ReadStates.getThreadPositions")(
      function* (memberId, threadIds) {
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
    advanceThread: Effect.fn("ReadStates.advanceThread")(function* (position) {
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
      function* (memberId, groupIds) {
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
    advanceGroup: Effect.fn("ReadStates.advanceGroup")(function* (groupRead) {
      const { readAt, ...fields } = groupRead;
      yield* guard(
        db
          .insert(groupReadTimes)
          .values({ ...fields, readAt: DateTime.toDate(readAt) })
          .onConflictDoUpdate({
            target: [groupReadTimes.workspaceId, groupReadTimes.memberId, groupReadTimes.groupId],
            set: {
              readAt: sql`greatest(${groupReadTimes.readAt}, excluded.read_at)`,
            },
          }),
      ).pipe(Effect.mapError(storeError(ReadStateStore, "advanceGroup")));
    }),
  };
  return ReadStateStore.make(workspaceId, driver);
});

/** Provide read-state storage over the caller's binding. @category layers */
export const layer = Layer.effect(ReadStateStore.Service, make());

export * as ReadStates from "./read-states.ts";
