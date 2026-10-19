/** The person's unfinished actions, read from their store as they change. */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import type * as AgentSync from "@amends-dev/sync/AgentSync"
import type * as ChannelSync from "@amends-dev/sync/ChannelSync"
import type * as ConnectionSync from "@amends-dev/sync/ConnectionSync"
import type * as GroupSync from "@amends-dev/sync/GroupSync"
import type * as NotificationSync from "@amends-dev/sync/NotificationSync"
import type * as TaskSync from "@amends-dev/sync/TaskSync"
import type * as ThreadSync from "@amends-dev/sync/ThreadSync"
import type * as TurnSync from "@amends-dev/sync/TurnSync"
import type * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Stream from "effect/Stream"
import type * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { type ActionItem, ActionsDefinition, Message } from "./definition.ts"

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

/** An action as the person reads it. */
const describe = (action: Store.ActionView): ActionItem => ({
  key: action.key,
  tag: action.tag,
  what: (whatEach as Readonly<Record<string, string | undefined>>)[action.tag] ?? action.tag,
  text: textOf(action.payload),
  rejection: Option.map(action.rejection, (error) => error.message)
})

export const subscriptions = ActionsDefinition.subscriptions((entry) => ({
  actions: entry(
    "ReadActions",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedActions, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.map(store.actions, (actions) => Message.ReceivedActions({ actions: actions.map(describe) }))
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
