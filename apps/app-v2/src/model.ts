/**
 * The app's state: the host it talks to, and the page the person is on. Signed out, it is the
 * sign-in form, a step at a time; signed in, the session, the workspaces the person belongs to, and
 * the one they opened, whose store syncs while it is open.
 */

import { Group, GroupFollow, GroupId, GroupMembership } from "@amends-dev/core/group"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipationId } from "@amends-dev/core/thread"
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

/** A group the person can see, and whether it is still being created. */
export const GroupItem = Schema.Struct({ group: Group.Group, pending: Schema.Boolean })
export type GroupItem = typeof GroupItem.Type

/** A thread of the open group, with its opening message, whether it is still being started, and how much is unread. */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  pending: Schema.Boolean,
  unread: Schema.Int
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

/** The person's part in a thread: their participation, whether it is active, and whether a change to it is on its way. */
export const Following = Schema.Struct({
  participationId: ThreadParticipationId.ThreadParticipationId,
  active: Schema.Boolean,
  pending: Schema.Boolean
})
export type Following = typeof Following.Type

/** A message being edited, and its new text. */
export const Editing = Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId, draft: Schema.String })
export type Editing = typeof Editing.Type

/**
 * The thread open in the group: its messages, the reply being written, the person's part in it, the
 * sequence of its latest activity, how far they have read it and asked to, and the title or message
 * being changed.
 */
export const OpenThread = Schema.Struct({
  threadId: ThreadId.ThreadId,
  messages: Schema.Array(MessageItem),
  draft: Schema.String,
  following: Schema.Option(Following),
  latest: Schema.Int,
  readThrough: Schema.Int,
  readRequested: Schema.Int,
  renaming: Schema.Option(Schema.String),
  editing: Schema.Option(Editing)
})
export type OpenThread = typeof OpenThread.Type

/**
 * The group open in the workspace: its threads, the thread being started, the thread open in it,
 * the name being given it, and the member chosen to admit to it, or none.
 */
export const OpenGroup = Schema.Struct({
  groupId: GroupId.GroupId,
  threads: Schema.Array(ThreadItem),
  draft: Schema.String,
  thread: Schema.Option(OpenThread),
  renaming: Schema.Option(Schema.String),
  adding: Schema.Option(MemberId.MemberId)
})
export type OpenGroup = typeof OpenGroup.Type

/** A group's membership, and whether a change to it is on its way. */
export const MembershipItem = Schema.Struct({ membership: GroupMembership.GroupMembership, pending: Schema.Boolean })
export type MembershipItem = typeof MembershipItem.Type

/** One of the person's follows of a group, and whether a change to it is on its way. */
export const FollowItem = Schema.Struct({ follow: GroupFollow.GroupFollow, pending: Schema.Boolean })
export type FollowItem = typeof FollowItem.Type

/** What the person is starting beside the open group: a team, or a conversation with another member. */
export const Composing = defineTaggedUnion({
  Team: { name: Schema.String, isPublic: Schema.Boolean },
  Direct: { memberId: Schema.Option(MemberId.MemberId), text: Schema.String }
})
export type Composing = typeof Composing.Type

/**
 * The workspace the person opened, as their member of it: its store, what the replica holds of it,
 * its groups' memberships and the person's follows among them, the actions not finished yet, why
 * the last one could not be written, what the person is starting, and the group open in it.
 */
export const Opened = Schema.Struct({
  workspace: Workspace.Workspace,
  memberId: MemberId.MemberId,
  store: StoreState,
  groups: Schema.Array(GroupItem),
  members: Schema.Array(Member.Member),
  memberships: Schema.Array(MembershipItem),
  follows: Schema.Array(FollowItem),
  actions: Schema.Array(ActionItem),
  notice: Schema.Option(Schema.String),
  composing: Schema.Option(Composing),
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
