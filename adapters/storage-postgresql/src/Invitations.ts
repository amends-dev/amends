/**
 * The PostgreSQL driver for `InvitationStore.InvitationStore`, over the `invitations` table: each
 * invitation with its required role ID, and the columns of its state, which the
 * `invitations_state_agrees` check keeps consistent. `InvitationStore.make` checks every input
 * before the driver sees it, so the driver keeps only what storage keeps: the primary key rejects
 * a reused ID, and settling is a conditional update rejected unless
 * it finds the invitation pending. `select` is the read `PostgresDirectory` shares to list an
 * identity's pending invitations across workspaces. Every statement is scoped to the binding's
 * workspace and runs under its `guard`, which lets a read join the caller's transaction and
 * requires one for a write.
 *
 * @since 0.1.0
 */

import { StoreError } from "@amends-dev/core/journal"
import { Invitation, InvitationStore, type Workspace } from "@amends-dev/core/workspace"
import { and, asc, eq, type SQL } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./Binding.ts"
import { storeError } from "./internal/errors.ts"
import { invitations } from "./internal/schema.ts"
import type * as PostgresDatabase from "./PostgresDatabase.ts"

type InvitationRow = typeof invitations.$inferSelect

/** A row shaped as the record, with instants as strings for decoding. */
const toEncodedRecord = (row: InvitationRow) => {
  const workspaceId = row.workspaceId as Workspace.Id
  return {
    details: {
      id: row.id,
      workspaceId,
      recipientId: row.recipientId,
      inviterMemberId: row.inviterMemberId,
      roleId: row.roleId,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString()
    },
    state:
      row.state === "Pending"
        ? { _tag: "Pending" }
        : row.state === "Accepted"
          ? {
              _tag: "Accepted",
              memberId: row.acceptedMemberId,
              acceptedAt: row.acceptedAt?.toISOString()
            }
          : {
              _tag: "Revoked",
              revokedBy: row.revokedByMemberId,
              revokedAt: row.revokedAt?.toISOString()
            }
  }
}
const decode = Schema.decodeUnknownEffect(Schema.Array(Invitation.Invitation))

/**
 * Read the invitations `where` selects, in `order`, decoded as records. The store scopes it to its
 * workspace; `PostgresDirectory` reads one recipient's across workspaces.
 *
 * @category utils
 * @since 0.1.0
 */
export const select = (
  db: PostgresDatabase.PostgresDatabase["Service"]["db"],
  where: SQL | undefined,
  order: ReadonlyArray<SQL>
) =>
  db
    .select()
    .from(invitations)
    .where(where)
    .orderBy(...order)
    .pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))))

/**
 * Builds the invitation store for the binding's workspace: this module's driver inside
 * `InvitationStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(invitations.workspaceId, workspaceId)
  const read = (operation: string, where: SQL | undefined, order: ReadonlyArray<SQL>) =>
    guard(select(db, where, order)).pipe(Effect.mapError(StoreError.failed("InvitationStore", operation)))
  const driver: InvitationStore.InvitationStore["Service"] = {
    get: (id) => Effect.map(read("get", and(inWorkspace, eq(invitations.id, id)), []), Array.head),
    listPendingByRecipient: (recipientId) =>
      read(
        "listPendingByRecipient",
        and(inWorkspace, eq(invitations.recipientId, recipientId), eq(invitations.state, "Pending")),
        [asc(invitations.id)]
      ),
    list: read("list", inWorkspace, [asc(invitations.issuedAt), asc(invitations.id)]),
    insert: Effect.fn("Invitations.insert")(function* (record) {
      const { details } = record
      yield* guard(
        db.insert(invitations).values({
          workspaceId,
          id: details.id,
          recipientId: details.recipientId,
          inviterMemberId: details.inviterMemberId,
          roleId: details.roleId,
          issuedAt: DateTime.toDate(details.issuedAt),
          expiresAt: DateTime.toDate(details.expiresAt),
          state: "Pending"
        }),
        true
      ).pipe(Effect.mapError(storeError("InvitationStore", "insert")))
    }),
    settle: Effect.fn("Invitations.settle")(function* (id, state) {
      const rows = yield* guard(
        db
          .update(invitations)
          .set(
            Invitation.State.isAnyOf(["Accepted"])(state)
              ? {
                  state: "Accepted",
                  acceptedMemberId: state.memberId,
                  acceptedAt: DateTime.toDate(state.acceptedAt)
                }
              : {
                  state: "Revoked",
                  revokedByMemberId: state.revokedBy,
                  revokedAt: DateTime.toDate(state.revokedAt)
                }
          )
          .where(and(inWorkspace, eq(invitations.id, id), eq(invitations.state, "Pending")))
          .returning({ id: invitations.id }),
        true
      ).pipe(Effect.mapError(storeError("InvitationStore", "settle")))
      if (rows.length === 0)
        return yield* StoreError.rejected("InvitationStore", "settle", "Expected a pending invitation")
    })
  }
  return InvitationStore.make(workspaceId, driver)
})

/**
 * Provides `InvitationStore.InvitationStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(InvitationStore.InvitationStore, make)
