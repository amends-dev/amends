import { ReadStateStore } from "../read-state/index.ts";
import { DateTime, Effect, Layer } from "effect";
import * as Binding from "./binding.ts";
import { storeFailure } from "./errors.ts";
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
  const { workspaceId, read, join } = yield* Binding.Binding;
  const driver: ReadStateStore.ReadStateStore["Service"] = {
    getThreadPositions: Effect.fn("ReadStates.getThreadPositions")(
      function* (memberId, threadIds) {
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
    advanceThread: Effect.fn("ReadStates.advanceThread")(function* (position) {
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
      function* (memberId, groupIds) {
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
    advanceGroup: Effect.fn("ReadStates.advanceGroup")(function* (groupRead) {
      const space = yield* join.pipe(Effect.mapError(storeFailure(ReadStateStore, "advanceGroup")));
      advance(
        space.groupTimes,
        keyOf(groupRead.memberId, groupRead.groupId),
        DateTime.toEpochMillis(groupRead.readAt),
      );
    }),
  };
  return ReadStateStore.make(workspaceId, driver);
});

/** Provide read-state storage over the caller's binding. @category layers */
export const layer = Layer.effect(ReadStateStore.ReadStateStore, make());
