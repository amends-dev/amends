/**
 * The task a thread tracks: its status, priority, and assignee, which the person changes from what
 * they saw, when they may; or, while the thread tracks none, making it one, when they may create
 * tasks in its group.
 */

import { AgentPermissions } from "@amends-dev/core/agent"
import { Grant } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Task } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { may, memberTarget } from "../../permissions.ts"

/** The task, and whether a change to it is on its way. */
export const TaskItem = Schema.Struct({ task: Task.Task, pending: Schema.Boolean })
export type TaskItem = typeof TaskItem.Type

/**
 * The thread's group, once the thread is read, the task it tracks, the group's members, what the
 * person may do, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  threadId: ThreadId.ThreadId,
  groupId: Schema.Option(GroupId.GroupId),
  task: Schema.Option(TaskItem),
  members: Schema.Array(Member.Member),
  grants: Schema.Array(Grant.Grant),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedTask: { groupId: Schema.Option(GroupId.GroupId), task: Schema.Option(TaskItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  FailedRead: { error: Schema.String },
  ClickedMakeTask: {},
  ChoseStatus: { status: Task.Status },
  ChosePriority: { priority: Task.Priority },
  ChoseAssignee: { memberId: Schema.Option(MemberId.MemberId) },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const TaskDefinition = Block.makeDefinition("Task", { Model, Message })

/**
 * Whom the person may assign the task to: the group's members, and among them only the agents the
 * person may use, since assigning one directs it.
 */
export const assignable = (model: Model): ReadonlyArray<Member.Member> =>
  model.members.filter(
    (member) =>
      Identity.MemberReference.isAnyOf(["Human"])(member.identity) ||
      may(model.grants, AgentPermissions.Use, memberTarget(model.workspaceId, member.id))
  )
