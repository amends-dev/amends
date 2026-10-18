/**
 * What happens in the app: what the person does, and what the commands, the store, and its
 * subscription report back.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Schema from "effect/Schema"
import { defineMessageUnion } from "foldkit/message"
import { Counts } from "./model.ts"

export const Message = defineMessageUnion({
  TypedEmail: { email: Schema.String },
  SubmittedEmail: {},
  SucceededSendCode: {},
  FailedSendCode: { error: Schema.String },
  TypedCode: { code: Schema.String },
  SubmittedCode: {},
  SucceededSignIn: { session: SignIn.Session },
  FailedSignIn: { error: Schema.String },
  CompletedSaveSession: {},
  SucceededLoadWorkspaces: { memberships: Schema.Array(WorkspaceDirectory.Membership) },
  FailedLoadWorkspaces: { error: Schema.String },
  ClickedWorkspace: { workspaceId: WorkspaceId.WorkspaceId },
  ClickedAllWorkspaces: {},
  AcquiredStore: {},
  ReleasedStore: {},
  FailedAcquireStore: { error: Schema.String },
  CountedRecords: { counts: Counts },
  FailedReadStore: { error: Schema.String },
  ClickedSignOut: {},
  CompletedSignOut: {}
})
export type Message = typeof Message.Type
