/**
 * The open workspace's store, as the app holds it: open while the person has a workspace open, over
 * the browser's services, and closed when they leave it or sign out; what its replica holds, as
 * messages, while it is open, the open group's threads and the open thread's messages, task, and
 * turns among them; and the actions the person writes to it. The log of a turn the person follows
 * is the one thing read from the host apart from the store, while online, since no replica holds it.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Agent } from "@amends-dev/core/agent"
import { Assignment, Role } from "@amends-dev/core/authorization"
import { Connection } from "@amends-dev/core/connection"
import type { CoreError } from "@amends-dev/core/error"
import { Group, GroupId, GroupMembership } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import { ReadState } from "@amends-dev/core/read-state"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipationId } from "@amends-dev/core/thread"
import { TurnId } from "@amends-dev/core/turn"
import { Invitation, Member, MemberId, WorkspaceId, WorkspaceSettings } from "@amends-dev/core/workspace"
import * as Accounts from "@amends-dev/gateway/Accounts"
import type * as AgentSync from "@amends-dev/sync/AgentSync"
import type * as ChannelSync from "@amends-dev/sync/ChannelSync"
import type * as ConnectionSync from "@amends-dev/sync/ConnectionSync"
import type * as GroupSync from "@amends-dev/sync/GroupSync"
import type * as NotificationSync from "@amends-dev/sync/NotificationSync"
import type * as TaskSync from "@amends-dev/sync/TaskSync"
import type * as ThreadSync from "@amends-dev/sync/ThreadSync"
import type * as TurnSync from "@amends-dev/sync/TurnSync"
import type * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Command from "foldkit/command"
import * as ManagedResource from "foldkit/managedResource"
import * as Subscription from "foldkit/subscription"
import * as Api from "./api.ts"
import * as Browser from "./browser.ts"
import { Message } from "./message.ts"
import {
  type ActionItem,
  type GroupItem,
  LogState,
  type Model,
  type OpenGroup,
  type Opened,
  type OpenThread,
  Page,
  Pane,
  StoreState
} from "./model.ts"
import * as Store from "./sync/Store.ts"

export const StoreResource = ManagedResource.tag<Store.Store["Service"]>()("Store")

/** The workspace the person has open, if any. */
const openedIn = (model: Model): Option.Option<Opened> =>
  Page.matchOrElse(model.page, { SignedIn: ({ opened }) => opened }, () => Option.none())

/** The store the model has open: whose, of which workspace as which member, and on which host. */
const openStore = (model: Model): Option.Option<Store.Options> =>
  Page.matchOrElse(
    model.page,
    {
      SignedIn: ({ session, opened }) =>
        Option.map(opened, ({ workspace, memberId }) => ({
          apiUrl: model.apiUrl,
          token: session.token,
          humanId: session.account.id,
          workspaceId: workspace.id,
          memberId
        }))
    },
    () => Option.none()
  )

/** The open workspace, once its store has opened. */
const openWorkspace = (model: Model): Option.Option<Opened> =>
  Option.filter(openedIn(model), ({ store }) => StoreState.matchOrElse(store, { Open: () => true }, () => false))

/** The group open in the workspace, once its store has opened. */
const openGroup = (model: Model): Option.Option<OpenGroup> =>
  Option.flatMap(openWorkspace(model), ({ pane }) =>
    Option.flatMap(
      pane,
      Pane.matchOrElse({ Group: ({ group }) => Option.some(group) }, () => Option.none())
    )
  )

/** The thread open in the open group, once its store has opened. */
const openThread = (model: Model): Option.Option<OpenThread> => Option.flatMap(openGroup(model), ({ thread }) => thread)

/**
 * The turn whose log the person follows, and as whom: while it is opening or open, so that following
 * it again after it failed starts anew.
 */
