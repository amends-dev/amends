/**
 * The storage contract for invitations, which every storage adapter implements and
 * `InvitationProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Identity from "../identity/Identity.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Store from "../journal/Store.ts"
import * as StoreError from "../journal/StoreError.ts"
import * as StoreInput from "../journal/StoreInput.ts"
import * as Invitation from "./Invitation.ts"
import type * as WorkspaceId from "./WorkspaceId.ts"

/**
 * The invitation store, bound to one workspace by the host.
 *
 * What a storage adapter implements for invitations. Its writes share the journal's native
 * transaction.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class InvitationStore extends Context.Service<
  InvitationStore,
  {
    /** Return an isolated record from the current transaction or committed state. */
    readonly get: (
      id: Invitation.InvitationId
    ) => Effect.Effect<Option.Option<Invitation.Invitation>, StoreError.StoreError>
    /** All Pending invitations for this human in this workspace, including expired ones. */
    readonly listPendingByRecipient: (
      recipientId: Identity.HumanId
    ) => Effect.Effect<ReadonlyArray<Invitation.Invitation>, StoreError.StoreError>
    /** Every invitation in this workspace in issue order, whatever its state. */
    readonly list: Effect.Effect<ReadonlyArray<Invitation.Invitation>, StoreError.StoreError>
    /** Insert a pending invitation; a duplicate ID is rejected. Never upsert. */
    readonly insert: (record: Invitation.Invitation) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Move a pending invitation to its terminal state. A missing or settled invitation is rejected;
     * the issuance is retained as it was.
     */
    readonly settle: (
      id: Invitation.InvitationId,
      state: Exclude<Invitation.State, { readonly _tag: "Pending" }>
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/workspace/InvitationStore") {}

/** The states an invitation settles into. */
const Settled = Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked])

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.WorkspaceId,
  driver: InvitationStore["Service"]
): InvitationStore["Service"] => {
  const read = StoreInput.read("InvitationStore")
  const write = StoreInput.write("InvitationStore", workspaceId)
  return {
    get: (id) => Effect.flatMap(read("get", Invitation.InvitationId, id), driver.get),
    listPendingByRecipient: (recipientId) =>
      Effect.flatMap(read("listPendingByRecipient", Identity.HumanId, recipientId), driver.listPendingByRecipient),
    list: driver.list,
    insert: (record) =>
      write("insert", Invitation.Invitation, record).pipe(
        Effect.filterOrFail(
          (record) => record.details.workspaceId === workspaceId && Invitation.State.isAnyOf(["Pending"])(record.state),
          () => StoreError.rejected("InvitationStore", "insert", "Expected a pending invitation in this workspace")
        ),
        Effect.flatMap(driver.insert)
      ),
    settle: Effect.fn("InvitationStore.settle")(function* (id, state) {
      return yield* driver.settle(
        yield* write("settle", Invitation.InvitationId, id),
        yield* write("settle", Settled, state)
      )
    })
  }
}

/**
 * How invitation records are stored: the JSON of each record's encoded form, keyed by its ID.
 */
const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Invitation.Invitation))

/**
 * Issue order: issue time, then ID in binary order. `list` returns a workspace's invitations in
 * it.
 */
const byIssue = (left: Invitation.Invitation, right: Invitation.Invitation) =>
  DateTime.toEpochMillis(left.details.issuedAt) - DateTime.toEpochMillis(right.details.issuedAt) ||
  MemoryDatabase.compareBinary(left.details.id, right.details.id)

/**
 * Invitations and their grants; settlement records who acted and when.
 */
const makeMemory = Effect.fn("InvitationStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding
  const all = (operation: string) =>
    Effect.flatMap(read, (space) => rows.all(space.records.of("invitations"))).pipe(
      Effect.mapError(StoreError.failed("InvitationStore", operation))
    )
  const driver: InvitationStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("invitations"), id)).pipe(
        Effect.mapError(StoreError.failed("InvitationStore", "get"))
      ),
    listPendingByRecipient: (recipientId) =>
      Effect.map(all("listPendingByRecipient"), (records) =>
        records
          .filter(
            (record) =>
              record.details.recipientId === recipientId && Invitation.State.isAnyOf(["Pending"])(record.state)
          )
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.details.id, right.details.id))
      ),
    list: Effect.map(all("list"), (records) => records.toSorted(byIssue)),
    insert: Effect.fn("InvitationStore.memory.insert")(
      function* (record) {
        const space = yield* write
        if (space.records.of("invitations").has(record.details.id))
          return yield* StoreError.rejected("InvitationStore", "insert", "Invitation ID already exists")
        const row = yield* rows.encode(record)
        space.records.of("invitations").set(record.details.id, row)
      },
      Effect.mapError(StoreError.failed("InvitationStore", "insert"))
    ),
    settle: Effect.fn("InvitationStore.memory.settle")(
      function* (id, state) {
        const space = yield* write
        const current = yield* rows.get(space.records.of("invitations"), id)
        if (Option.isNone(current) || !Invitation.State.isAnyOf(["Pending"])(current.value.state))
          return yield* StoreError.rejected("InvitationStore", "settle", "Expected a pending invitation")
        const row = yield* rows.encode({ ...current.value, state })
        space.records.of("invitations").set(id, row)
      },
      Effect.mapError(StoreError.failed("InvitationStore", "settle"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `InvitationStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID is rejected, and settling is rejected unless the
 * invitation is stored and pending. A settled invitation keeps its row, with who acted and when.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(InvitationStore, makeMemory())
