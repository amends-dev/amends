/**
 * The PostgreSQL driver for `AssignmentStore.AssignmentStore`, over the `assignments` table: a
 * role assignment fills `role_id`, a direct grant `permission`, and the scope takes the columns
 * `ScopeColumns` gives it. `AssignmentStore.make` checks every input before the driver sees it, so
 * the driver keeps only what storage keeps: the primary key rejects a reused ID, revoked ones
 * included, and revoking is a conditional update rejected unless
 * it finds the assignment active. Revoked rows keep their source. Every statement is scoped to the
 * binding's workspace and runs under its `guard`, which lets a read join the caller's transaction
 * and requires one for a write.
 */

import { Assignment, AssignmentStore } from "@amends-dev/core/authorization"
import type { WorkspaceId } from "@amends-dev/core/workspace"
import { StoreError } from "@amends-dev/log"
import { and, eq, type SQL } from "drizzle-orm"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { assignments } from "./schema.ts"
import * as ScopeColumns from "./scopeColumns.ts"

/** A row is one of two source cases, so it is shaped in code before decoding checks it. */
const toEncodedRecord = (row: typeof assignments.$inferSelect) => {
  const scope = ScopeColumns.decode(row.workspaceId as WorkspaceId.WorkspaceId, row)
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    status: row.status,
    source:
      row.sourceKind === "Role"
        ? { _tag: "Role", roleId: row.roleId, scope }
        : { _tag: "Direct", grant: { permission: row.permission, scope } }
  }
}
const decode = Schema.decodeUnknownEffect(Schema.Array(Assignment.Assignment))

/**
 * Builds the assignment store for the binding's workspace: this module's driver inside
 * `AssignmentStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(assignments.workspaceId, workspaceId)
  const select = (operation: string, where: SQL | undefined) =>
    guard(db.select().from(assignments).where(where).orderBy(assignments.id)).pipe(
      Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))),
      Effect.mapError(StoreError.failed("AssignmentStore", operation))
    )
  const driver: AssignmentStore.AssignmentStore["Service"] = {
    get: (id) => Effect.map(select("get", and(inWorkspace, eq(assignments.id, id))), Array.head),
    listActiveByMember: (memberId) =>
      select(
        "listActiveByMember",
        and(inWorkspace, eq(assignments.memberId, memberId), eq(assignments.status, "active"))
      ),
    listActiveByRole: (roleId) =>
      select(
        "listActiveByRole",
        and(
          inWorkspace,
          eq(assignments.sourceKind, "Role"),
          eq(assignments.roleId, roleId),
          eq(assignments.status, "active")
        )
      ),
    insert: Effect.fn("Assignments.insert")(function* (record) {
      const source = record.source
      yield* guard(
        db.insert(assignments).values({
          workspaceId,
          id: record.id,
          memberId: record.memberId,
          status: record.status,
          sourceKind: source._tag,
          roleId: Assignment.Source.isAnyOf(["Role"])(source) ? source.roleId : null,
          permission: Assignment.Source.isAnyOf(["Direct"])(source) ? source.grant.permission : null,
          ...ScopeColumns.encode(Assignment.Source.isAnyOf(["Role"])(source) ? source.scope : source.grant.scope)
        }),
        true
      ).pipe(Effect.mapError(storeError("AssignmentStore", "insert")))
    }),
    markRevoked: Effect.fn("Assignments.markRevoked")(function* (id) {
      const rows = yield* guard(
        db
          .update(assignments)
          .set({ status: "revoked" })
          .where(and(inWorkspace, eq(assignments.id, id), eq(assignments.status, "active")))
          .returning({ id: assignments.id }),
        true
      ).pipe(Effect.mapError(storeError("AssignmentStore", "markRevoked")))
      if (rows.length === 0)
        return yield* StoreError.rejected("AssignmentStore", "markRevoked", "Expected an active assignment")
    })
  }
  return AssignmentStore.make(workspaceId, driver)
})

/**
 * Provides `AssignmentStore.AssignmentStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(AssignmentStore.AssignmentStore, make)
