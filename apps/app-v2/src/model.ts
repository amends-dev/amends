/**
 * The app's state: the host it talks to, and the page the person is on. Signed out, it is the
 * sign-in form, a step at a time; signed in, the session, the workspaces the person belongs to, and
 * the one they opened, whose store syncs while it is open.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Assignment, Role } from "@amends-dev/core/authorization"
import { Channel, ChannelId, Contact } from "@amends-dev/core/channel"
import { Connection } from "@amends-dev/core/connection"
import { Group, GroupFollow, GroupId, GroupMembership } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification } from "@amends-dev/core/notification"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipationId } from "@amends-dev/core/thread"
import { Turn, TurnId } from "@amends-dev/core/turn"
import { Invitation, Member, MemberId, Workspace } from "@amends-dev/core/workspace"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"
import * as AgentSetup from "./agentSetup.ts"
import * as SettingsForm from "./settingsForm.ts"

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

/**
 * A thread of the open group, with its opening message, the task it tracks, whether it is still
 * being started, and how much is unread.
 */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  task: Schema.Option(Task.Task),
  pending: Schema.Boolean,
  unread: Schema.Int
})
export type ThreadItem = typeof ThreadItem.Type

/** A message of the open thread, and whether it is still being posted. */
export const MessageItem = Schema.Struct({ message: ThreadMessage.ThreadMessage, pending: Schema.Boolean })
export type MessageItem = typeof MessageItem.Type

/** An action of the person's the server has not finished: which, what it does, its text, and why it was refused. */
export const ActionItem = Schema.Struct({
  key: Schema.String,
  tag: Schema.String,
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

/** The task the open thread tracks, and whether a change to it is on its way. */
export const TaskItem = Schema.Struct({ task: Task.Task, pending: Schema.Boolean })
export type TaskItem = typeof TaskItem.Type

/**
 * One of the open thread's turns, whether a change to it is on its way, and whether nothing but who
 * may direct its agent keeps it from running again.
 */
export const TurnItem = Schema.Struct({ turn: ReplicaRecord.Turn, pending: Schema.Boolean, retryOpen: Schema.Boolean })
export type TurnItem = typeof TurnItem.Type

/** How following a turn's log stands: opening, open as the turn writes it, ended with the turn, or failed, with why. */
export const LogState = defineTaggedUnion({
  Opening: {},
  Open: {},
  Ended: {},
  Failed: { error: Schema.String }
})
export type LogState = typeof LogState.Type

/** The turn whose log the person follows, the log's items so far, and how following it stands. */
export const TurnLog = Schema.Struct({ turnId: TurnId.TurnId, items: Schema.Array(Turn.LogItem), state: LogState })
export type TurnLog = typeof TurnLog.Type

/** A message being edited, and its new text. */
export const Editing = Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId, draft: Schema.String })
export type Editing = typeof Editing.Type

/**
 * The thread open in the group: its messages, the reply being written, once its draft is read, the person's part in it, the
 * sequence of its latest activity, how far they have read it and asked to, the title or message
 * being changed, the task it tracks, its agents' turns, and the turn whose log the person follows.
 */
export const OpenThread = Schema.Struct({
  threadId: ThreadId.ThreadId,
  messages: Schema.Array(MessageItem),
  draft: Schema.Option(Schema.String),
  following: Schema.Option(Following),
  latest: Schema.Int,
  readThrough: Schema.Int,
  readRequested: Schema.Int,
  renaming: Schema.Option(Schema.String),
  editing: Schema.Option(Editing),
  task: Schema.Option(TaskItem),
  turns: Schema.Array(TurnItem),
  log: Schema.Option(TurnLog)
})
export type OpenThread = typeof OpenThread.Type

/**
 * The group open in the workspace: its threads, the thread being started, once its draft is read, the thread open in it,
 * the name being given it, and the member chosen to admit to it, or none.
 */
export const OpenGroup = Schema.Struct({
  groupId: GroupId.GroupId,
  threads: Schema.Array(ThreadItem),
  draft: Schema.Option(Schema.String),
  thread: Schema.Option(OpenThread),
  renaming: Schema.Option(Schema.String),
  adding: Schema.Option(MemberId.MemberId)
})
export type OpenGroup = typeof OpenGroup.Type

/** A member of the workspace, and whether a change to them is on its way. */
export const MemberItem = Schema.Struct({ member: Member.Member, pending: Schema.Boolean })
export type MemberItem = typeof MemberItem.Type

