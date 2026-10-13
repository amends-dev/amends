/**
 * The PostgreSQL driver for `GroupMembershipStore.GroupMembershipStore`, over the
 * `group_memberships` table: each admission of a member to a group, active or removed.
 * `GroupMembershipStore.make` checks every input before the driver sees it, so the driver keeps
 * only what storage keeps: the primary key refuses a reused ID and `active_group_membership` a
 * second active admission for one group and member, each rejected, and removal is
 * a conditional update rejected unless it finds the addressed admission active; readmission
 * takes a fresh ID. `summarize` counts several groups' admissions in one grouped query. Every
 * statement is scoped to the binding's workspace and runs under its `guard`, which lets a read
 * join the caller's transaction and requires one for a write.
 */

import { Group, GroupMembership, GroupMembershipStore } from "@amends-dev/core/group"
import { StoreError } from "@amends-dev/core/journal"
import { and, eq, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./id-list.ts"
import { groupMemberships } from "./schema.ts"

const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...GroupMembership.GroupMembership.fields,
      admittedAt: Schema.DateTimeUtcFromDate
    })
  )
)

const decodeSummaries = Schema.decodeUnknownEffect(Schema.Array(Group.Summary))

/**
 * Builds the group admission store for the binding's workspace: this module's driver inside
 * `GroupMembershipStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(groupMemberships.workspaceId, workspaceId)
  const driver: GroupMembershipStore.GroupMembershipStore["Service"] = {
    get: Effect.fn("GroupMemberships.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, eq(groupMemberships.id, id)))
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "get"))
    ),
    getMany: Effect.fn("GroupMemberships.getMany")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, inIds(groupMemberships.id, ids)))
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "getMany"))
    ),
    findActive: Effect.fn("GroupMemberships.findActive")(
      function* (groupId, memberId) {
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.groupId, groupId),
                eq(groupMemberships.memberId, memberId),
                eq(groupMemberships.status, "active")
              )
            )
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "findActive"))
    ),
    findActiveMany: Effect.fn("GroupMemberships.findActiveMany")(
      function* (groupId, memberIds) {
        if (memberIds.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.groupId, groupId),
                eq(groupMemberships.status, "active"),
                inIds(groupMemberships.memberId, memberIds)
              )
            )
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "findActiveMany"))
    ),
    summarize: Effect.fn("GroupMemberships.summarize")(
      function* (groupIds, memberId) {
        if (groupIds.length === 0) return []
        return yield* guard(
          db
            .select({
              groupId: groupMemberships.groupId,
              members: sql<number>`count(*)::int`,
              joined: sql<boolean>`bool_or(${groupMemberships.memberId} = ${memberId})`
            })
            .from(groupMemberships)
            .where(and(inWorkspace, eq(groupMemberships.status, "active"), inIds(groupMemberships.groupId, groupIds)))
            .groupBy(groupMemberships.groupId)
        ).pipe(Effect.flatMap(decodeSummaries))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "summarize"))
    ),
    listByGroup: Effect.fn("GroupMemberships.listByGroup")(
      function* (groupId) {
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, eq(groupMemberships.groupId, groupId)))
            .orderBy(sql`${groupMemberships.id} COLLATE "C"`)
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "listByGroup"))
    ),
    pageActiveByGroup: Effect.fn("GroupMemberships.pageActiveByGroup")(
      function* (groupId, options) {
        const orderedId = sql`${groupMemberships.id} COLLATE "C"`
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.groupId, groupId),
                eq(groupMemberships.status, "active"),
                options.after === undefined ? undefined : sql`${orderedId} > ${options.after}`
              )
            )
            .orderBy(orderedId)
            .limit(options.limit)
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "pageActiveByGroup"))
    ),
    pageActiveByMember: Effect.fn("GroupMemberships.pageActiveByMember")(
      function* (memberId, options) {
        const orderedGroup = sql`${groupMemberships.groupId} COLLATE "C"`
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(
              and(
                inWorkspace,
                eq(groupMemberships.memberId, memberId),
                eq(groupMemberships.status, "active"),
                options.afterGroupId === undefined ? undefined : sql`${orderedGroup} > ${options.afterGroupId}`
              )
            )
            .orderBy(orderedGroup)
            .limit(options.limit)
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "pageActiveByMember"))
    ),
    listActiveByMember: Effect.fn("GroupMemberships.listActiveByMember")(
      function* (memberId) {
        return yield* guard(
          db
            .select()
            .from(groupMemberships)
            .where(and(inWorkspace, eq(groupMemberships.memberId, memberId), eq(groupMemberships.status, "active")))
            .orderBy(sql`${groupMemberships.id} COLLATE "C"`)
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "listActiveByMember"))
    ),
    markRemoved: Effect.fn("GroupMemberships.markRemoved")(function* (removal) {
      const rows = yield* guard(
        db
          .update(groupMemberships)
          .set({ status: "removed" })
          .where(
            and(
              inWorkspace,
              eq(groupMemberships.id, removal.membershipId),
              eq(groupMemberships.groupId, removal.groupId),
              eq(groupMemberships.memberId, removal.memberId),
              eq(groupMemberships.status, "active")
            )
          )
          .returning({ id: groupMemberships.id }),
        true
      ).pipe(Effect.mapError(storeError("GroupMembershipStore", "markRemoved")))
      if (rows.length === 0)
        return yield* StoreError.rejected(
          "GroupMembershipStore",
          "markRemoved",
          "Expected the specified active group admission"
        )
    }),
    insert: Effect.fn("GroupMemberships.insert")(function* (record) {
      const { admittedAt, ...fields } = record
      yield* guard(
        db.insert(groupMemberships).values({ ...fields, admittedAt: DateTime.toDate(admittedAt) }),
        true
      ).pipe(Effect.mapError(storeError("GroupMembershipStore", "insert")))
    })
  }
  return GroupMembershipStore.make(workspaceId, driver)
})

/**
 * Provides `GroupMembershipStore.GroupMembershipStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(GroupMembershipStore.GroupMembershipStore, make)
