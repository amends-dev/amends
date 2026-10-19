/**
 * What the workshop remembers: the text of its fields, boxes, and composers, which switches are on, the plan
 * chosen, a task's status, priority, and assignee, which rail destination, pane tab, and thread are current,
 * and how often a button was pressed.
 */

import * as Schema from "effect/Schema"
import { makeApplicationDefinition } from "foldkit"
import { defineMessageUnion } from "foldkit/message"

export const Plan = Schema.Literals(["free", "team", "enterprise"])
export type Plan = typeof Plan.Type

export const TaskStatus = Schema.Literals(["triage", "todo", "doing"])
export type TaskStatus = typeof TaskStatus.Type

export const TaskPriority = Schema.Literals(["none", "low", "high"])
export type TaskPriority = typeof TaskPriority.Type

export const TaskAssignee = Schema.Literals(["", "alex", "yumi"])
export type TaskAssignee = typeof TaskAssignee.Type

export const Destination = Schema.Literals(["home", "connections", "agents", "channels", "settings"])
export type Destination = typeof Destination.Type

export const PaneTab = Schema.Literals(["threads", "tasks"])
export type PaneTab = typeof PaneTab.Type

export const Model = Schema.Struct({
  workspaceName: Schema.String,
  fullName: Schema.String,
  email: Schema.String,
  signInEmail: Schema.String,
  code: Schema.String,
  notes: Schema.String,
  composer: Schema.String,
  reply: Schema.String,
  draft: Schema.String,
  filledDraft: Schema.String,
  editText: Schema.String,
  openThread: Schema.String,
  destination: Destination,
  paneTab: PaneTab,
  isNotificationsOn: Schema.Boolean,
  isDigestOn: Schema.Boolean,
  plan: Plan,
  taskStatus: TaskStatus,
  taskPriority: TaskPriority,
  taskAssignee: TaskAssignee,
  pressCount: Schema.Finite
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedButton: {},
  TypedWorkspaceName: { value: Schema.String },
  TypedFullName: { value: Schema.String },
  TypedEmail: { value: Schema.String },
  TypedSignInEmail: { value: Schema.String },
  TypedCode: { value: Schema.String },
  TypedNotes: { value: Schema.String },
  TypedComposer: { value: Schema.String },
  TypedReply: { value: Schema.String },
  TypedDraft: { value: Schema.String },
  TypedFilledDraft: { value: Schema.String },
  TypedEdit: { value: Schema.String },
  OpenedThread: { key: Schema.String },
  ChangedDestination: { destination: Destination },
  ChangedPaneTab: { tab: PaneTab },
  ToggledNotifications: { isOn: Schema.Boolean },
  ToggledDigest: { isOn: Schema.Boolean },
  ChangedPlan: { plan: Plan },
  ChangedTaskStatus: { status: TaskStatus },
  ChangedTaskPriority: { priority: TaskPriority },
  ChangedTaskAssignee: { assignee: TaskAssignee }
})
export type Message = typeof Message.Type

export const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