/** A group's membership, and whether a change to it is on its way. */
export const MembershipItem = Schema.Struct({ membership: GroupMembership.GroupMembership, pending: Schema.Boolean })
export type MembershipItem = typeof MembershipItem.Type

/** One of the person's follows of a group, and whether a change to it is on its way. */
export const FollowItem = Schema.Struct({ follow: GroupFollow.GroupFollow, pending: Schema.Boolean })
export type FollowItem = typeof FollowItem.Type

/** A role assignment, and whether a change to it is on its way. */
export const AssignmentItem = Schema.Struct({ assignment: Assignment.Assignment, pending: Schema.Boolean })
export type AssignmentItem = typeof AssignmentItem.Type

/** An invitation, and whether a change to it is on its way. */
export const InvitationItem = Schema.Struct({ invitation: Invitation.Invitation, pending: Schema.Boolean })
export type InvitationItem = typeof InvitationItem.Type

/**
 * The workspace's settings as the person changes them: the workspace's name and their own while
 * they give one, and whom they are inviting, with the role the invitation gives.
 */
export const Settings = Schema.Struct({
  workspaceName: Schema.Option(Schema.String),
  ownName: Schema.Option(Schema.String),
  inviting: Schema.Struct({ email: Schema.String, roleId: Role.RoleId })
})
export type Settings = typeof Settings.Type

/**
 * A notification in the person's inbox, the thread it comes from with its opening message and the
 * message it is about when the replica holds them, and whether a change to it is on its way.
 */
export const InboxItem = Schema.Struct({
  notification: Notification.Notification,
  pending: Schema.Boolean,
  thread: Schema.Option(Thread.Thread),
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  message: Schema.Option(ThreadMessage.ThreadMessage)
})
export type InboxItem = typeof InboxItem.Type

/** A connection of the workspace, and whether a change to it is on its way. */
export const ConnectionItem = Schema.Struct({ connection: ReplicaRecord.Connection, pending: Schema.Boolean })
export type ConnectionItem = typeof ConnectionItem.Type

/** The integrations the host installs, as it lists them: loading, loaded, or not reached, with why. */
export const Integrations = defineTaggedUnion({
  Loading: {},
  Loaded: { integrations: Schema.Array(Connection.IntegrationView) },
  Failed: { error: Schema.String }
})
export type Integrations = typeof Integrations.Type

/**
 * The form open among the workspace's connections: adding one, to an integration, with how it
 * authenticates, its key, and its settings; renaming one; changing one's settings; or replacing
 * one's key. A form sent over HTTP is sending until the host answers, and keeps why it refused.
 */
export const ConnectionForm = defineTaggedUnion({
  Adding: {
    integrationId: Schema.String,
    name: Schema.String,
    auth: ConnectionContract.AuthMethod,
    apiKey: Schema.String,
    settings: SettingsForm.Draft,
    sending: Schema.Boolean,
    error: Schema.Option(Schema.String)
  },
  Renaming: { connectionId: ConnectionContract.ConnectionId, name: Schema.String },
  Configuring: {
    connectionId: ConnectionContract.ConnectionId,
    settings: SettingsForm.Draft,
    error: Schema.Option(Schema.String)
  },
  ReplacingKey: {
    connectionId: ConnectionContract.ConnectionId,
    apiKey: Schema.String,
    sending: Schema.Boolean,
    error: Schema.Option(Schema.String)
  }
})
export type ConnectionForm = typeof ConnectionForm.Type

/** Checking a connection with its system: under way, done with what it found, or not reached, with why. */
export const Check = defineTaggedUnion({
  Checking: {},
  Checked: { health: ConnectionContract.Health },
  Failed: { error: Schema.String }
})
export type Check = typeof Check.Type

/** The workspace's connections as the person manages them: the form open among them, and the last check. */
export const Connections = Schema.Struct({
  form: Schema.Option(ConnectionForm),
  check: Schema.Option(Schema.Struct({ connectionId: ConnectionContract.ConnectionId, check: Check }))
})
export type Connections = typeof Connections.Type

/** An agent of the workspace, and whether a change to it is on its way. Its name and role are its member's. */
export const AgentItem = Schema.Struct({ agent: ReplicaRecord.Agent, pending: Schema.Boolean })
export type AgentItem = typeof AgentItem.Type

/**
 * The form open among the workspace's agents: adding one, with its name, the role it starts with,
 * and how it is set up; changing how one is set up; or renaming one. A setup the person left
 * wanting keeps why.
 */
