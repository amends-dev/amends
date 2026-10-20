/**
 * The workspaces the person belongs to and the invitations waiting for them, as the host lists them, to open a
 * workspace or accept an invitation, and the modal where they create a workspace or join one. It reports the one
 * they pick, create, or join.
 */

import { Request } from "@amends-dev/core/request"
import { Invitation, Member, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** An invitation still open to the person, with its workspace's name when the host has one. */
export type PendingInvitation = typeof WorkspaceDirectory.PendingInvitation.Type

/** The listing: under way, done, or not reached, with why. */
export const Workspaces = defineTaggedUnion({
  Loading: {},
  Loaded: {
    memberships: Schema.Array(WorkspaceDirectory.Membership),
    invitations: Schema.Array(WorkspaceDirectory.PendingInvitation)
  },
  Failed: { error: Schema.String }
})
export type Workspaces = typeof Workspaces.Type

/**
 * Why the form for creating a workspace was refused, each reason when there is one: at the workspace's name, at
 * the member's name, or about the form as a whole.
 */
export const FormErrors = Schema.Struct({
  name: Schema.Option(Schema.String),
  memberName: Schema.Option(Schema.String),
  form: Schema.Option(Schema.String)
})
export type FormErrors = typeof FormErrors.Type

/** A form no one has refused. */
export const noFormErrors = FormErrors.make({ name: Option.none(), memberName: Option.none(), form: Option.none() })

/**
 * Why the form for joining a workspace was refused, each reason when there is one: at the person's name, or about
 * the form as a whole.
 */
export const JoinErrors = Schema.Struct({
  name: Schema.Option(Schema.String),
  form: Schema.Option(Schema.String)
})
export type JoinErrors = typeof JoinErrors.Type

/** A form for joining no one has refused. */
export const noJoinErrors = JoinErrors.make({ name: Option.none(), form: Option.none() })

/**
 * What the person is doing in the dialog: entering a workspace, by creating one or by joining one an invitation
 * offers, from the form to opening it.
 *
 * Creating has its form, with the key of the request an attempt made, kept for the next attempt at the same
 * values, and the request on its way. Joining has its form, over the invitation it answers, and the request on
 * its way, which needs no key since the host returns the same member when the invitation is accepted again. Once
 * the workspace exists, or the person is in it, both come to opening it, which is one: the listing is read again
 * to open the workspace by its ID, named for the person as far as it is known, and may fail.
 */
export const Entering = defineTaggedUnion({
  FillingCreate: {
    name: Schema.String,
    memberName: Schema.String,
    key: Schema.Option(Request.Key),
    errors: FormErrors
  },
  SendingCreate: { name: Schema.String, memberName: Schema.String, key: Schema.Option(Request.Key) },
  FillingJoin: { invitation: WorkspaceDirectory.PendingInvitation, name: Schema.String, errors: JoinErrors },
  SendingJoin: { invitation: WorkspaceDirectory.PendingInvitation, name: Schema.String },
  Opening: {
    workspaceId: WorkspaceId.WorkspaceId,
    workspaceName: Schema.Option(Schema.String),
    reloadFailed: Schema.Boolean
  }
})
export type Entering = typeof Entering.Type

/** The listing, what the person is doing in the dialog and the dialog it is in, nothing while the dialog is closed. */
export const Model = Schema.Struct({
  workspaces: Workspaces,
  entering: Schema.Option(Entering),
  dialog: DialogBlock.Model
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SucceededLoadWorkspaces: {
    memberships: Schema.Array(WorkspaceDirectory.Membership),
    invitations: Schema.Array(WorkspaceDirectory.PendingInvitation)
  },
  FailedLoadWorkspaces: { error: Schema.String },
  ClickedTryAgain: {},
  ClickedWorkspace: { workspaceId: WorkspaceId.WorkspaceId },
  ClickedAccept: { invitationId: Invitation.InvitationId },
  ClickedCreate: {},
  TypedName: { name: Schema.String },
  TypedMemberName: { memberName: Schema.String },
  TypedJoinName: { name: Schema.String },
  SubmittedCreate: {},
  SubmittedJoin: {},
  SucceededCreate: { workspace: Workspace.Workspace },
  FailedCreate: { key: Schema.Option(Request.Key), error: FormErrors },
  SucceededJoin: { member: Member.Member },
  FailedJoin: { error: JoinErrors }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedWorkspace: { membership: WorkspaceDirectory.Membership }
})
export type OutMessage = typeof OutMessage.Type

export const WorkspacesDefinition = Block.makeDefinition("Workspaces", { Model, Message, OutMessage })
