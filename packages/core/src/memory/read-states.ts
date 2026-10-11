import { ReadState, ReadStateStore } from "../read-state/index.ts";
import { Group } from "../group/index.ts";
import { Thread } from "../thread/index.ts";
import { Member } from "../workspace/index.ts";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { keyOf } from "./rows.ts";

/** Keep the later of the stored and requested value. */
const advance = (values: Map<string, number>, key: string, value: number) =>
  values.set(key, Math.max(value, values.get(key) ?? value));

/**
 * Private read state as plain values. Writes keep the later value; they join the caller's
 * transaction when there is one and otherwise apply at once.
 *
 * @category constructors
 */
export const make = Effect.fn("ReadStates.make")(function* () {
  const { workspaceId, read, join } = yield* Binding.Service;
  return ReadStateStore.Service.of({
    getThreadPositions: Effect.fn("ReadStates.getThreadPositions")(
      function* (memberInput, threadInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const threadIds = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(threadInput);
        const positions = (yield* read).threadPositions;
        return [...new Set(threadIds)].flatMap((threadId) => {
          const readThrough = positions.get(keyOf(memberId, threadId));
          return readThrough === undefined
            ? []
            : [{ workspaceId, memberId, threadId, readThrough }];
        });
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
      const space = yield* join.pipe(
        Effect.mapError(storeFailure(ReadStateStore, "advanceThread")),
      );
      advance(
        space.threadPositions,
        keyOf(position.memberId, position.threadId),
        position.readThrough,
      );
    }),
    getGroupReads: Effect.fn("ReadStates.getGroupReads")(
      function* (memberInput, groupInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const groupIds = yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput);
        const times = (yield* read).groupTimes;
        return [...new Set(groupIds)].flatMap((groupId) => {
          const at = times.get(keyOf(memberId, groupId));
          return at === undefined
            ? []
            : [{ workspaceId, memberId, groupId, readAt: DateTime.makeUnsafe(at) }];
        });
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
      const space = yield* join.pipe(Effect.mapError(storeFailure(ReadStateStore, "advanceGroup")));
      advance(
        space.groupTimes,
        keyOf(groupRead.memberId, groupRead.groupId),
        DateTime.toEpochMillis(groupRead.readAt),
      );
    }),
  });
});

/** Provide read-state storage over the caller's binding. @category layers */
export const layer = Layer.effect(ReadStateStore.Service, make());

export * as ReadStates from "./read-states.ts";
