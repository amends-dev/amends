/**
 * An invitation asks one person, by human ID, into the workspace with a built-in role, and stays
 * pending until they accept it, it is revoked, or it expires. This module holds its record: the
 * issuance, which never changes, and the state it settles into. `InvitationService` is the
 * operations on invitations and `InvitationStore` keeps them; the host resolves an email address
 * to the human ID an invitation names, so a person who has never signed in can be invited, and the
 * invitation keeps the address too, so the people who manage invitations can tell whom it is for.
 *
 * @since 0.1.0
 */

import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Role from "../authorization/Role.ts"
import * as Identity from "../identity/Identity.ts"
import * as Request from "../request/Request.ts"
import * as MemberId from "./MemberId.ts"
import * as WorkspaceId from "./WorkspaceId.ts"

/**
 * Names an invitation. A keyed issuance derives it from the issuer and key, so a retry names the
 * invitation its first attempt issued.
 *
 * @category schemas
 * @since 0.1.0
 */
export const InvitationId = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceInvitationId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type InvitationId = typeof InvitationId.Type

/**
 * What an issuer gives: whom to invite, the role they will hold, and when the invitation expires.
 *
 * @category options
 * @since 0.1.0
 */
export const IssueInput = Schema.Struct({
  /** The person invited; the host resolves an address to it, creating the account if needed. */
  recipientId: Identity.HumanId,
  /** The address the host resolved the person from, which tells people whom the invitation is for. */
  recipientEmail: Schema.Trimmed.check(Schema.isMinLength(1)),
  /** The built-in role acceptance assigns at workspace scope; Owner cannot be invited. */
  roleId: Role.RoleId,
  /** After this, acceptance fails as expired; it is compared to the clock, never updated. */
  expiresAt: Schema.DateTimeUtcFromString
}).annotate({ identifier: "WorkspaceInvitationIssueInput" })

/**
 * @category options
 * @since 0.1.0
 */
export interface IssueInput extends Schema.Schema.Type<typeof IssueInput> {}

/**
 * An invitation as issued, which never changes: the input, its ID, the workspace, the member who
 * issued it, and when. Expiry must follow issuance. Acceptance assigns the referenced role at
 * workspace scope, with the permissions the role holds then.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Issuance = Schema.Struct({
  ...IssueInput.fields,
  id: InvitationId,
  workspaceId: WorkspaceId.WorkspaceId,
  inviterMemberId: MemberId.MemberId,
  issuedAt: Schema.DateTimeUtcFromString
})
  .check(
    Schema.makeFilter((value) => {
      if (!DateTime.isGreaterThan(value.expiresAt, value.issuedAt)) return "Expiry must follow issuance"
      return undefined
    })
  )
  .annotate({ identifier: "WorkspaceInvitationIssuance" })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Issuance extends Schema.Schema.Type<typeof Issuance> {}

/**
 * Where an invitation stands: `Pending`; `Accepted`, by which member and when; or `Revoked`, by
 * whom and when. Expiry is no state: it is read from `expiresAt` against the clock.
 *
 * @category schemas
 * @since 0.1.0
 */
export const State = Schema.TaggedUnion({
  Pending: {},
  Accepted: { memberId: MemberId.MemberId, acceptedAt: Schema.DateTimeUtcFromString },
  Revoked: { revokedBy: MemberId.MemberId, revokedAt: Schema.DateTimeUtcFromString }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type State = typeof State.Type

/**
 * An invitation as `InvitationStore` keeps it: its issuance and its state. Expiry is evaluated
 * against the clock, so an expired invitation stays `Pending` until it is revoked, and no scheduled
 * update is needed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Invitation = Schema.Struct({ details: Issuance, state: State }).annotate({
  identifier: "WorkspaceInvitation"
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Invitation extends Schema.Schema.Type<typeof Invitation> {}

/**
 * The ID of the invitation the current request issues, as `Request.newId` derives it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const newId = Effect.map(Request.newId("invitation", []), (id) => InvitationId.make(id))
