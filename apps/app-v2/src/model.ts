/**
 * The app's state: the host it talks to, and the page the person is on. Signed out, it is the
 * sign-in form, a step at a time; signed in, the session, the workspaces the person belongs to, and
 * the one they opened, whose store syncs while it is open.
 */

import { Group, GroupId } from "@amends-dev/core/group"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { Member, MemberId, Workspace } from "@amends-dev/core/workspace"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"

/** Where signing in has got to: an address to send a code to, then the code it was sent. */
export const SignInForm = defineTaggedUnion({
  EnteringEmail: { email: Schema.String, error: Schema.Option(Schema.String) },
  SendingCode: { email: Schema.String },
  EnteringCode: { email: Schema.String, code: Schema.String, error: Schema.Option(Schema.String) },
  CheckingCode: { email: Schema.String, code: Schema.String }
})
export type SignInForm = typeof SignInForm.Type

/** The workspaces the person belongs to, as the host lists them. */
export const Workspaces = defineTaggedUnion({
  Loading: {},
  Loaded: { memberships: Schema.Array(WorkspaceDirectory.Membership) },
  Failed: { error: Schema.String }
})
export type Workspaces = typeof Workspaces.Type

/** The open workspace's store: opening, open, or failed. */
export const StoreState = defineTaggedUnion({
  Opening: {},
  Open: {},
  Failed: { error: Schema.String }
})
export type StoreState = typeof StoreState.Type

/** A thread of the open group, with its opening message, and whether it is still being started. */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  pending: Schema.Boolean
})
export type ThreadItem = typeof ThreadItem.Type

/** A message of the open thread, and whether it is still being posted. */
export const MessageItem = Schema.Struct({ message: ThreadMessage.ThreadMessage, pending: Schema.Boolean })
export type MessageItem = typeof MessageItem.Type

/** An action of the person's the server has not finished: what it does, its text, and why it was refused. */
export const ActionItem = Schema.Struct({
  key: Schema.String,
  what: Schema.String,
  text: Schema.Option(Schema.String),
  rejection: Schema.Option(Schema.String)
})
export type ActionItem = typeof ActionItem.Type

/** The thread open in the group, its messages, and the reply being written. */
export const OpenThread = Schema.Struct({
  threadId: ThreadId.ThreadId,
  messages: Schema.Array(MessageItem),
  draft: Schema.String
})
export type OpenThread = typeof OpenThread.Type

/** The group open in the workspace, its threads, the thread being started, and the thread open in it. */
export const OpenGroup = Schema.Struct({
  groupId: GroupId.GroupId,
  threads: Schema.Array(ThreadItem),
  draft: Schema.String,
  thread: Schema.Option(OpenThread)
})
export type OpenGroup = typeof OpenGroup.Type

/**
 * The workspace the person opened, as their member of it: its store, what the replica holds of it,
 * the actions not finished yet, why the last one could not be written, and the group open in it.
 */
export const Opened = Schema.Struct({
  workspace: Workspace.Workspace,
  memberId: MemberId.MemberId,
  store: StoreState,
  groups: Schema.Array(Group.Group),
  members: Schema.Array(Member.Member),
  actions: Schema.Array(ActionItem),
  notice: Schema.Option(Schema.String),
  group: Schema.Option(OpenGroup)
})
export type Opened = typeof Opened.Type

export const Page = defineTaggedUnion({
  SignedOut: { form: SignInForm },
  SignedIn: { session: SignIn.Session, workspaces: Workspaces, opened: Schema.Option(Opened) }
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({ apiUrl: Schema.String, page: Page })
export type Model = typeof Model.Type
