/**
 * The workspaces the person belongs to, as the host lists them, to open one, and the modal where they create
 * another. It reports the one they pick or create.
 */

import { Request } from "@amends-dev/core/request"
import { Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** The listing: under way, done, or not reached, with why. */
export const Workspaces = defineTaggedUnion({
  Loading: {},
  Loaded: { memberships: Schema.Array(WorkspaceDirectory.Membership) },
  Failed: { error: Schema.String }
})
export type Workspaces = typeof Workspaces.Type

/**
 * Why the form was refused, each reason when there is one: at the workspace's name, at the member's name, or
 * about the form as a whole.
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
 * Where creating a workspace has got to: the form, with the key of the request an attempt made, kept for the
 * next attempt at the same values; the request on its way; and, once the workspace exists, the listing read
 * again to open it, which may fail.
 */
export const Creating = defineTaggedUnion({
  Filling: {
    name: Schema.String,
    memberName: Schema.String,
    key: Schema.Option(Request.Key),
    errors: FormErrors
  },
  Sending: { name: Schema.String, memberName: Schema.String, key: Schema.Option(Request.Key) },
  Opening: { workspace: Workspace.Workspace, reloadFailed: Schema.Boolean }
})
export type Creating = typeof Creating.Type

/** The listing, what the person is creating and the dialog it is in, nothing while the dialog is closed. */
export const Model = Schema.Struct({
  workspaces: Workspaces,
  create: Schema.Option(Creating),
  dialog: DialogBlock.Model
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SucceededLoadWorkspaces: { memberships: Schema.Array(WorkspaceDirectory.Membership) },
  FailedLoadWorkspaces: { error: Schema.String },
  ClickedTryAgain: {},
  ClickedWorkspace: { workspaceId: WorkspaceId.WorkspaceId },
  ClickedCreate: {},
  TypedName: { name: Schema.String },
  TypedMemberName: { memberName: Schema.String },
  SubmittedCreate: {},
  SucceededCreate: { workspace: Workspace.Workspace },
  FailedCreate: { key: Schema.Option(Request.Key), error: FormErrors }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedWorkspace: { membership: WorkspaceDirectory.Membership }
})
export type OutMessage = typeof OutMessage.Type

export const WorkspacesDefinition = Block.makeDefinition("Workspaces", { Model, Message, OutMessage })
