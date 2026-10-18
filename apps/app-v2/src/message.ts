/**
 * What happens in the app: what the person does, and what the commands, the store, and its
 * subscription report back.
 */

import { Group, GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { Member, WorkspaceId } from "@amends-dev/core/workspace"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Schema from "effect/Schema"
import { defineMessageUnion } from "foldkit/message"
import { ActionItem, MessageItem, ThreadItem } from "./model.ts"

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
  FailedReadStore: { error: Schema.String },
  GotGroups: { groups: Schema.Array(Group.Group) },
  GotMembers: { members: Schema.Array(Member.Member) },
  GotActions: { actions: Schema.Array(ActionItem) },
  GotThreads: { groupId: GroupId.GroupId, threads: Schema.Array(ThreadItem) },
  GotMessages: { threadId: ThreadId.ThreadId, messages: Schema.Array(MessageItem) },
  ClickedGroup: { groupId: GroupId.GroupId },
  ClickedThread: { threadId: ThreadId.ThreadId },
  ClickedAllThreads: {},
  TypedThread: { text: Schema.String },
  SubmittedThread: {},
  TypedReply: { text: Schema.String },
  SubmittedReply: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String },
  ClickedDismiss: { key: Schema.String },
  CompletedDismiss: {},
  ClickedSignOut: {},
  CompletedSignOut: {}
})
export type Message = typeof Message.Type
