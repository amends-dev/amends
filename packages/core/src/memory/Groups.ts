import { Group, GroupStore } from "../group/index.ts";
import { Array, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary } from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Group.Record));
const latestRows = Rows.make(Schema.fromJsonString(Group.Latest));
/** Only a direct group has a member-set key. */
const keyOf = (record: Group.Record) =>
  record.kind === "Direct" ? Group.directKey(record.memberIds) : undefined;

/** Group records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Groups.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: GroupStore.GroupStore["Service"] = {
    get: Effect.fn("Groups.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groups"), id);
      },
      Effect.mapError(storeFailure(GroupStore, "get")),
    ),
    getMany: Effect.fn("Groups.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("groups"), ids);
      },
      Effect.mapError(storeFailure(GroupStore, "getMany")),
    ),
    pagePublic: Effect.fn("Groups.pagePublic")(
      function* (options) {
        const after = options.after;
        return (yield* rows.all((yield* read).records.of("groups")))
          .flatMap((group) =>
            group.kind === "Team" &&
            group.visibility === "Public" &&
            (after === undefined || compareBinary(group.id, after) > 0)
              ? [group]
              : [],
          )
          .toSorted((left, right) => compareBinary(left.id, right.id))
          .slice(0, options.limit);
      },
      Effect.mapError(storeFailure(GroupStore, "pagePublic")),
    ),
    findDirect: Effect.fn("Groups.findDirect")(
      function* (memberIds) {
        const key = Group.directKey(memberIds);
        const groups = yield* rows.all((yield* read).records.of("groups"));
        return Array.findFirst(groups, (group) =>
          group.kind === "Direct" && keyOf(group) === key ? Option.some(group) : Option.none(),
        );
      },
      Effect.mapError(storeFailure(GroupStore, "findDirect")),
    ),
    getLatest: Effect.fn("Groups.getLatest")(
      function* (ids) {
        return yield* latestRows.getMany((yield* read).records.of("groupLatest"), ids);
      },
      Effect.mapError(storeFailure(GroupStore, "getLatest")),
    ),
    rename: Effect.fn("Groups.rename")(function* (renamed) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupStore, "rename")));
      const found = yield* rows
        .get(space.records.of("groups"), renamed.groupId)
        .pipe(Effect.mapError(storeFailure(GroupStore, "rename")));
      if (Option.isNone(found) || found.value.kind !== "Team")
        return yield* new GroupStore.Conflict({
          operation: "rename",
          message: "Expected a team group",
        });
      const row = yield* rows
        .encode({ ...found.value, name: renamed.name })
        .pipe(Effect.mapError(storeFailure(GroupStore, "rename")));
      space.records.of("groups").set(renamed.groupId, row);
    }),
    recordLatest: Effect.fn("Groups.recordLatest")(function* (latest) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupStore, "recordLatest")));
      if (!space.records.of("groups").has(latest.groupId))
        return yield* new GroupStore.Conflict({
          operation: "recordLatest",
          message: "Group is missing",
        });
      const current = yield* latestRows
        .get(space.records.of("groupLatest"), latest.groupId)
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
      space.records.of("groupLatest").set(latest.groupId, row);
    }),
    insert: Effect.fn("Groups.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(GroupStore, "insert")));
      if (space.records.of("groups").has(record.id))
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Group ID already exists",
        });
      const key = keyOf(record);
      if (key !== undefined) {
        const groups = yield* rows
          .all(space.records.of("groups"))
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
      space.records.of("groups").set(record.id, row);
    }),
  };
  return GroupStore.make(workspaceId, driver);
});

/** Provide group storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupStore.GroupStore, make());