const followedLog = (model: Model) =>
  Page.matchOrElse(
    model.page,
    {
      SignedIn: ({ session }) =>
        Option.flatMap(openWorkspace(model), ({ workspace }) =>
          Option.flatMap(openThread(model), ({ log }) =>
            Option.map(
              Option.filter(log, ({ state }) => LogState.isAnyOf(["Opening", "Open"])(state)),
              ({ turnId }) => ({ apiUrl: model.apiUrl, token: session.token, workspaceId: workspace.id, turnId })
            )
          )
        )
    },
    () => Option.none()
  )

export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  store: entry(
    Schema.Option(
      Schema.Struct({
        apiUrl: Schema.String,
        token: Schema.String,
        humanId: Identity.HumanId,
        workspaceId: WorkspaceId.WorkspaceId,
        memberId: MemberId.MemberId
      })
    ),
    {
      resource: StoreResource,
      modelToMaybeRequirements: openStore,
      acquire: (options) =>
        Layer.build(Store.layer(options).pipe(Layer.provide(Browser.layer))).pipe(Effect.map(Context.get(Store.Store))),
      // The store closes with the scope it was acquired in.
      release: () => Effect.void,
      onAcquired: () => Message.AcquiredStore(),
      onReleased: () => Message.ReleasedStore(),
      onAcquireError: () => Message.FailedAcquireStore({ error: "This browser could not open the workspace." })
    }
  )
}))

const unreadable = Message.FailedReadStore({ error: "This browser could not read the workspace's copy." })

/** What `read` makes of the open store, as messages, while one is open. */
const fromStore = (read: (store: Store.Store["Service"]) => Stream.Stream<Message, unknown>) =>
  Stream.unwrap(
    StoreResource.get.pipe(
      Effect.map((store) => read(store).pipe(Stream.catch(() => Stream.make(unreadable)))),
      Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty))
    )
  )

const workspace = ReplicaRecord.Place.cases.Workspace.make({})
const byName = Order.mapInput(Order.String, ({ group }: GroupItem) => (Group.isGeneral(group) ? "" : nameOf(group)))

/** A group's name: a team's own, or a direct group's members, as their IDs until names are read. */
const nameOf = (group: Group.Group): string => ("name" in group ? group.name : group.memberIds.join(", "))

/** What each action does, as the person reads it. */
const whatEach: Readonly<
  Record<
    Event.Tag<
      EventGroup.Events<
        | typeof ThreadSync.Actions
        | typeof GroupSync.Actions
        | typeof WorkspaceSync.Actions
        | typeof NotificationSync.Actions
        | typeof TaskSync.Actions
        | typeof TurnSync.Actions
        | typeof ConnectionSync.Actions
        | typeof AgentSync.Actions
        | typeof ChannelSync.Actions
      >
    >,
    string
  >
> = {
  ConnectionRenamed: "rename a connection",
  ConnectionConfigured: "change a connection's settings",
  ConnectionRemoved: "remove a connection",
  AgentCreated: "add an agent",
  AgentConfigured: "change how an agent is set up",
  AgentRenamed: "rename an agent",
  ChannelCreated: "add a channel",
  ChannelRedirected: "move a channel",
  ChannelRemoved: "remove a channel",
  TaskCreated: "make a task",
  TaskUpdated: "change a task",
  TurnCancelRequested: "stop a turn",
  TurnRetried: "retry a turn",
  NotificationSeen: "mark a notification seen",
  NotificationsSeenThrough: "mark notifications seen",
  WorkspaceRenamed: "rename the workspace",
  OwnershipTransferred: "transfer ownership",
  MemberRenamed: "change your name",
  MemberRemoved: "remove a member",
  InvitationIssued: "invite someone",
  InvitationRevoked: "revoke an invitation",
  RoleAssigned: "give a role",
  RolesReplaced: "change a role",
  AssignmentRevoked: "take away a role",
  ThreadStarted: "start a thread",
  DirectThreadStarted: "start a conversation",
  ThreadRenamed: "rename a thread",
  ThreadMessagePosted: "post a reply",
  ThreadMessageEdited: "edit a message",
  ThreadMessageDeleted: "delete a message",
  ThreadFollowed: "follow a thread",
  ThreadUnfollowed: "unfollow a thread",
  ThreadMarkedRead: "mark a thread read",
  TeamCreated: "create a team",
  GroupRenamed: "rename a team",
  GroupMemberAdded: "add a member to a team",
  GroupJoined: "join a team",
  GroupMemberRemoved: "remove a member from a team",
  GroupLeft: "leave a team",
  GroupFollowed: "follow a group",
  GroupUnfollowed: "unfollow a group",
  GroupMarkedRead: "mark a group read"
}

