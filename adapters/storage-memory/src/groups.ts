import { Group, GroupStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Group.Record));
const rows = Rows.make(Schema.fromJsonString(Group.Record));
const latestRows = Rows.make(Schema.fromJsonString(Group.Latest));
/** Only a direct group has a member-set key. */
const keyOf = (record: Group.Record) =>
  record.kind === "Direct" ? Group.directKey(record.memberIds) : undefined;

/** Group records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Groups.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  return GroupStore.Service.of({
    workspaceId,
    get: Effect.fn("Groups.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* rows.get((yield* read).records.groups, id);
      },
      Effect.mapError(storeFailure(GroupStore, "get")),
    ),
    getMany: Effect.fn("Groups.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Group.Id))(input);
        return yield* rows.getMany((yield* read).records.groups, ids);
      },
      Effect.mapError(storeFailure(GroupStore, "getMany")),
    ),
    findDirect: Effect.fn("Groups.findDirect")(
      function* (input) {
        const memberIds = yield* Schema.decodeEffect(Group.DirectMembers)(
          Group.directMembers(input),
        );
        const key = Group.directKey(memberIds);
        const groups = yield* rows.all((yield* read).records.groups);
        return Array.findFirst(groups, (group) =>
          group.kind === "Direct" && keyOf(group) === key ? Option.some(group) : Option.none(),
        );
      },
      Effect.mapError(storeFailure(GroupStore, "findDirect")),
    ),
    getLatest: Effect.fn("Groups.getLatest")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Group.Id))(input);
        return yield* latestRows.getMany((yield* read).records.groupLatest, ids);
      },
      Effect.mapError(storeFailure(GroupStore, "getLatest")),
    ),
    rename: Effect.fn("Groups.rename")(function* (input) {
      yield* Store.Transaction;
      const renamed = yield* Schema.decodeEffect(Schema.toType(Group.Renamed))(input).pipe(
        Effect.mapError(storeConflict(GroupStore, "rename")),
      );
      if (renamed.workspaceId !== workspaceId)
        return yield* new GroupStore.Conflict({
          operation: "rename",
          message: "Expected a group in this workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupStore, "rename")));
      const found = yield* rows
        .get(space.records.groups, renamed.groupId)
        .pipe(Effect.mapError(storeFailure(GroupStore, "rename")));
      if (Option.isNone(found) || found.value.kind !== "Team")
        return yield* new GroupStore.Conflict({
          operation: "rename",
          message: "Expected a team group",
        });
      const row = yield* rows
        .encode({ ...found.value, name: renamed.name })
        .pipe(Effect.mapError(storeFailure(GroupStore, "rename")));
      space.records.groups.set(renamed.groupId, row);
    }),
    recordLatest: Effect.fn("Groups.recordLatest")(function* (input) {
      yield* Store.Transaction;
      const latest = yield* Schema.decodeEffect(Schema.toType(Group.Latest))(input).pipe(
        Effect.mapError(storeConflict(GroupStore, "recordLatest")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupStore, "recordLatest")));
      if (!space.records.groups.has(latest.groupId))
        return yield* new GroupStore.Conflict({
          operation: "recordLatest",
          message: "Group is missing",
        });
      const current = yield* latestRows
        .get(space.records.groupLatest, latest.groupId)
        .pipe(Effect.mapError(storeFailure(GroupStore, "recordLatest")));
      // Only a later time advances; an earlier one changes nothing.
      if (
        Option.isSome(current) &&
        !DateTime.isGreaterThan(latest.occurredAt, current.value.occurredAt)
      )
        return;
      const row = yield* latestRows
        .encode(latest)
        .pipe(Effect.mapError(storeFailure(GroupStore, "recordLatest")));
      space.records.groupLatest.set(latest.groupId, row);
    }),
    insert: Effect.fn("Groups.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(GroupStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Expected a group in this workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupStore, "insert")));
      if (space.records.groups.has(record.id))
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Group ID already exists",
        });
      const key = keyOf(record);
      if (key !== undefined) {
        const groups = yield* rows
          .all(space.records.groups)
          .pipe(Effect.mapError(storeFailure(GroupStore, "insert")));
        if (groups.some((group) => keyOf(group) === key))
          return yield* new GroupStore.Conflict({
            operation: "insert",
            message: "A direct group already exists for these members",
          });
      }
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(GroupStore, "insert")));
      space.records.groups.set(record.id, row);
    }),
  });
});

/** Provide group storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupStore.Service, make());

export * as Groups from "./groups.ts";
