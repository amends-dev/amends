/**
 * What the workshop remembers: the text of its fields, boxes, and composers, among them the search over its agents,
 * which switches are on, the plan chosen, a task's status, priority, and assignee, which the selects and the menus of
 * the task's properties change, which rail destination, pane tab, and thread are current, what is typed in the modals
 * and the palette and which place the palette has reached, which section of the group settings shows, whether each
 * modal is open, what each menu chose and whether it is open, and how often a button was pressed.
 */

import { Multi } from "@foldkit/ui/combobox"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
import * as RadioGroup from "@foldkit/ui/radioGroup"
import * as Schema from "effect/Schema"
import { makeApplicationDefinition } from "foldkit"
import { defineMessageUnion } from "foldkit/message"

export const Plan = Schema.Literals(["free", "team", "enterprise"])
export type Plan = typeof Plan.Type

export const TaskStatus = Schema.Literals(["triage", "todo", "doing", "held", "done", "dismissed"])
export type TaskStatus = typeof TaskStatus.Type

export const TaskPriority = Schema.Literals(["none", "low", "high"])
export type TaskPriority = typeof TaskPriority.Type

export const TaskAssignee = Schema.Literals(["", "alex", "yumi"])
export type TaskAssignee = typeof TaskAssignee.Type

export const MemberFilter = Schema.Literals(["active", "removed"])
export type MemberFilter = typeof MemberFilter.Type

export const TaskFilter = Schema.Literals(["all", "triage", "todo", "doing"])
export type TaskFilter = typeof TaskFilter.Type

export const AssigneeFilter = Schema.Literals(["anyone", "unassigned", "alex", "yumi", "review-helper"])
export type AssigneeFilter = typeof AssigneeFilter.Type

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
export const AssigneeFilterMenu = Menu.create<AssigneeFilter>()
export const TaskFilterMenu = Menu.create<TaskFilter>()
export const TaskSortMenu = Menu.create<TaskSort>()
export const TaskStatusMenu = Menu.create<TaskStatus>()
export const TaskPriorityMenu = Menu.create<TaskPriority>()
export const TaskAssigneeMenu = Menu.create<TaskAssignee>()
export const AccountMenu = Menu.create<AccountEntry>()

export const Visibility = Schema.Literals(["Public", "Private"])
export type Visibility = typeof Visibility.Type

export const MembersPicker = Multi.create()
export const VisibilityRadioGroup = RadioGroup.create<Visibility>()

/**
 * Which of the workshop's pickers a message is about: the empty one, the one with chips, and the ones in the modals.
 */
export const MemberPlace = Schema.Literals(["empty", "chosen", "create", "newMessage", "add", "list"])
export type MemberPlace = typeof MemberPlace.Type

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
  newGroupName: Schema.String,
  connectionName: Schema.String,
  connectionKey: Schema.String,
  agentName: Schema.String,
  agentRole: Schema.String,
  agentInstructions: Schema.String,
  paletteQuery: Schema.String,
  paletteActive: Schema.Int,
  openThread: Schema.String,
  destination: Destination,
  paneTab: PaneTab,
  isNotificationsOn: Schema.Boolean,
  isDigestOn: Schema.Boolean,
  isGroupPrivate: Schema.Boolean,
  isNameSending: Schema.Boolean,
  modalTab: ModalTab,
  modal: DialogBlock.Model,
  settingsModal: DialogBlock.Model,
  formModal: DialogBlock.Model,
  wideModal: DialogBlock.Model,
  paletteModal: DialogBlock.Model,
  chooserModal: DialogBlock.Model,
  confirmModal: DialogBlock.Model,
  compactModal: DialogBlock.Model,
  createModal: DialogBlock.Model,
  newMessageModal: DialogBlock.Model,
  addViewModal: DialogBlock.Model,
  emptyPicker: MembersPicker.Model,
  emptyMembers: Schema.Array(Schema.String),
  chosenPicker: MembersPicker.Model,
  chosenMembers: Schema.Array(Schema.String),
  createPicker: MembersPicker.Model,
  createMembers: Schema.Array(Schema.String),
  newMessagePicker: MembersPicker.Model,
  newMessageMembers: Schema.Array(Schema.String),
  addPicker: MembersPicker.Model,
  addMembers: Schema.Array(Schema.String),
  heldMembers: Schema.Array(Schema.String),
  listMembers: Schema.Array(Schema.String),
  listQuery: Schema.String,
  visibility: Visibility,
  visibilityGroup: VisibilityRadioGroup.Model,
  lockedVisibilityGroup: VisibilityRadioGroup.Model,
  createVisibilityGroup: VisibilityRadioGroup.Model,
  memberFilter: MemberFilter,
  memberFilterMenu: MemberFilterMenu.Model,
  assigneeFilter: AssigneeFilter,
  assigneeFilterMenu: AssigneeFilterMenu.Model,
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
  statusPropertyMenu: TaskStatusMenu.Model,
  priorityPropertyMenu: TaskPriorityMenu.Model,
  assigneePropertyMenu: TaskAssigneeMenu.Model,
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
  TypedNewGroupName: { value: Schema.String },
  OpenedThread: { key: Schema.String },
  ChangedDestination: { destination: Destination },
  ChangedPaneTab: { tab: PaneTab },
  ToggledNotifications: { isOn: Schema.Boolean },
  ToggledDigest: { isOn: Schema.Boolean },
  ToggledGroupPrivate: { isOn: Schema.Boolean },
  ToggledNameSending: { isOn: Schema.Boolean },
  ClickedOpenModal: {},
  ClickedOpenSettingsModal: {},
  ClickedOpenFormModal: {},
  ClickedOpenWideModal: {},
  ClickedOpenPaletteModal: {},
  ClickedOpenChooserModal: {},
  ClickedOpenConfirmModal: {},
  ClickedOpenCompactModal: {},
  ClickedOpenCreateModal: {},
  ClickedOpenNewMessageModal: {},
  ClickedOpenAddViewModal: {},
  ClickedCloseAddViewModal: {},
  TypedMemberListQuery: { value: Schema.String },
  PickedListMember: { id: Schema.String },
  ClickedRemoveMember: { place: MemberPlace, id: Schema.String },
  ClickedAddMembers: {},
  ClickedRemoveHeldMember: { id: Schema.String },
  TypedIntegrationQuery: { value: Schema.String },
  PickedIntegration: {},
  ChangedModalTab: { tab: ModalTab },
  SubmittedModal: {},
  SubmittedSettingsModal: {},
  SubmittedFormModal: {},
  SubmittedWideModal: {},
  TypedConnectionName: { value: Schema.String },
  TypedConnectionKey: { value: Schema.String },
  TypedAgentName: { value: Schema.String },
  TypedAgentRole: { value: Schema.String },
  TypedAgentInstructions: { value: Schema.String },
  TypedPaletteQuery: { value: Schema.String },
  MovedPaletteActive: { to: Schema.Int },
  PickedPaletteItem: {},
  SubmittedConfirmModal: {},
  SubmittedCompactModal: {},
  SubmittedCreateModal: {},
  SubmittedNewMessageModal: {},
  SubmittedAddViewModal: {},
  ChangedPlan: { plan: Plan },
  ChangedTaskStatus: { status: TaskStatus },
  ChangedTaskPriority: { priority: TaskPriority },
  ChangedTaskAssignee: { assignee: TaskAssignee }
})
export type Message = typeof Message.Type

export const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