/** The text an action carries for the person to recognize it by: a message's, or an invitation's address. */
const textOf = (payload: unknown): Option.Option<string> =>
  Predicate.hasProperty(payload, "text") && Predicate.isString(payload.text)
    ? Option.some(payload.text)
    : Predicate.hasProperty(payload, "email") && Predicate.isString(payload.email)
      ? Option.some(payload.email)
      : Option.none()

/** An action as the person reads it: which, what it does, the text it carries, and why it was refused. */
const describe = (action: Store.ActionView): ActionItem => ({
  key: action.key,
  tag: action.tag,
  what: (whatEach as Readonly<Record<string, string | undefined>>)[action.tag] ?? action.tag,
  text: textOf(action.payload),
  rejection: Option.map(action.rejection, (error: CoreError.Rejection) => error.message)
})

export const subscriptions = Subscription.make<
  Model,
  Message,
  ManagedResource.ServiceOf<typeof StoreResource> | Layer.Success<typeof Browser.layer>
>()((entry) => ({
  workspace: entry(
    { isOpen: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isOpen: Option.isSome(openWorkspace(model)) }),
      dependenciesToStream: ({ isOpen }) =>
        isOpen
          ? fromStore((store) =>
              Stream.mergeAll(
                [
                  Stream.filterMap(store.list("Workspace", workspace), ([held]) =>
                    held === undefined
                      ? Result.fail(undefined)
                      : Result.succeed(Message.GotWorkspace({ workspace: held.record.value, pending: held.pending }))
                  ),
                  Stream.map(store.list("Group", workspace), (groups): Message =>
                    Message.GotGroups({
                      groups: Array.sort(
                        groups.map(({ record, pending }) => ({ group: record.value, pending })),
                        byName
                      )
                    })
                  ),
                  Stream.map(store.list("Member", workspace), (members): Message =>
                    Message.GotMembers({
                      members: members.map(({ record, pending }) => ({ member: record.value, pending }))
                    })
                  ),
                  Stream.map(store.list("Role", workspace), (roles): Message =>
                    Message.GotRoles({ roles: roles.map(({ record }) => record.value) })
                  ),
                  Stream.map(store.list("Assignment", workspace), (assignments): Message =>
                    Message.GotAssignments({
                      assignments: assignments.map(({ record, pending }) => ({ assignment: record.value, pending }))
                    })
                  ),
                  Stream.map(store.inbox, (entries): Message =>
                    Message.GotInbox({
                      items: entries.map(({ notification, thread, opening, message }) => ({
                        notification: notification.record.value,
                        pending: notification.pending,
                        thread,
                        opening,
                        message
                      }))
                    })
                  ),
                  Stream.map(store.list("Invitation", workspace), (invitations): Message =>
                    Message.GotInvitations({
                      invitations: invitations.map(({ record, pending }) => ({ invitation: record.value, pending }))
                    })
                  ),
                  Stream.map(store.every("GroupMembership"), (memberships): Message =>
                    Message.GotMemberships({
                      memberships: memberships.map(({ record, pending }) => ({ membership: record.value, pending }))
                    })
                  ),
                  Stream.map(store.list("Agent", workspace), (agents): Message =>
                    Message.GotAgents({
                      agents: agents.map(({ record, pending }) => ({ agent: record.value, pending }))
                    })
                  ),
                  Stream.map(store.list("Connection", workspace), (connections): Message =>
                    Message.GotConnections({
                      connections: connections
                        .filter(({ record }) => record.value.status === "active")
                        .map(({ record, pending }) => ({ connection: record.value, pending }))
                    })
                  ),
                  Stream.map(store.every("GroupFollow"), (follows): Message =>
                    Message.GotFollows({
                      follows: follows.map(({ record, pending }) => ({ follow: record.value, pending }))
                    })
                  ),
                  Stream.map(store.actions, (actions): Message =>
                    Message.GotActions({ actions: actions.map(describe) })
                  )
                ],
                { concurrency: "unbounded" }
              )
            )
          : Stream.empty
    }
  ),
  group: entry(
    { groupId: Schema.Option(GroupId.GroupId) },
    {
      modelToDependencies: (model) => ({ groupId: Option.map(openGroup(model), ({ groupId }) => groupId) }),
      dependenciesToStream: ({ groupId }) =>
        Option.match(groupId, {
          onNone: () => Stream.empty,
          onSome: (groupId) =>
            fromStore((store) =>
              Stream.map(store.threads(groupId), (threads) =>
                Message.GotThreads({
                  groupId,
                  threads: threads.map(({ thread, opening, task, unread }) => ({
                    thread: thread.record.value,
                    opening,
                    task,
                    pending: thread.pending,
                    unread
                  }))
                })
              )
            )
        })
    }
  ),
  thread: entry(
    { threadId: Schema.Option(ThreadId.ThreadId) },
    {
      modelToDependencies: (model) => ({ threadId: Option.map(openThread(model), ({ threadId }) => threadId) }),
      dependenciesToStream: ({ threadId }) =>
        Option.match(threadId, {
          onNone: () => Stream.empty,
          onSome: (threadId) =>
            fromStore((store) =>
              Stream.map(store.thread(threadId), ({ messages, participation, latest, readThrough, task, turns }) =>
                Message.GotThread({
                  threadId,
                  messages: messages.map(({ record, pending }) => ({ message: record.value, pending })),
                  following: Option.map(participation, ({ record, pending }) => ({
                    participationId: record.value.id,
                    active: record.value.status === "active",
                    pending
                  })),
                  latest,
                  readThrough,
                  task: Option.map(task, ({ record, pending }) => ({ task: record.value, pending })),
                  turns: turns.map(({ turn, retryOpen }) => ({
                    turn: turn.record.value,
                    pending: turn.pending,
                    retryOpen
                  }))
                })
              )
            )
        })
    }
  ),
  turnLog: entry(
    {
      log: Schema.Option(
        Schema.Struct({
          apiUrl: Schema.String,
          token: Schema.String,
          workspaceId: WorkspaceId.WorkspaceId,
          turnId: TurnId.TurnId
        })
      )
    },
    {
      modelToDependencies: (model) => ({ log: followedLog(model) }),
      dependenciesToStream: ({ log }) =>
        Option.match(log, {
          onNone: () => Stream.empty,
          onSome: ({ apiUrl, token, workspaceId, turnId }) =>
            Stream.unwrap(
              Effect.flatMap(Api.memberClient(apiUrl, token, workspaceId), (client) =>
                client.turns.watchLog({ params: { turnId } })
              )
            ).pipe(
              Stream.map((message): Message => Message.GotTurnLog({ turnId, message })),
              Stream.catchCause(() =>
                Stream.make(
                  Message.FailedFollowLog({ turnId, error: "The log could not be followed. Check the connection." })
                )
              )
            )
        })
    }
  )
}))