export const AgentForm = defineTaggedUnion({
  Adding: { name: Schema.String, roleId: Role.RoleId, setup: AgentSetup.Draft, error: Schema.Option(Schema.String) },
  Configuring: { agentId: Identity.AgentId, setup: AgentSetup.Draft, error: Schema.Option(Schema.String) },
  Renaming: { agentId: Identity.AgentId, name: Schema.String }
})
export type AgentForm = typeof AgentForm.Type

/** The models a connection offers, as the host lists them: loading, loaded, or not reached, with why. */
export const OfferedModels = defineTaggedUnion({
  Loading: {},
  Loaded: { models: Connection.Models },
  Failed: { error: Schema.String }
})
export type OfferedModels = typeof OfferedModels.Type

/** The workspace's agents as the person manages them: the form open among them, and the models its chosen connection offers. */
export const Agents = Schema.Struct({
  form: Schema.Option(AgentForm),
  models: Schema.Option(Schema.Struct({ connectionId: ConnectionContract.ConnectionId, offered: OfferedModels }))
})
export type Agents = typeof Agents.Type

/** A channel of the workspace, and whether a change to it is on its way. */
export const ChannelItem = Schema.Struct({ channel: Channel.Channel, pending: Schema.Boolean })
export type ChannelItem = typeof ChannelItem.Type

/**
 * The form open among the workspace's channels: adding one, over a connection that gives channels,
 * into a group, called something, and opening tasks or not; or sending one's conversations to come
 * to another group.
 */
export const ChannelForm = defineTaggedUnion({
  Adding: {
    connectionId: Schema.String,
    groupId: Schema.String,
    name: Schema.String,
    opensTasks: Schema.Boolean,
    error: Schema.Option(Schema.String)
  },
  Redirecting: { channelId: ChannelId.ChannelId, groupId: Schema.String }
})
export type ChannelForm = typeof ChannelForm.Type

/** The workspace's channels as the person manages them: the form open among them. */
export const Channels = Schema.Struct({ form: Schema.Option(ChannelForm) })
export type Channels = typeof Channels.Type

/**
 * What the open workspace shows beside its groups: a group, the person's inbox, its settings, its
 * connections, its agents, or its channels.
 */
export const Pane = defineTaggedUnion({
  Group: { group: OpenGroup },
  Inbox: {},
  Settings: { settings: Settings },
  Connections: { connections: Connections },
  Agents: { agents: Agents },
  Channels: { channels: Channels }
})
export type Pane = typeof Pane.Type

/** What the person is starting beside the open group: a team, or a conversation with another member. */
export const Composing = defineTaggedUnion({
  Team: { name: Schema.String, isPublic: Schema.Boolean },
  Direct: { memberId: Schema.Option(MemberId.MemberId), text: Schema.String }
})
export type Composing = typeof Composing.Type

/**
 * The workspace the person opened, as their member of it: the workspace, and whether a change to
 * it is on its way; its store; what the replica holds of it: its groups, members, roles and their
 * assignments, invitations, the person's notifications, groups' memberships, the person's
 * follows among them, its connections, agents, channels, and the contacts its channels brought; the
 * integrations the host installs, once asked for; the
 * actions not finished yet, why the last one could not be written, what the person is starting,
 * and the pane open in it.
 */
export const Opened = Schema.Struct({
  workspace: Workspace.Workspace,
  workspacePending: Schema.Boolean,
  memberId: MemberId.MemberId,
  store: StoreState,
  groups: Schema.Array(GroupItem),
  members: Schema.Array(MemberItem),
  roles: Schema.Array(Role.Role),
  assignments: Schema.Array(AssignmentItem),
  invitations: Schema.Array(InvitationItem),
  inbox: Schema.Array(InboxItem),
  memberships: Schema.Array(MembershipItem),
  follows: Schema.Array(FollowItem),
  connections: Schema.Array(ConnectionItem),
  agents: Schema.Array(AgentItem),
  channels: Schema.Array(ChannelItem),
  contacts: Schema.Array(Contact.Contact),
  integrations: Schema.Option(Integrations),
  actions: Schema.Array(ActionItem),
  notice: Schema.Option(Schema.String),
  composing: Schema.Option(Composing),
  pane: Schema.Option(Pane)
})
export type Opened = typeof Opened.Type

export const Page = defineTaggedUnion({
  SignedOut: { form: SignInForm },
  SignedIn: { session: SignIn.Session, workspaces: Workspaces, opened: Schema.Option(Opened) }
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({ apiUrl: Schema.String, page: Page })
export type Model = typeof Model.Type
