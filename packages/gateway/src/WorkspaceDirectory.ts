/**
 * One identity's routing table across a host's workspaces: its memberships, ended ones included,
 * and its pending invitations. Reading it spans workspaces, which core never does, so storage
 * adapters implement it over what they store, `layerMemory` in process memory. The HTTP server
 * serves it at `GET /me/workspaces`, and the HTTP contract imports its schemas from
 * `@amends-dev/gateway/WorkspaceDirectory`.
 *
 * @since 0.1.0
 */

import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import { Invitation, Member, Workspace } from "@amends-dev/core/workspace"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * One identity's membership of one workspace, with that workspace's active member count.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Membership = Schema.Struct({
  workspace: Workspace.Workspace,
  member: Member.Member,
  /** The workspace's active human and agent memberships, encoded as `people`. */
  activeMemberCount: Schema.Natural
})
  .pipe(Schema.encodeKeys({ activeMemberCount: "people" }))
  .annotate({ identifier: "WorkspaceDirectoryMembership" })
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Membership extends Schema.Schema.Type<typeof Membership> {}

/**
 * An invitation still open to the identity, with its workspace's name when the directory finds
 * the workspace's record.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PendingInvitation = Invitation.Invitation.pipe(
  Schema.fieldsAssign({ workspaceName: Schema.optionalKey(Workspace.Name) })
)

/**
 * Everything an identity can reach: active and removed memberships, and pending invitations.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Listing = Schema.Struct({
  memberships: Schema.Array(Membership),
  invitations: Schema.Array(PendingInvitation)
}).annotate({ identifier: "WorkspaceDirectoryListing" })
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Listing extends Schema.Schema.Type<typeof Listing> {}

/**
 * The directory of a host's workspaces, which lists what one identity can reach across them.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceDirectory extends Context.Service<
  WorkspaceDirectory,
  {
    /**
     * Hosts route workspaces; this is one identity's routing table, read from
     * host-owned indexes across workspaces. Removed memberships stay listed so a
     * client can explain them. Invitations are listed for humans only.
     */
    readonly list: (identity: Identity.MemberReference) => Effect.Effect<Listing>
  }
>()("@amends-dev/gateway/WorkspaceDirectory") {}

const workspaceRows = MemoryDatabase.makeRows(Schema.fromJsonString(Workspace.Workspace))
const memberRows = MemoryDatabase.makeRows(Schema.fromJsonString(Member.Member))
const invitationRows = MemoryDatabase.makeRows(Schema.fromJsonString(Invitation.Invitation))

/**
 * One identity's workspaces, read from committed records across every workspace in storage.
 * This is host routing, not a core operation: it reads records directly and performs no
 * authorization of its own.
 */
const makeMemory = Effect.fn("WorkspaceDirectory.makeMemory")(function* () {
  const database = yield* MemoryDatabase.MemoryDatabase
  const list: WorkspaceDirectory["Service"]["list"] = Effect.fn("WorkspaceDirectory.memory.list")(function* (
    identity: Identity.MemberReference
  ) {
    const now = yield* DateTime.now
    const memberships: Array<Membership> = []
    const pending = []
    const ids = [...database.spaces.keys()].toSorted(MemoryDatabase.compareBinary)
    for (const workspaceId of ids) {
      const space = database.spaces.get(workspaceId)
      if (space === undefined) continue
      const workspace = yield* workspaceRows.get(space.records.of("workspace"), workspaceId)
      const all = yield* memberRows.all(space.records.of("members"))
      const activeMemberCount = all.filter((member) => member.status === "active").length
      if (Option.isSome(workspace))
        for (const member of all.toSorted((left, right) => MemoryDatabase.compareBinary(left.id, right.id)))
          if (Identity.MemberReference.isAnyOf([identity._tag])(member.identity) && member.identity.id === identity.id)
            memberships.push({ workspace: workspace.value, member, activeMemberCount })
      if (!Identity.MemberReference.isAnyOf(["Human"])(identity)) continue
      const issued = yield* invitationRows.all(space.records.of("invitations"))
      pending.push(
        ...issued
          .filter(
            (invitation) =>
              invitation.details.recipientId === identity.id &&
              Invitation.State.isAnyOf(["Pending"])(invitation.state) &&
              DateTime.isGreaterThan(invitation.details.expiresAt, now)
          )
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.details.id, right.details.id))
          .map((invitation) => ({
            ...invitation,
            ...(Option.isSome(workspace) ? { workspaceName: workspace.value.name } : {})
          }))
      )
    }
    return { memberships, invitations: pending }
  }, Effect.orDie)
  return WorkspaceDirectory.of({ list })
})

/**
 * Provide the workspace directory in process memory, over the `MemoryDatabase` beneath: it reads
 * the workspace, member, and invitation records of every workspace stored there to list one
 * identity's memberships and pending invitations, in binary ID order.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(WorkspaceDirectory, makeMemory())
