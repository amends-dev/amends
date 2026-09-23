import { Group, GroupFollow, GroupFollowStore, GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validate = Schema.decodeEffect(Schema.toType(GroupFollow.Record));
const rows = Rows.make(Schema.fromJsonString(GroupFollow.Record));
const admissions = Rows.make(Schema.fromJsonString(GroupMembership.Record));

/** Group follows, active and ended; one active follow per group admission. @category constructors */
export const make = Effect.fn("GroupFollows.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const active = Effect.flatMap(read, (space) => rows.all(space.records.groupFollows)).pipe(
    Effect.map((records) => records.filter((record) => record.status === "active")),
  );
  return GroupFollowStore.Service.of({
    workspaceId,
    get: Effect.fn("GroupFollows.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupFollow.Id)(input);
        return yield* rows.get((yield* read).records.groupFollows, id);
      },
      Effect.mapError(storeFailure(GroupFollowStore, "get")),
    ),
    findActive: Effect.fn("GroupFollows.findActive")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return Array.findFirst(yield* active, (record) => record.groupMembershipId === id);
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupFollows.findActiveMany")(
      function* (input) {
        const ids = new Set(yield* Schema.decodeEffect(Schema.Array(GroupMembership.Id))(input));
        if (ids.size === 0) return [];
        return (yield* active).filter((record) => ids.has(record.groupMembershipId));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActiveMany")),
    ),
    listActiveByGroup: Effect.fn("GroupFollows.listActiveByGroup")(
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return (yield* active)
          .filter((record) => record.groupId === groupId)
          .toSorted((left, right) => compareBinary(left.id, right.id));
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
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupFollowStore, "insert")));
      // The admission must belong to the same group and member; whether it is current is the
      // application's check, so replay can restore follows of later-ended admissions.
      const admission = yield* admissions
        .get(space.records.groupMemberships, record.groupMembershipId)
        .pipe(Effect.mapError(storeFailure(GroupFollowStore, "insert")));
      if (
        Option.isNone(admission) ||
        admission.value.groupId !== record.groupId ||
        admission.value.memberId !== record.memberId
      )
        return yield* new GroupFollowStore.Conflict({
          operation: "insert",
          message: "Admission is missing or belongs to another group or member",
        });
      const follows = yield* rows
        .all(space.records.groupFollows)
        .pipe(Effect.mapError(storeFailure(GroupFollowStore, "insert")));
      if (
        space.records.groupFollows.has(record.id) ||
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
      space.records.groupFollows.set(record.id, row);
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
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupFollowStore, "end")));
      const current = yield* rows
        .get(space.records.groupFollows, ending.followId)
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
      space.records.groupFollows.set(ending.followId, row);
    }),
  });
});

/** Provide group follow storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupFollowStore.Service, make());

export * as GroupFollows from "./group-follows.ts";
