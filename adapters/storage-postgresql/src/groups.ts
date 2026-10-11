import { Group, GroupStore } from "@amends-dev/core/group";
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeError, storeFailure } from "./errors.ts";
import { groups } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Group.Record));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Union([
      Schema.Struct({ ...Group.TeamRecord.fields, createdAt: Schema.DateTimeUtcFromDate }),
      Schema.Struct({ ...Group.DirectRecord.fields, createdAt: Schema.DateTimeUtcFromDate }),
    ]),
  ),
);
/** Column decoding drops record-level checks, so each record is validated again. */
const decode = (rows: ReadonlyArray<unknown>) =>
  decodeRows(rows).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
  );

type Row = typeof groups.$inferSelect;
const decodeLatest = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Group.Latest.fields, occurredAt: Schema.DateTimeUtcFromDate })),
);
/** Each kind reads only its own columns; the schema constraint rejects rows mixing them. */
const toRecord = ({
  memberIds,
  directKey,
  visibility,
  name,
  latestActivityAt: _latest,
  ...common
}: Row) =>
  common.kind === "Direct"
    ? directKey === (memberIds === null ? null : Group.directKey(memberIds))
      ? { ...common, memberIds }
      : undefined
    : { ...common, visibility, name };
const toRow = (record: Group.Record): typeof groups.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  kind: record.kind,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
  ...(record.kind === "Team"
    ? { visibility: record.visibility, name: record.name }
    : { memberIds: [...record.memberIds], directKey: Group.directKey(record.memberIds) }),
});

/** Group records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Groups.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const driver: GroupStore.Interface = {
    get: Effect.fn("Groups.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, id))),
        ).pipe(
          Effect.flatMap((rows) => decode(rows.map(toRecord))),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(GroupStore, "get")),
    ),
    getMany: Effect.fn("Groups.getMany")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), inIds(groups.id, ids))),
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toRecord))));
      },
      Effect.mapError(storeFailure(GroupStore, "getMany")),
    ),
    pagePublic: Effect.fn("Groups.pagePublic")(
      function* (options) {
        const ordered = sql`${groups.id} COLLATE "C"`;
        const found = yield* guard(
          db
            .select()
            .from(groups)
            .where(
              and(
                eq(groups.workspaceId, workspaceId),
                eq(groups.visibility, "Public"),
                options.after === undefined ? undefined : sql`${ordered} > ${options.after}`,
              ),
            )
            .orderBy(ordered)
            .limit(options.limit),
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toRecord))));
        return found.flatMap((group) => (group.kind === "Team" ? [group] : []));
      },
      Effect.mapError(storeFailure(GroupStore, "pagePublic")),
    ),
    findDirect: Effect.fn("Groups.findDirect")(
      function* (memberIds) {
        const rows = yield* guard(
          db
            .select()
            .from(groups)
            .where(
              and(
                eq(groups.workspaceId, workspaceId),
                eq(groups.directKey, Group.directKey(memberIds)),
              ),
            ),
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toRecord))));
        return Option.flatMap(Array.head(rows), (record) =>
          record.kind === "Direct" ? Option.some(record) : Option.none(),
        );
      },
      Effect.mapError(storeFailure(GroupStore, "findDirect")),
    ),
    getLatest: Effect.fn("Groups.getLatest")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select({ groupId: groups.id, occurredAt: groups.latestActivityAt })
            .from(groups)
            .where(
              and(
                eq(groups.workspaceId, workspaceId),
                inIds(groups.id, ids),
                isNotNull(groups.latestActivityAt),
              ),
            ),
        ).pipe(Effect.flatMap(decodeLatest));
      },
      Effect.mapError(storeFailure(GroupStore, "getLatest")),
    ),
    rename: Effect.fn("Groups.rename")(function* (renamed) {
      const updated = yield* guard(
        db
          .update(groups)
          .set({ name: renamed.name })
          .where(
            and(
              eq(groups.workspaceId, workspaceId),
              eq(groups.id, renamed.groupId),
              eq(groups.kind, "Team"),
            ),
          )
          .returning({ id: groups.id }),
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "rename")));
      if (updated.length === 0)
        return yield* new GroupStore.Conflict({
          operation: "rename",
          message: "Expected a team group",
        });
    }),
    recordLatest: Effect.fn("Groups.recordLatest")(function* (latest) {
      const at = DateTime.toDate(latest.occurredAt);
      const advanced = yield* guard(
        db
          .update(groups)
          .set({ latestActivityAt: at })
          .where(
            and(
              eq(groups.workspaceId, workspaceId),
              eq(groups.id, latest.groupId),
              or(isNull(groups.latestActivityAt), lt(groups.latestActivityAt, at)),
            ),
          )
          .returning({ id: groups.id }),
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "recordLatest")));
      if (advanced.length > 0) return;
      // Nothing advanced: an earlier time changes nothing, but the group must exist.
      const found = yield* guard(
        db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, latest.groupId))),
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "recordLatest")));
      if (found.length === 0)
        return yield* new GroupStore.Conflict({
          operation: "recordLatest",
          message: "Group is missing",
        });
    }),
    insert: Effect.fn("Groups.insert")(function* (record) {
      yield* guard(db.insert(groups).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(GroupStore, "insert")),
      );
    }),
  };
  return GroupStore.make(workspaceId, driver);
});

/** Provide group storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupStore.Service, make());

export * as Groups from "./groups.ts";
