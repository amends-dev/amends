/**
 * The core operation each action runs: one for every action a member's browser writes, by its tag,
 * with its payload as the action carries it. An entry that is no action, or whose payload does not
 * decode, runs as an operation that fails as `Invalid`, which rejects it.
 */

import type { Core } from "@amends-dev/core"
import { AgentService } from "@amends-dev/core/agent"
import { AssignmentService } from "@amends-dev/core/authorization"
import { ChannelService } from "@amends-dev/core/channel"
import { ConnectionService } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { GroupFollowService, GroupMembershipService, GroupService } from "@amends-dev/core/group"
import type { Actor } from "@amends-dev/core/identity"
import { NotificationService } from "@amends-dev/core/notification"
import { ReadStateService } from "@amends-dev/core/read-state"
import { TaskService } from "@amends-dev/core/task"
import { ThreadMessageService, ThreadParticipationService, ThreadService } from "@amends-dev/core/thread"
import { TurnService } from "@amends-dev/core/turn"
import {
  InvitationService,
  MemberService,
  OwnershipService,
  WorkspaceSettingsService
} from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import type * as EventJournal from "effect/eventlog/EventJournal"
import * as Schema from "effect/Schema"
import * as AgentSync from "../AgentSync.ts"
import * as ChannelSync from "../ChannelSync.ts"
import * as ConnectionSync from "../ConnectionSync.ts"
import * as GroupSync from "../GroupSync.ts"
import * as NotificationSync from "../NotificationSync.ts"
import * as TaskSync from "../TaskSync.ts"
import * as ThreadSync from "../ThreadSync.ts"
import * as TurnSync from "../TurnSync.ts"
import * as WorkspaceSync from "../WorkspaceSync.ts"

/** What running an action asks of a workspace: its operations, as the acting member. */
type Operation = Effect.Effect<unknown, CoreError.CoreError, Core.Operations | Actor.Actor>

/** The operation of each of a group's actions, given its payload. */
type Operations<Group extends EventGroup.Any> = {
  readonly [Tag in Event.Tag<EventGroup.Events<Group>>]: (
    payload: Event.PayloadWithTag<EventGroup.Events<Group>, Tag>
  ) => Operation
}

const workspace: Operations<typeof WorkspaceSync.Actions> = {
  WorkspaceRenamed: (input) =>
    Effect.flatMap(WorkspaceSettingsService.WorkspaceSettingsService, (service) => service.rename(input)),
  OwnershipTransferred: (input) =>
    Effect.flatMap(OwnershipService.OwnershipService, (service) => service.transfer(input)),
  MemberRenamed: ({ name }) => Effect.flatMap(MemberService.MemberService, (service) => service.rename(name)),
  MemberRemoved: ({ memberId }) => Effect.flatMap(MemberService.MemberService, (service) => service.remove(memberId)),
  InvitationIssued: (input) => Effect.flatMap(InvitationService.InvitationService, (service) => service.issue(input)),
  InvitationRevoked: ({ invitationId }) =>
    Effect.flatMap(InvitationService.InvitationService, (service) => service.revoke(invitationId)),
  RoleAssigned: (input) => Effect.flatMap(AssignmentService.AssignmentService, (service) => service.assign(input)),
  RolesReplaced: (input) => Effect.flatMap(AssignmentService.AssignmentService, (service) => service.change(input)),
  AssignmentRevoked: ({ memberId, assignmentId }) =>
    Effect.flatMap(AssignmentService.AssignmentService, (service) => service.revoke(memberId, assignmentId))
}

const group: Operations<typeof GroupSync.Actions> = {
  TeamCreated: (input) => Effect.flatMap(GroupService.GroupService, (service) => service.createTeam(input)),
  GroupRenamed: (input) => Effect.flatMap(GroupService.GroupService, (service) => service.rename(input)),
  GroupMemberAdded: (input) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (service) => service.add(input)),
  GroupJoined: ({ groupId }) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (service) => service.join(groupId)),
  GroupMemberRemoved: (input) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (service) => service.remove(input)),
  GroupLeft: (input) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (service) => service.leave(input)),
  GroupFollowed: (input) => Effect.flatMap(GroupFollowService.GroupFollowService, (service) => service.follow(input)),
  GroupUnfollowed: (input) =>
    Effect.flatMap(GroupFollowService.GroupFollowService, (service) => service.unfollow(input)),
  GroupMarkedRead: (input) =>
    Effect.flatMap(ReadStateService.ReadStateService, (service) => service.markGroupRead(input))
}

