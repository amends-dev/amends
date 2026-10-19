/** The workspaces the person belongs to, as the host lists them, to open one. It reports the one they pick. */

import { WorkspaceId } from "@amends-dev/core/workspace"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
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

export const Model = Schema.Struct({ workspaces: Workspaces })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SucceededLoadWorkspaces: { memberships: Schema.Array(WorkspaceDirectory.Membership) },
  FailedLoadWorkspaces: { error: Schema.String },
  ClickedWorkspace: { workspaceId: WorkspaceId.WorkspaceId }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedWorkspace: { membership: WorkspaceDirectory.Membership }
})
export type OutMessage = typeof OutMessage.Type

export const WorkspacesDefinition = Block.makeDefinition("Workspaces", { Model, Message, OutMessage })
