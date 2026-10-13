/**
 * Who owns the workspace and how ownership moves: the input of a transfer, the change it records,
 * and the view that shows the owner and, to the owner, the candidates. `OwnershipService` is the
 * operations; `WorkspaceStore` keeps the owner in the workspace record.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Assignment from "../authorization/Assignment.ts"
import * as Member from "./Member.ts"
import * as Workspace from "./Workspace.ts"

/**
 * The member to make owner, and the Owner assignment the caller reviewed; a transfer since then
 * made a new one, and the stale input is `Changed`.
 *
 * @category options
 * @since 0.1.0
 */
export const TransferInput = Schema.Struct({
  memberId: Member.Id,
  expectedOwnerAssignmentId: Assignment.Id
}).annotate({ identifier: "OwnershipTransferInput" })

/**
 * @category options
 * @since 0.1.0
 */
export interface TransferInput extends Schema.Schema.Type<typeof TransferInput> {}

/**
 * A recorded ownership transition, from one member to another: the payload of
 * `WorkspaceFacts.OwnershipTransferred`, which `WorkspaceStore.transferOwnership` applies.
 * Attribution and other workspace metadata stay unchanged.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Change = Schema.Struct({
  workspaceId: Workspace.Id,
  previousOwnerMemberId: Member.Id,
  ownerMemberId: Member.Id
}).check(
  Schema.makeFilter(
    (change) => change.previousOwnerMemberId !== change.ownerMemberId || "Ownership must move to another member"
  )
)

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Change extends Schema.Schema.Type<typeof Change> {}

/**
 * The workspace, its current owner and Owner assignment, whether the actor may transfer, and the
 * candidates. Candidate discovery is part of transfer authority: other members get none.
 *
 * @category schemas
 * @since 0.1.0
 */
export const View = Schema.Struct({
  workspace: Workspace.Workspace,
  owner: Member.Member,
  /** The current Owner assignment, which a transfer gives back as `expectedOwnerAssignmentId`. */
  ownerAssignmentId: Assignment.Id,
  /** Whether the actor is the owner, a person, and holds `workspace.transfer-ownership`. */
  canTransfer: Schema.Boolean,
  /** The other active human members, when the actor may transfer; empty otherwise. */
  candidates: Schema.Array(Member.Member)
}).annotate({ identifier: "WorkspaceOwnership" })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface View extends Schema.Schema.Type<typeof View> {}