const thread: Operations<typeof ThreadSync.Actions> = {
  ThreadStarted: (input) => Effect.flatMap(ThreadService.ThreadService, (service) => service.startInGroup(input)),
  DirectThreadStarted: (input) => Effect.flatMap(ThreadService.ThreadService, (service) => service.startDirect(input)),
  ThreadRenamed: (input) => Effect.flatMap(ThreadService.ThreadService, (service) => service.rename(input)),
  ThreadMessagePosted: (input) =>
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (service) => service.publish(input)),
  ThreadMessageEdited: (input) =>
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (service) => service.edit(input)),
  ThreadMessageDeleted: ({ messageId }) =>
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (service) => service.delete(messageId)),
  ThreadFollowed: ({ threadId }) =>
    Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (service) => service.follow(threadId)),
  ThreadUnfollowed: (input) =>
    Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (service) => service.unfollow(input)),
  ThreadMarkedRead: (input) =>
    Effect.flatMap(ReadStateService.ReadStateService, (service) => service.markThreadRead(input))
}

const task: Operations<typeof TaskSync.Actions> = {
  TaskCreated: (input) => Effect.flatMap(TaskService.TaskService, (service) => service.create(input)),
  TaskUpdated: (input) => Effect.flatMap(TaskService.TaskService, (service) => service.update(input))
}

const turn: Operations<typeof TurnSync.Actions> = {
  TurnCancelRequested: ({ turnId }) => Effect.flatMap(TurnService.TurnService, (service) => service.cancel(turnId)),
  TurnRetried: ({ turnId }) => Effect.flatMap(TurnService.TurnService, (service) => service.retry(turnId))
}

const notification: Operations<typeof NotificationSync.Actions> = {
  NotificationSeen: ({ notificationId }) =>
    Effect.flatMap(NotificationService.NotificationService, (service) => service.markSeen(notificationId)),
  NotificationsSeenThrough: ({ through }) =>
    Effect.flatMap(NotificationService.NotificationService, (service) => service.markSeenThrough(through))
}

const connection: Operations<typeof ConnectionSync.Actions> = {
  ConnectionRenamed: (input) => Effect.flatMap(ConnectionService.ConnectionService, (service) => service.rename(input)),
  ConnectionConfigured: (input) =>
    Effect.flatMap(ConnectionService.ConnectionService, (service) => service.configure(input)),
  ConnectionRemoved: ({ connectionId }) =>
    Effect.flatMap(ConnectionService.ConnectionService, (service) => service.remove(connectionId))
}

const agent: Operations<typeof AgentSync.Actions> = {
  AgentCreated: (input) => Effect.flatMap(AgentService.AgentService, (service) => service.create(input)),
  AgentConfigured: (input) => Effect.flatMap(AgentService.AgentService, (service) => service.configure(input)),
  AgentRenamed: (input) => Effect.flatMap(AgentService.AgentService, (service) => service.rename(input))
}

const channel: Operations<typeof ChannelSync.Actions> = {
  ChannelCreated: (input) => Effect.flatMap(ChannelService.ChannelService, (service) => service.create(input)),
  ChannelRedirected: (input) => Effect.flatMap(ChannelService.ChannelService, (service) => service.redirect(input)),
  ChannelRemoved: ({ channelId }) =>
    Effect.flatMap(ChannelService.ChannelService, (service) => service.remove(channelId))
}

/** Each action's event, which decodes its payload, and its operation, by tag. */
const actions = new Map(
  (
    [
      [WorkspaceSync.Actions, workspace],
      [GroupSync.Actions, group],
      [ThreadSync.Actions, thread],
      [TaskSync.Actions, task],
      [TurnSync.Actions, turn],
      [NotificationSync.Actions, notification],
      [ConnectionSync.Actions, connection],
      [AgentSync.Actions, agent],
      [ChannelSync.Actions, channel]
    ] as const
  ).flatMap(([actionGroup, operations]) =>
    Object.values((actionGroup as EventGroup.EventGroup<Event.Any>).events).map(
      (event) =>
        [
          event.tag,
          {
            event,
            // Every action's operation takes the payload its own event decodes.
            run: (operations as Readonly<Record<string, (payload: unknown) => Operation>>)[event.tag]!
          }
        ] as const
    )
  )
)

const invalid = (description: string) =>
  Effect.fail(new CoreError.Invalid({ reason: new CoreError.Malformed({ description }) }))

/**
 * The operation `entry` asks for: its action's, with its payload, or a failure as `Invalid` when it
 * is no action or its payload does not decode.
 */
export const operationOf = (entry: EventJournal.Entry): Operation => {
  const action = actions.get(entry.event)
  if (action === undefined) return invalid(`${entry.event} is no action`)
  return Schema.decodeEffect(action.event.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>)(entry.payload).pipe(
    Effect.catchTag("SchemaError", (error) => invalid(error.message)),
    Effect.flatMap(action.run)
  )
}
