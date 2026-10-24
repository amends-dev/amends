import { DialogBlock } from "@foldkit/ui/dialog"
import * as Schema from "effect/Schema"
import type { Block } from "foldkit"
import * as Update from "foldkit/update"
import { currentSidebarRowSelector } from "../src/sidebar.ts"
import {
  AccountMenu,
  Appearance,
  ApplicationDefinition,
  AssigneeFilterMenu,
  MemberFilterMenu,
  MembersPicker,
  TaskAssigneeMenu,
  TaskFilterMenu,
  TaskPriorityMenu,
  TaskSortMenu,
  TaskStatusMenu,
  VisibilityRadioGroup
} from "./definition.ts"

const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => ApplicationDefinition.makeNoopStep(),
  Closed: () => ApplicationDefinition.makeNoopStep(),
  CompletedClose: () => ApplicationDefinition.makeNoopStep()
})

export const ModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "modal",
  init: { contextToArgs: () => [{ id: "workshop-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const SettingsModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "settingsModal",
  init: { contextToArgs: () => [{ id: "workshop-settings-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const FormModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "formModal",
  init: { contextToArgs: () => [{ id: "workshop-form-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const WideModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "wideModal",
  init: { contextToArgs: () => [{ id: "workshop-wide-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const PaletteModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "paletteModal",
  init: { contextToArgs: () => [{ id: "workshop-palette-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const ChooserModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "chooserModal",
  init: { contextToArgs: () => [{ id: "workshop-chooser-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const ConfirmModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "confirmModal",
  init: { contextToArgs: () => [{ id: "workshop-confirm-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const CompactModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "compactModal",
  init: { contextToArgs: () => [{ id: "workshop-compact-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const AddViewModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "addViewModal",
  init: { contextToArgs: () => [{ id: "workshop-add-view-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const NavigationDrawerBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "navigationDrawer",
  init: { contextToArgs: () => [{ id: "workshop-navigation-drawer", focusSelector: currentSidebarRowSelector }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const CreateModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "createModal",
  init: { contextToArgs: () => [{ id: "workshop-create-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const NewMessageModalBinding = ApplicationDefinition.makeBinding(DialogBlock, {
  field: "newMessageModal",
  init: { contextToArgs: () => [{ id: "workshop-new-message-modal" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

/** Choosing a person adds them to the field, empties what was typed, and keeps the list open for the next. */
export const EmptyPickerBinding = ApplicationDefinition.makeBinding(MembersPicker, {
  field: "emptyPicker",
  init: { contextToArgs: () => [{ id: "workshop-empty-picker" }] }
}).withOutMessagePolicy({
  fold: MembersPicker.OutMessage.match({
    Selected: ({ value }) =>
      Update.combineSteps([
        ApplicationDefinition.makeFieldsStep(() => ({ emptyMembers: (members) => [...members, value] })),
        EmptyPickerBinding.requestClose(),
        EmptyPickerBinding.requestOpen()
      ]),
    ClearedSelection: () => ApplicationDefinition.makeNoopStep()
  })
})

export const ChosenPickerBinding = ApplicationDefinition.makeBinding(MembersPicker, {
  field: "chosenPicker",
  init: { contextToArgs: () => [{ id: "workshop-chosen-picker" }] }
}).withOutMessagePolicy({
  fold: MembersPicker.OutMessage.match({
    Selected: ({ value }) =>
      Update.combineSteps([
        ApplicationDefinition.makeFieldsStep(() => ({ chosenMembers: (members) => [...members, value] })),
        ChosenPickerBinding.requestClose(),
        ChosenPickerBinding.requestOpen()
      ]),
    ClearedSelection: () => ApplicationDefinition.makeNoopStep()
  })
})

export const CreatePickerBinding = ApplicationDefinition.makeBinding(MembersPicker, {
  field: "createPicker",
  init: { contextToArgs: () => [{ id: "workshop-create-picker" }] }
}).withOutMessagePolicy({
  fold: MembersPicker.OutMessage.match({
    Selected: ({ value }) =>
      Update.combineSteps([
        ApplicationDefinition.makeFieldsStep(() => ({ createMembers: (members) => [...members, value] })),
        CreatePickerBinding.requestClose(),
        CreatePickerBinding.requestOpen()
      ]),
    ClearedSelection: () => ApplicationDefinition.makeNoopStep()
  })
})

export const NewMessagePickerBinding = ApplicationDefinition.makeBinding(MembersPicker, {
  field: "newMessagePicker",
  init: { contextToArgs: () => [{ id: "workshop-new-message-picker" }] }
}).withOutMessagePolicy({
  fold: MembersPicker.OutMessage.match({
    Selected: ({ value }) =>
      Update.combineSteps([
        ApplicationDefinition.makeFieldsStep(() => ({ newMessageMembers: (members) => [...members, value] })),
        NewMessagePickerBinding.requestClose(),
        NewMessagePickerBinding.requestOpen()
      ]),
    ClearedSelection: () => ApplicationDefinition.makeNoopStep()
  })
})

export const AddPickerBinding = ApplicationDefinition.makeBinding(MembersPicker, {
  field: "addPicker",
  init: { contextToArgs: () => [{ id: "workshop-add-picker" }] }
}).withOutMessagePolicy({
  fold: MembersPicker.OutMessage.match({
    Selected: ({ value }) =>
      Update.combineSteps([
        ApplicationDefinition.makeFieldsStep(() => ({ addMembers: (members) => [...members, value] })),
        AddPickerBinding.requestClose(),
        AddPickerBinding.requestOpen()
      ]),
    ClearedSelection: () => ApplicationDefinition.makeNoopStep()
  })
})

export const VisibilityBinding = ApplicationDefinition.makeBinding(VisibilityRadioGroup, {
  field: "visibilityGroup",
  init: { contextToArgs: () => [{ id: "workshop-visibility" }] }
}).withOutMessagePolicy({
  fold: VisibilityRadioGroup.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ visibility: () => value }))
  })
})

export const LockedVisibilityBinding = ApplicationDefinition.makeBinding(VisibilityRadioGroup, {
  field: "lockedVisibilityGroup",
  init: { contextToArgs: () => [{ id: "workshop-locked-visibility" }] }
}).withOutMessagePolicy({
  fold: VisibilityRadioGroup.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ visibility: () => value }))
  })
})

export const CreateVisibilityBinding = ApplicationDefinition.makeBinding(VisibilityRadioGroup, {
  field: "createVisibilityGroup",
  init: { contextToArgs: () => [{ id: "workshop-create-visibility" }] }
}).withOutMessagePolicy({
  fold: VisibilityRadioGroup.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ visibility: () => value }))
  })
})

export const MemberFilterBinding = ApplicationDefinition.makeBinding(MemberFilterMenu, {
  field: "memberFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-member-filter" }] }
}).withOutMessagePolicy({
  fold: MemberFilterMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ memberFilter: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const AssigneeFilterBinding = ApplicationDefinition.makeBinding(AssigneeFilterMenu, {
  field: "assigneeFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-assignee-filter" }] }
}).withOutMessagePolicy({
  fold: AssigneeFilterMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ assigneeFilter: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const TaskFilterBinding = ApplicationDefinition.makeBinding(TaskFilterMenu, {
  field: "taskFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-task-filter" }] }
}).withOutMessagePolicy({
  fold: TaskFilterMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskFilter: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const TaskSortBinding = ApplicationDefinition.makeBinding(TaskSortMenu, {
  field: "taskSortMenu",
  init: { contextToArgs: () => [{ id: "workshop-task-sort" }] }
}).withOutMessagePolicy({
  fold: TaskSortMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskSort: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

/** Choosing from a menu of a task's properties changes the property the selects of the fields show too. */
export const TaskStatusBinding = ApplicationDefinition.makeBinding(TaskStatusMenu, {
  field: "statusPropertyMenu",
  init: { contextToArgs: () => [{ id: "workshop-status-property" }] }
}).withOutMessagePolicy({
  fold: TaskStatusMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskStatus: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const TaskPriorityBinding = ApplicationDefinition.makeBinding(TaskPriorityMenu, {
  field: "priorityPropertyMenu",
  init: { contextToArgs: () => [{ id: "workshop-priority-property" }] }
}).withOutMessagePolicy({
  fold: TaskPriorityMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskPriority: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const TaskAssigneeBinding = ApplicationDefinition.makeBinding(TaskAssigneeMenu, {
  field: "assigneePropertyMenu",
  init: { contextToArgs: () => [{ id: "workshop-assignee-property" }] }
}).withOutMessagePolicy({
  fold: TaskAssigneeMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskAssignee: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

/** The toolbar over the tasks and the roster have menus of their own, since a Block's ids are for one place. */
export const ToolbarFilterBinding = ApplicationDefinition.makeBinding(TaskFilterMenu, {
  field: "toolbarFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-toolbar-filter" }] }
}).withOutMessagePolicy({
  fold: TaskFilterMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskFilter: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const ToolbarSortBinding = ApplicationDefinition.makeBinding(TaskSortMenu, {
  field: "toolbarSortMenu",
  init: { contextToArgs: () => [{ id: "workshop-toolbar-sort" }] }
}).withOutMessagePolicy({
  fold: TaskSortMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ taskSort: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

export const MembersPaneFilterBinding = ApplicationDefinition.makeBinding(MemberFilterMenu, {
  field: "membersPaneFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-members-pane-filter" }] }
}).withOutMessagePolicy({
  fold: MemberFilterMenu.OutMessage.match({
    Selected: ({ value }) => ApplicationDefinition.makeFieldsStep(() => ({ memberFilter: () => value })),
    Closed: () => ApplicationDefinition.makeNoopStep()
  })
})

/** Choosing an appearance moves the check; choosing another entry is only remembered, to show it was chosen. */
const foldAccountOutMessage = AccountMenu.OutMessage.match({
  Selected: ({ value }) =>
    Schema.is(Appearance)(value)
      ? ApplicationDefinition.makeFieldsStep(() => ({ appearance: () => value, accountChoice: () => value }))
      : ApplicationDefinition.makeFieldsStep(() => ({ accountChoice: () => value })),
  Closed: () => ApplicationDefinition.makeNoopStep()
})

export const AccountBinding = ApplicationDefinition.makeBinding(AccountMenu, {
  field: "accountMenu",
  init: { contextToArgs: () => [{ id: "workshop-account" }] }
}).withOutMessagePolicy({ fold: foldAccountOutMessage })

export const RailAccountBinding = ApplicationDefinition.makeBinding(AccountMenu, {
  field: "railAccountMenu",
  init: { contextToArgs: () => [{ id: "workshop-rail-account" }] }
}).withOutMessagePolicy({ fold: foldAccountOutMessage })

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [
    ModalBinding,
    SettingsModalBinding,
    FormModalBinding,
    WideModalBinding,
    PaletteModalBinding,
    ChooserModalBinding,
    ConfirmModalBinding,
    CompactModalBinding,
    CreateModalBinding,
    NewMessageModalBinding,
    AddViewModalBinding,
    NavigationDrawerBinding,
    EmptyPickerBinding,
    ChosenPickerBinding,
    CreatePickerBinding,
    NewMessagePickerBinding,
    AddPickerBinding,
    VisibilityBinding,
    LockedVisibilityBinding,
    CreateVisibilityBinding,
    MemberFilterBinding,
    AssigneeFilterBinding,
    TaskFilterBinding,
    TaskSortBinding,
    TaskStatusBinding,
    TaskPriorityBinding,
    TaskAssigneeBinding,
    ToolbarFilterBinding,
    ToolbarSortBinding,
    MembersPaneFilterBinding,
    AccountBinding,
    RailAccountBinding
  ]
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
