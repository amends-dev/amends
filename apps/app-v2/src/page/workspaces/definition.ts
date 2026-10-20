/**
 * The workspaces the person belongs to and the invitations waiting for them, as the host lists them, to open a
 * workspace or accept an invitation, and the modal where they create a workspace or join one. It reports the one
 * they pick or create, and that the host no longer knows their session. Joining one tells the person with a toast.
 */

import { Request } from "@amends-dev/core/request"
import { Invitation, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** An invitation still open to the person, with its workspace's name when the host has one. */
export type PendingInvitation = typeof WorkspaceDirectory.PendingInvitation.Type

/**
 * The listing: under way for the first time, done, or not reached the first time. Once done it stays what was
 * listed while it is read again, and when reading it again failed (`reloadFailed`) it says so over the list it
 * kept.
 */
export const Workspaces = defineTaggedUnion({
  Loading: {},
  Loaded: {
    memberships: Schema.Array(WorkspaceDirectory.Membership),
    invitations: Schema.Array(WorkspaceDirectory.PendingInvitation),
    reloadFailed: Schema.Boolean
  },
  Unreachable: {}
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
 * What the person is doing in the dialog: creating a workspace or joining one an invitation offers.
 *
 * Creating has its form, with the key of the request an attempt made, kept for the next attempt at the same
 * values, and the request on its way. Once the workspace exists, the dialog is `Opening` it: the listing is read
 * again to open the workspace by its ID, and may fail.
 *
 * Joining has its form, over the invitation it answers, and the request on its way, which needs no key since the
 * host returns the same member when the invitation is accepted again. Once the person is in the workspace they have
 * `Joined` it: the listing is read again, and may fail. When it is read the dialog closes and a toast says so,
 * since the workspace is not opened.
 */
export const Entering = defineTaggedUnion({
  FillingCreate: {
    name: Schema.String,
    memberName: Schema.String,
    key: Schema.Option(Request.Key),
    errors: FormErrors
  },
  SendingCreate: { name: Schema.String, memberName: Schema.String, key: Schema.Option(Request.Key) },
  Opening: {
    workspaceId: WorkspaceId.WorkspaceId,
    workspaceName: Schema.String,
    reloadFailed: Schema.Boolean
  },
  FillingJoin: { invitation: WorkspaceDirectory.PendingInvitation, name: Schema.String, errors: JoinErrors },
  SendingJoin: { invitation: WorkspaceDirectory.PendingInvitation, name: Schema.String },
  Joined: { invitation: WorkspaceDirectory.PendingInvitation, reloadFailed: Schema.Boolean }
})
export type Entering = typeof Entering.Type

/** A confirmation that shows over the page's corner until the person dismisses it or its time is up. */
export const Toast = Schema.Struct({ id: Schema.Finite, text: Schema.String })
export type Toast = typeof Toast.Type

/**
 * The listing, what the person is doing in the dialog and the dialog it is in, nothing while the dialog is closed,
 * the name a person joining is offered to go by, and the toasts showing, with the ID the next one takes.
 */
export const Model = Schema.Struct({
  workspaces: Workspaces,
  entering: Schema.Option(Entering),
  suggestedName: Schema.String,
  toasts: Schema.Array(Toast),
  nextToastId: Schema.Finite,
  dialog: DialogBlock.Model
})
export type Model = typeof Model.Type

/**
 * Whether the listing was read, which the screen around it is as wide as a list needs for: a screen that says it is
 * on its way, or that the host was not reached, is as narrow as a form.
 */
export const hasListing = (model: Pick<Model, "workspaces">): boolean =>
  Workspaces.isAnyOf(["Loaded"])(model.workspaces)

export const Message = defineMessageUnion({
  SucceededLoadWorkspaces: {
    memberships: Schema.Array(WorkspaceDirectory.Membership),
    invitations: Schema.Array(WorkspaceDirectory.PendingInvitation)
  },
  FailedLoadWorkspaces: {},
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
  SucceededJoin: {},
  FailedJoin: { error: JoinErrors },
  RejectedSession: {},
  DismissedToast: { toastId: Schema.Finite },
  ExpiredToast: { toastId: Schema.Finite },
  CompletedFocusWorkspaceRow: {},
  CompletedSelectOnFocus: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedWorkspace: { membership: WorkspaceDirectory.Membership },
  EndedSession: {}
})
export type OutMessage = typeof OutMessage.Type

export const WorkspacesDefinition = Block.makeDefinition("Workspaces", { Model, Message, OutMessage })

/** The ID of the row that opens `workspaceId`, which focus moves to once the person has joined it. */
export const workspaceRowId = (workspaceId: WorkspaceId.WorkspaceId): string => `workspace-${workspaceId}`