const unwritable = (error: string) => Message.FailedWriteAction({ error })

/** Write an action to the open store, as `write` does. */
const toStore = (write: (store: Store.Store["Service"]) => Effect.Effect<unknown, unknown>) =>
  StoreResource.get.pipe(
    Effect.matchEffect({
      onFailure: () => Effect.succeed(unwritable("The workspace is not open.")),
      onSuccess: (store) =>
        write(store).pipe(
          Effect.as(Message.WroteAction()),
          Effect.catchCause(() => Effect.succeed(unwritable("This browser could not keep that. Try again.")))
        )
    })
  )

/** Start a thread in `groupId` with `text` as its opening message. */
export const StartThread = Command.define("StartThread", {
  args: { groupId: GroupId.GroupId, text: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ groupId, text }) =>
    Schema.decodeEffect(Thread.StartInGroupInput)({ groupId, text, mentions: [] }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A thread needs an opening message.")),
        onSuccess: (input) => toStore((store) => store.write("ThreadStarted", input))
      })
    )
})

/** Reply in `threadId` with `text`. */
export const PostReply = Command.define("PostReply", {
  args: { threadId: ThreadId.ThreadId, text: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ threadId, text }) =>
    Schema.decodeEffect(ThreadMessage.PublishInput)({ threadId, text, mentions: [] }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A reply needs some text.")),
        onSuccess: (input) => toStore((store) => store.write("ThreadMessagePosted", input))
      })
    )
})

