import { ReadState, ReadStateStore } from "@amends/core/attention";
import { Group } from "@amends/core/group";
import { Thread } from "@amends/core/thread";
import { Member } from "@amends/core/workspace";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { inIds } from "./id-list.ts";

const decodePositions = Schema.decodeUnknownEffect(Schema.Array(ReadState.ThreadPosition));
const decodeGroups = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ReadState.GroupCaughtUp.fields, caughtUpAt: Schema.DateTimeUtcFromMillis }),
  ),
);

/**
 * Private read state in plain columns. Writes are single upserts that keep the later value; they
 * join the caller's transaction when there is one and otherwise commit on their own.
 *
 * @category constructors
 */
export const make = Effect.fn("ReadStates.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  return ReadStateStore.Service.of({
    workspaceId,
    getThreadPositions: Effect.fn("ReadStates.getThreadPositions")(
      function* (memberInput, threadInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const threadIds = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(threadInput);
        if (threadIds.length === 0) return [];
        return yield* guard(
          sql`SELECT workspace_id AS workspaceId, member_id AS memberId, thread_id AS threadId, read_through AS readThrough FROM thread_read_positions WHERE workspace_id = ${workspaceId} AND member_id = ${memberId} AND thread_id ${inIds(sql, threadIds)}`,
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
        sql`INSERT INTO thread_read_positions (workspace_id, member_id, thread_id, read_through) VALUES (${workspaceId}, ${position.memberId}, ${position.threadId}, ${position.readThrough}) ON CONFLICT(workspace_id, member_id, thread_id) DO UPDATE SET read_through = max(read_through, excluded.read_through)`,
      ).pipe(Effect.mapError(storeError(ReadStateStore, "advanceThread")));
    }),
    getGroupsCaughtUp: Effect.fn("ReadStates.getGroupsCaughtUp")(
      function* (memberInput, groupInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const groupIds = yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput);
        if (groupIds.length === 0) return [];
        return yield* guard(
          sql`SELECT workspace_id AS workspaceId, member_id AS memberId, group_id AS groupId, caught_up_at AS caughtUpAt FROM group_read_times WHERE workspace_id = ${workspaceId} AND member_id = ${memberId} AND group_id ${inIds(sql, groupIds)}`,
        ).pipe(Effect.flatMap(decodeGroups));
      },
      Effect.mapError(storeFailure(ReadStateStore, "getGroupsCaughtUp")),
    ),
    advanceGroup: Effect.fn("ReadStates.advanceGroup")(function* (input) {
      const caughtUp = yield* Schema.decodeEffect(Schema.toType(ReadState.GroupCaughtUp))(
        input,
      ).pipe(Effect.mapError(storeConflict(ReadStateStore, "advanceGroup")));
      if (caughtUp.workspaceId !== workspaceId)
        return yield* new ReadStateStore.Conflict({
          operation: "advanceGroup",
          message: "Caught-up time belongs to another workspace",
        });
      yield* guard(
        sql`INSERT INTO group_read_times (workspace_id, member_id, group_id, caught_up_at) VALUES (${workspaceId}, ${caughtUp.memberId}, ${caughtUp.groupId}, ${DateTime.toEpochMillis(caughtUp.caughtUpAt)}) ON CONFLICT(workspace_id, member_id, group_id) DO UPDATE SET caught_up_at = max(caught_up_at, excluded.caught_up_at)`,
      ).pipe(Effect.mapError(storeError(ReadStateStore, "advanceGroup")));
    }),
  });
});

/** Provide read-state storage over the caller's binding. @category layers */
export const layer = Layer.effect(ReadStateStore.Service, make());

export * as ReadStates from "./read-states.ts";
