/**
 * The memory implementation of `ReadStateStore` from `../read-state/ReadStateStore.ts`, over the
 * workspace's `Binding`: each member's private read state, the sequence read through in each
 * thread and when they last read each group, kept beside the projected records so rebuilding
 * projections keeps it. A write keeps the later of the stored and given value; it joins the
 * caller's transaction when there is one and otherwise applies at once, and a commit keeps the
 * later of its own and the committed values. `ReadStateStore.make` checks every input before this
 * driver sees it.
 *
 * @since 0.1.0
 */
import { ReadStateStore } from "../read-state/index.ts";
import { DateTime, Effect, Layer } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import { keyOf } from "./Rows.ts";

/** Keep the later of the stored and requested value. */
const advance = (values: Map<string, number>, key: string, value: number) =>
  values.set(key, Math.max(value, values.get(key) ?? value));

/**
 * Private read state as plain values. Writes keep the later value; they join the caller's
 * transaction when there is one and otherwise apply at once.
 *
 * @category constructors
 * @since 0.1.0
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

/**
 * Provide read-state storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReadStateStore.ReadStateStore, make());