/** Forget a refused action, once the person has seen why. */
export const Dismiss = Command.define("Dismiss", {
  args: { key: Schema.String },
  messages: [Message.CompletedDismiss],
  execute: ({ key }) =>
    StoreResource.get.pipe(
      Effect.flatMap((store) => store.dismiss(key)),
      Effect.ignore,
      Effect.as(Message.CompletedDismiss())
    )
})

/** Rename `threadId` to `title`, from the title the person saw. */
export const RenameThread = Command.define("RenameThread", {
  args: { threadId: ThreadId.ThreadId, title: Schema.String, expectedTitle: Schema.NullOr(Schema.String) },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(Thread.RenameInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A thread's title needs some text.")),
        onSuccess: (input) => toStore((store) => store.write("ThreadRenamed", input))
      })
    )
})

/** Change the text of `messageId`, from the revision the person saw. */
export const EditMessage = Command.define("EditMessage", {
  args: { messageId: ThreadMessageId.ThreadMessageId, text: Schema.String, expectedRevision: Schema.Int },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ messageId, text, expectedRevision }) =>
    Schema.decodeEffect(ThreadMessage.EditInput)({ messageId, text, mentions: [], expectedRevision }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A message needs some text.")),
        onSuccess: (input) => toStore((store) => store.write("ThreadMessageEdited", input))
      })
    )
})

/** Delete `messageId`. */
export const DeleteMessage = Command.define("DeleteMessage", {
  args: { messageId: ThreadMessageId.ThreadMessageId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ messageId }) => toStore((store) => store.write("ThreadMessageDeleted", { messageId }))
})

/** Follow `threadId`. */
export const FollowThread = Command.define("FollowThread", {
  args: { threadId: ThreadId.ThreadId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ threadId }) => toStore((store) => store.write("ThreadFollowed", { threadId }))
})

/** Stop following `threadId`, ending the person's participation in it. */
export const UnfollowThread = Command.define("UnfollowThread", {
  args: { threadId: ThreadId.ThreadId, participationId: ThreadParticipationId.ThreadParticipationId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("ThreadUnfollowed", input))
})

/** Note that the person read `threadId` through `throughSequence`. */
export const MarkThreadRead = Command.define("MarkThreadRead", {
  args: { threadId: ThreadId.ThreadId, throughSequence: Schema.Int },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(ReadState.MarkThreadReadInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(Message.WroteAction()),
        onSuccess: (input) => toStore((store) => store.write("ThreadMarkedRead", input))
      })
    )
})

/** Create a team called `name`, with `memberIds` as its members. */
export const CreateTeam = Command.define("CreateTeam", {
  args: { name: Schema.String, memberIds: Schema.Array(MemberId.MemberId), visibility: Group.Visibility },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(Group.CreateTeamInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A team needs a name.")),
        onSuccess: (input) => toStore((store) => store.write("TeamCreated", input))
      })
    )
})

