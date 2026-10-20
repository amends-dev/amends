/**
 * What the workshop remembers: the text of its fields, boxes, and composers, among them the search over its agents,
 * which switches are on, the plan chosen, a task's status, priority, and assignee, which rail destination, pane tab,
 * and thread are current, the group settings typed in the modals, which section of the wide one shows, whether each
 * modal is open, what each menu chose and whether it is open, and how often a button was pressed.
 */

import { DialogBlock } from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
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

export const MemberFilter = Schema.Literals(["active", "removed"])
export type MemberFilter = typeof MemberFilter.Type

export const TaskFilter = Schema.Literals(["all", "triage", "todo", "doing"])
export type TaskFilter = typeof TaskFilter.Type

export const TaskSort = Schema.Literals(["activity", "newest", "oldest"])
export type TaskSort = typeof TaskSort.Type

export const Appearance = Schema.Literals(["system", "light", "dark"])
export type Appearance = typeof Appearance.Type

/** What the account menu can be chosen for: an appearance, or one of the entries below it. */
export const AccountEntry = Schema.Literals([
  "system",
  "light",
  "dark",
  "switch-workspace",
  "settings",
  "name",
  "sign-out"
])
export type AccountEntry = typeof AccountEntry.Type

export const MemberFilterMenu = Menu.create<MemberFilter>()
export const TaskFilterMenu = Menu.create<TaskFilter>()
export const TaskSortMenu = Menu.create<TaskSort>()
export const AccountMenu = Menu.create<AccountEntry>()

export const Destination = Schema.Literals(["home", "agents", "connections", "settings"])
export type Destination = typeof Destination.Type

export const PaneTab = Schema.Literals(["threads", "tasks"])
export type PaneTab = typeof PaneTab.Type

export const ModalTab = Schema.Literals(["general", "members"])
export type ModalTab = typeof ModalTab.Type

export const Model = Schema.Struct({
  workspaceName: Schema.String,
  fullName: Schema.String,
  email: Schema.String,
  signInEmail: Schema.String,
  code: Schema.String,
  notes: Schema.String,
  agentQuery: Schema.String,
  taskQuery: Schema.String,
  composer: Schema.String,
  reply: Schema.String,
  draft: Schema.String,
  filledDraft: Schema.String,
  editText: Schema.String,
  groupName: Schema.String,
  openThread: Schema.String,
  destination: Destination,
  paneTab: PaneTab,
  isNotificationsOn: Schema.Boolean,
  isDigestOn: Schema.Boolean,
  isGroupPrivate: Schema.Boolean,
  modalTab: ModalTab,
  modal: DialogBlock.Model,
  wideModal: DialogBlock.Model,
  chooserModal: DialogBlock.Model,
  memberFilter: MemberFilter,
  memberFilterMenu: MemberFilterMenu.Model,
  taskFilter: TaskFilter,
  taskFilterMenu: TaskFilterMenu.Model,
  taskSort: TaskSort,
  taskSortMenu: TaskSortMenu.Model,
  toolbarFilterMenu: TaskFilterMenu.Model,
  toolbarSortMenu: TaskSortMenu.Model,
  membersPaneFilterMenu: MemberFilterMenu.Model,
  appearance: Appearance,
  accountMenu: AccountMenu.Model,
  railAccountMenu: AccountMenu.Model,
  accountChoice: Schema.String,
  integrationQuery: Schema.String,
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
  TypedAgentQuery: { value: Schema.String },
  TypedTaskQuery: { value: Schema.String },
  TypedComposer: { value: Schema.String },
  TypedReply: { value: Schema.String },
  TypedDraft: { value: Schema.String },
  TypedFilledDraft: { value: Schema.String },
  TypedEdit: { value: Schema.String },
  TypedGroupName: { value: Schema.String },
  OpenedThread: { key: Schema.String },
  ChangedDestination: { destination: Destination },
  ChangedPaneTab: { tab: PaneTab },
  ToggledNotifications: { isOn: Schema.Boolean },
  ToggledDigest: { isOn: Schema.Boolean },
  ToggledGroupPrivate: { isOn: Schema.Boolean },
  ClickedOpenModal: {},
  ClickedOpenWideModal: {},
  ClickedOpenChooserModal: {},
  TypedIntegrationQuery: { value: Schema.String },
  PickedIntegration: {},
  ChangedModalTab: { tab: ModalTab },
  SubmittedModal: {},
  SubmittedWideModal: {},
  ChangedPlan: { plan: Plan },
  ChangedTaskStatus: { status: TaskStatus },
  ChangedTaskPriority: { priority: TaskPriority },
  ChangedTaskAssignee: { assignee: TaskAssignee }
})
export type Message = typeof Message.Type

export const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
