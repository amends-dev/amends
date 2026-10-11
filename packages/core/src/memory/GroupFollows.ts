/**
 * The memory implementation of `GroupFollowStore` from `../group/GroupFollowStore.ts`, over the
 * workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts, and
 * so does a second active follow for one group admission; ending a follow conflicts unless it is
 * stored, active, and of the group and member named. An ended follow keeps its row.
 * `GroupFollowStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { GroupFollow, GroupFollowStore } from "../group/index.ts";
import { Array, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary } from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(GroupFollow.Record));

/**
 * Group follows, active and ended; one active follow per group admission.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("GroupFollows.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const active = Effect.flatMap(read, (space) => rows.all(space.records.of("groupFollows"))).pipe(
    Effect.map((records) => records.filter((record) => record.status === "active")),
  );
  const driver: GroupFollowStore.GroupFollowStore["Service"] = {
    get: Effect.fn("GroupFollows.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groupFollows"), id);
      },
      Effect.mapError(storeFailure(GroupFollowStore, "get")),
    ),
    findActive: Effect.fn("GroupFollows.findActive")(
      function* (id) {
        return Array.findFirst(yield* active, (record) => record.groupMembershipId === id);
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupFollows.findActiveMany")(
      function* (input) {
        const ids = new Set(input);
        if (ids.size === 0) return [];
        return (yield* active).filter((record) => ids.has(record.groupMembershipId));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActiveMany")),
    ),
    listActiveByGroup: Effect.fn("GroupFollows.listActiveByGroup")(
      function* (groupId) {
        return (yield* active)
          .filter((record) => record.groupId === groupId)
          .toSorted((left, right) => compareBinary(left.id, right.id));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "listActiveByGroup")),
    ),
    insert: Effect.fn("GroupFollows.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupFollowStore, "insert")));
      const follows = yield* rows
        .all(space.records.of("groupFollows"))
        .pipe(Effect.mapError(storeFailure(GroupFollowStore, "insert")));
      if (
        space.records.of("groupFollows").has(record.id) ||
        follows.some(
          (follow) =>
            follow.groupMembershipId === record.groupMembershipId && follow.status === "active",
        )
      )
        return yield* new GroupFollowStore.Conflict({
          operation: "insert",
          message: "Follow ID reused, or the admission already follows",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(GroupFollowStore, "insert")));
      space.records.of("groupFollows").set(record.id, row);
    }),
    end: Effect.fn("GroupFollows.end")(function* (ending, endedAt) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupFollowStore, "end")));
      const current = yield* rows
        .get(space.records.of("groupFollows"), ending.followId)
        .pipe(Effect.mapError(storeFailure(GroupFollowStore, "end")));
      if (
        Option.isNone(current) ||
        current.value.groupId !== ending.groupId ||
        current.value.memberId !== ending.memberId ||
        current.value.status !== "active"
      )
        return yield* new GroupFollowStore.Conflict({
          operation: "end",
          message: "Follow is missing, mismatched, or already ended",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "ended", endedAt })
        .pipe(Effect.mapError(storeFailure(GroupFollowStore, "end")));
      space.records.of("groupFollows").set(ending.followId, row);
    }),
  };
  return GroupFollowStore.make(workspaceId, driver);
});

/**
 * Provide group follow storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupFollowStore.GroupFollowStore, make());