/** Start a conversation with `memberId`, `text` its first message. */
export const StartDirect = Command.define("StartDirect", {
  args: { memberId: MemberId.MemberId, text: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ memberId, text }) =>
    Schema.decodeEffect(Thread.StartDirectInput)({ memberIds: [memberId], text, mentions: [] }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A conversation needs a first message.")),
        onSuccess: (input) => toStore((store) => store.write("DirectThreadStarted", input))
      })
    )
})

/** Rename the team `groupId` to `name`, from the name the person saw. */
export const RenameGroup = Command.define("RenameGroup", {
  args: { groupId: GroupId.GroupId, name: Schema.String, expectedName: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(Group.RenameInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A team needs a name.")),
        onSuccess: (input) => toStore((store) => store.write("GroupRenamed", input))
      })
    )
})

/** Admit `memberId` to `groupId`. */
export const AddGroupMember = Command.define("AddGroupMember", {
  args: { groupId: GroupId.GroupId, memberId: MemberId.MemberId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("GroupMemberAdded", input))
})

/** End the membership `membershipId` of `groupId`. */
export const RemoveGroupMember = Command.define("RemoveGroupMember", {
  args: { groupId: GroupId.GroupId, membershipId: GroupMembership.GroupMembershipId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("GroupMemberRemoved", input))
})

/** Join `groupId`. */
export const JoinGroup = Command.define("JoinGroup", {
  args: { groupId: GroupId.GroupId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("GroupJoined", input))
})

/** Leave `groupId`, ending the person's membership `membershipId`. */
export const LeaveGroup = Command.define("LeaveGroup", {
  args: { groupId: GroupId.GroupId, membershipId: GroupMembership.GroupMembershipId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("GroupLeft", input))
})

/** Follow `groupId` as `memberId`. */
export const FollowGroup = Command.define("FollowGroup", {
  args: { groupId: GroupId.GroupId, memberId: MemberId.MemberId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("GroupFollowed", input))
})

/** Stop following `groupId` as `memberId`. */
export const UnfollowGroup = Command.define("UnfollowGroup", {
  args: { groupId: GroupId.GroupId, memberId: MemberId.MemberId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("GroupUnfollowed", input))
})

/** Rename the workspace to `name`, from the name the person saw. */
export const RenameWorkspace = Command.define("RenameWorkspace", {
  args: { name: Schema.String, expectedName: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(WorkspaceSettings.RenameInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A workspace needs a name.")),
        onSuccess: (input) => toStore((store) => store.write("WorkspaceRenamed", input))
      })
    )
})

/** Change the name the person goes by in the workspace to `name`. */
export const RenameSelf = Command.define("RenameSelf", {
  args: { name: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ name }) =>
    Schema.decodeEffect(Member.NewName)(name).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("Your name can't be empty.")),
        onSuccess: (name) => toStore((store) => store.write("MemberRenamed", { name }))
      })
    )
})

/** Remove `memberId` from the workspace. */
export const RemoveMember = Command.define("RemoveMember", {
  args: { memberId: MemberId.MemberId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("MemberRemoved", input))
})

/** Give `memberId` the role `roleId` in place of the workspace roles the person saw them hold. */
export const ChangeRole = Command.define("ChangeRole", {
  args: {
    memberId: MemberId.MemberId,
    roleId: Role.RoleId,
    expectedAssignmentIds: Schema.Array(Assignment.AssignmentId)
  },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("RolesReplaced", input))
})

/** Hand the workspace to `memberId`, from the owner's assignment the person saw. */
export const TransferOwnership = Command.define("TransferOwnership", {
  args: { memberId: MemberId.MemberId, expectedOwnerAssignmentId: Assignment.AssignmentId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("OwnershipTransferred", input))
})

/** How long an invitation can be accepted for. */
const invitationLasts = { days: 7 }

/** Invite whoever `email` names, with `roleId`, for as long as an invitation lasts. */
export const Invite = Command.define("Invite", {
  args: { email: Schema.String, roleId: Role.RoleId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ email, roleId }) =>
    Schema.decodeEffect(Accounts.Email)(email).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("Enter an email address.")),
        onSuccess: (email) =>
          Effect.flatMap(DateTime.now, (now) =>
            toStore((store) =>
              store.write("InvitationIssued", { email, roleId, expiresAt: DateTime.add(now, invitationLasts) })
            )
          )
      })
    )
})

