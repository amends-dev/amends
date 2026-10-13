/**
 * The PostgreSQL driver for `GroupStore.GroupStore`, over the `groups` table: team groups fill
 * `visibility` and `name`, direct groups `member_ids` and `direct_key`, derived from the ordered
 * member set, and the `groups_kind` check rejects rows that mix them. `GroupStore.make` checks
 * every input before the driver sees it, so the driver keeps only what storage keeps: the primary
 * key refuses a reused ID and `direct_groups_by_members` a second direct group for one member set,
 * each rejected; renaming is rejected unless it finds a team group, and
 * `latest_activity_at` only moves forward, a missing group rejected. A direct row whose key
 * disagrees with its members fails the read. Every statement is scoped to the binding's workspace
 * and runs under its `guard`, which lets a read join the caller's transaction and requires one for
 * a write.
 */

import { Group, GroupStore } from "@amends-dev/core/group"
import { StoreError } from "@amends-dev/core/journal"
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./id-list.ts"
import { groups } from "./schema.ts"

const validateRecord = Schema.decodeEffect(Schema.toType(Group.Group))
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Union([
      Schema.Struct({ ...Group.Team.fields, createdAt: Schema.DateTimeUtcFromDate }),
      Schema.Struct({ ...Group.Direct.fields, createdAt: Schema.DateTimeUtcFromDate })
    ])
  )
)
/** Column decoding drops record-level checks, so each record is validated again. */
const decode = (rows: ReadonlyArray<unknown>) =>
  decodeRows(rows).pipe(Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))))

type Row = typeof groups.$inferSelect
const decodeLatest = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Group.Latest.fields, occurredAt: Schema.DateTimeUtcFromDate }))
)
/** Each kind reads only its own columns; the schema constraint rejects rows mixing them. */
const toRecord = ({ memberIds, directKey, visibility, name, latestActivityAt: _latest, ...common }: Row) =>
  common.kind === "Direct"
    ? directKey === (memberIds === null ? null : Group.directKey(memberIds))
      ? { ...common, memberIds }
      : undefined
    : { ...common, visibility, name }
const toRow = (record: Group.Group): typeof groups.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  kind: record.kind,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
  ...(record.kind === "Team"
    ? { visibility: record.visibility, name: record.name }
    : { memberIds: [...record.memberIds], directKey: Group.directKey(record.memberIds) })
})

/**
 * Builds the group store for the binding's workspace: this module's driver inside
 * `GroupStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const driver: GroupStore.GroupStore["Service"] = {
    get: Effect.fn("Groups.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, id)))
        ).pipe(
          Effect.flatMap((rows) => decode(rows.map(toRecord))),
          Effect.map(Array.head)
        )
      },
      Effect.mapError(StoreError.failed("GroupStore", "get"))
    ),
    getMany: Effect.fn("Groups.getMany")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), inIds(groups.id, ids)))
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toRecord))))
      },
      Effect.mapError(StoreError.failed("GroupStore", "getMany"))
    ),
    pagePublic: Effect.fn("Groups.pagePublic")(
      function* (options) {
        const ordered = sql`${groups.id} COLLATE "C"`
        const found = yield* guard(
          db
            .select()
            .from(groups)
            .where(
              and(
                eq(groups.workspaceId, workspaceId),
                eq(groups.visibility, "Public"),
                options.after === undefined ? undefined : sql`${ordered} > ${options.after}`
              )
            )
            .orderBy(ordered)
            .limit(options.limit)
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toRecord))))
        return found.flatMap((group) => (group.kind === "Team" ? [group] : []))
      },
      Effect.mapError(StoreError.failed("GroupStore", "pagePublic"))
    ),
    findDirect: Effect.fn("Groups.findDirect")(
      function* (memberIds) {
        const rows = yield* guard(
          db
            .select()
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), eq(groups.directKey, Group.directKey(memberIds))))
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toRecord))))
        return Option.flatMap(Array.head(rows), (record) =>
          record.kind === "Direct" ? Option.some(record) : Option.none()
        )
      },
      Effect.mapError(StoreError.failed("GroupStore", "findDirect"))
    ),
    getLatest: Effect.fn("Groups.getLatest")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select({ groupId: groups.id, occurredAt: groups.latestActivityAt })
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), inIds(groups.id, ids), isNotNull(groups.latestActivityAt)))
        ).pipe(Effect.flatMap(decodeLatest))
      },
      Effect.mapError(StoreError.failed("GroupStore", "getLatest"))
    ),
    rename: Effect.fn("Groups.rename")(function* (renamed) {
      const updated = yield* guard(
        db
          .update(groups)
          .set({ name: renamed.name })
          .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, renamed.groupId), eq(groups.kind, "Team")))
          .returning({ id: groups.id }),
        true
      ).pipe(Effect.mapError(storeError("GroupStore", "rename")))
      if (updated.length === 0) return yield* StoreError.rejected("GroupStore", "rename", "Expected a team group")
    }),
    recordLatest: Effect.fn("Groups.recordLatest")(function* (latest) {
      const at = DateTime.toDate(latest.occurredAt)
      const advanced = yield* guard(
        db
          .update(groups)
          .set({ latestActivityAt: at })
          .where(
            and(
              eq(groups.workspaceId, workspaceId),
              eq(groups.id, latest.groupId),
              or(isNull(groups.latestActivityAt), lt(groups.latestActivityAt, at))
            )
          )
          .returning({ id: groups.id }),
        true
      ).pipe(Effect.mapError(storeError("GroupStore", "recordLatest")))
      if (advanced.length > 0) return
      // Nothing advanced: an earlier time changes nothing, but the group must exist.
      const found = yield* guard(
        db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, latest.groupId))),
        true
      ).pipe(Effect.mapError(storeError("GroupStore", "recordLatest")))
      if (found.length === 0) return yield* StoreError.rejected("GroupStore", "recordLatest", "Group is missing")
    }),
    insert: Effect.fn("Groups.insert")(function* (record) {
      yield* guard(db.insert(groups).values(toRow(record)), true).pipe(
        Effect.mapError(storeError("GroupStore", "insert"))
      )
    })
  }
  return GroupStore.make(workspaceId, driver)
})

/**
 * Provides `GroupStore.GroupStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(GroupStore.GroupStore, make)