/** Revoke the invitation `invitationId`. */
export const RevokeInvitation = Command.define("RevokeInvitation", {
  args: { invitationId: Invitation.InvitationId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("InvitationRevoked", input))
})

/** Mark the notification `notificationId` seen. */
export const MarkNotificationSeen = Command.define("MarkNotificationSeen", {
  args: { notificationId: Notification.NotificationId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("NotificationSeen", input))
})

/** Mark every notification seen, up to and including the one `through` names. */
export const MarkAllNotificationsSeen = Command.define("MarkAllNotificationsSeen", {
  args: { through: NotificationStore.Cursor },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("NotificationsSeenThrough", input))
})

/** Make `threadId` a task, starting in triage. */
export const CreateTask = Command.define("CreateTask", {
  args: { threadId: ThreadId.ThreadId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("TaskCreated", input))
})

/** Change the task `threadId` tracks in one way, from the value the person saw. */
export const UpdateTask = Command.define("UpdateTask", {
  args: { threadId: ThreadId.ThreadId, change: Task.Change },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("TaskUpdated", input))
})

/** Ask the turn `turnId` to stop. */
export const StopTurn = Command.define("StopTurn", {
  args: { turnId: TurnId.TurnId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("TurnCancelRequested", input))
})

/** Run the turn `turnId` again. */
export const RetryTurn = Command.define("RetryTurn", {
  args: { turnId: TurnId.TurnId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("TurnRetried", input))
})

/** Rename `connectionId` to `name`, from the name the person saw. */
export const RenameConnection = Command.define("RenameConnection", {
  args: { connectionId: ConnectionContract.ConnectionId, name: Schema.String, expectedName: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(Connection.RenameInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A connection needs a name.")),
        onSuccess: (input) => toStore((store) => store.write("ConnectionRenamed", input))
      })
    )
})

/** Replace the settings of `connectionId` with `settings`. */
export const ConfigureConnection = Command.define("ConfigureConnection", {
  args: { connectionId: ConnectionContract.ConnectionId, settings: Connection.Settings },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(Connection.ConfigureInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A setting is too long, or holds what can't be stored.")),
        onSuccess: (input) => toStore((store) => store.write("ConnectionConfigured", input))
      })
    )
})

/** Remove `connectionId` from the workspace. */
export const RemoveConnection = Command.define("RemoveConnection", {
  args: { connectionId: ConnectionContract.ConnectionId },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (input) => toStore((store) => store.write("ConnectionRemoved", input))
})

/** Add an agent called `name`, starting with the role `roleId`, set up as `configuration` says. */
export const CreateAgent = Command.define("CreateAgent", {
  args: { name: Schema.String, roleId: Role.RoleId, configuration: Agent.Configuration },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ name, roleId, configuration }) =>
    Schema.decodeEffect(Agent.CreateInput)({ name, roleId, ...configuration }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("An agent needs a name.")),
        onSuccess: (input) => toStore((store) => store.write("AgentCreated", input))
      })
    )
})

/** Set `agentId` up as `configuration` says, in place of how it is set up. */
export const ConfigureAgent = Command.define("ConfigureAgent", {
  args: { agentId: Identity.AgentId, configuration: Agent.Configuration },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ agentId, configuration }) =>
    toStore((store) => store.write("AgentConfigured", { agentId, ...configuration }))
})

/** Rename `agentId` to `name`, from the name the person saw. */
export const RenameAgent = Command.define("RenameAgent", {
  args: { agentId: Identity.AgentId, name: Schema.String, expectedName: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: (args) =>
    Schema.decodeEffect(Agent.RenameInput)(args).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("An agent needs a name.")),
        onSuccess: (input) => toStore((store) => store.write("AgentRenamed", input))
      })
    )
})
