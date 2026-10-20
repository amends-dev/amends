import { DialogBlock } from "@foldkit/ui/dialog"
import * as Schema from "effect/Schema"
import type { Block } from "foldkit"
import * as Update from "foldkit/update"
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
  Opened: () => ApplicationDefinition.stepNoop(),
  Closed: () => ApplicationDefinition.stepNoop(),
  CompletedClose: () => ApplicationDefinition.stepNoop()
})

export const ModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "modal",
  init: { contextToArgs: () => [{ id: "workshop-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const WideModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "wideModal",
  init: { contextToArgs: () => [{ id: "workshop-wide-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const ChooserModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "chooserModal",
  init: { contextToArgs: () => [{ id: "workshop-chooser-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const ConfirmModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "confirmModal",
  init: { contextToArgs: () => [{ id: "workshop-confirm-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const CompactModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "compactModal",
  init: { contextToArgs: () => [{ id: "workshop-compact-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const AddViewModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "addViewModal",
  init: { contextToArgs: () => [{ id: "workshop-add-view-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const CreateModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "createModal",
  init: { contextToArgs: () => [{ id: "workshop-create-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

/** Choosing a person adds them to the field, empties what was typed, and keeps the list open for the next. */
export const EmptyPickerBinding = ApplicationDefinition.bindChild(MembersPicker, {
  field: "emptyPicker",
  init: { contextToArgs: () => [{ id: "workshop-empty-picker" }] },
  outMessage: {
    fold: MembersPicker.OutMessage.match({
      Selected: ({ value }) =>
        Update.combine([
          ApplicationDefinition.stepFields(() => ({ emptyMembers: (members) => [...members, value] })),
          EmptyPickerBinding.requestClose(),
          EmptyPickerBinding.requestOpen()
        ]),
      ClearedSelection: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const ChosenPickerBinding = ApplicationDefinition.bindChild(MembersPicker, {
  field: "chosenPicker",
  init: { contextToArgs: () => [{ id: "workshop-chosen-picker" }] },
  outMessage: {
    fold: MembersPicker.OutMessage.match({
      Selected: ({ value }) =>
        Update.combine([
          ApplicationDefinition.stepFields(() => ({ chosenMembers: (members) => [...members, value] })),
          ChosenPickerBinding.requestClose(),
          ChosenPickerBinding.requestOpen()
        ]),
      ClearedSelection: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const CreatePickerBinding = ApplicationDefinition.bindChild(MembersPicker, {
  field: "createPicker",
  init: { contextToArgs: () => [{ id: "workshop-create-picker" }] },
  outMessage: {
    fold: MembersPicker.OutMessage.match({
      Selected: ({ value }) =>
        Update.combine([
          ApplicationDefinition.stepFields(() => ({ createMembers: (members) => [...members, value] })),
          CreatePickerBinding.requestClose(),
          CreatePickerBinding.requestOpen()
        ]),
      ClearedSelection: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const AddPickerBinding = ApplicationDefinition.bindChild(MembersPicker, {
  field: "addPicker",
  init: { contextToArgs: () => [{ id: "workshop-add-picker" }] },
  outMessage: {
    fold: MembersPicker.OutMessage.match({
      Selected: ({ value }) =>
        Update.combine([
          ApplicationDefinition.stepFields(() => ({ addMembers: (members) => [...members, value] })),
          AddPickerBinding.requestClose(),
          AddPickerBinding.requestOpen()
        ]),
      ClearedSelection: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const VisibilityBinding = ApplicationDefinition.bindChild(VisibilityRadioGroup, {
  field: "visibilityGroup",
  init: { contextToArgs: () => [{ id: "workshop-visibility" }] },
  outMessage: {
    fold: VisibilityRadioGroup.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ visibility: () => value }))
    })
  }
})

export const LockedVisibilityBinding = ApplicationDefinition.bindChild(VisibilityRadioGroup, {
  field: "lockedVisibilityGroup",
  init: { contextToArgs: () => [{ id: "workshop-locked-visibility" }] },
  outMessage: {
    fold: VisibilityRadioGroup.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ visibility: () => value }))
    })
  }
})

export const CreateVisibilityBinding = ApplicationDefinition.bindChild(VisibilityRadioGroup, {
  field: "createVisibilityGroup",
  init: { contextToArgs: () => [{ id: "workshop-create-visibility" }] },
  outMessage: {
    fold: VisibilityRadioGroup.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ visibility: () => value }))
    })
  }
})

export const MemberFilterBinding = ApplicationDefinition.bindChild(MemberFilterMenu, {
  field: "memberFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-member-filter" }] },
  outMessage: {
    fold: MemberFilterMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ memberFilter: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const AssigneeFilterBinding = ApplicationDefinition.bindChild(AssigneeFilterMenu, {
  field: "assigneeFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-assignee-filter" }] },
  outMessage: {
    fold: AssigneeFilterMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ assigneeFilter: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const TaskFilterBinding = ApplicationDefinition.bindChild(TaskFilterMenu, {
  field: "taskFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-task-filter" }] },
  outMessage: {
    fold: TaskFilterMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskFilter: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const TaskSortBinding = ApplicationDefinition.bindChild(TaskSortMenu, {
  field: "taskSortMenu",
  init: { contextToArgs: () => [{ id: "workshop-task-sort" }] },
  outMessage: {
    fold: TaskSortMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskSort: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

/** Choosing from a menu of a task's properties changes the property the selects of the fields show too. */
export const TaskStatusBinding = ApplicationDefinition.bindChild(TaskStatusMenu, {
  field: "statusPropertyMenu",
  init: { contextToArgs: () => [{ id: "workshop-status-property" }] },
  outMessage: {
    fold: TaskStatusMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskStatus: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const TaskPriorityBinding = ApplicationDefinition.bindChild(TaskPriorityMenu, {
  field: "priorityPropertyMenu",
  init: { contextToArgs: () => [{ id: "workshop-priority-property" }] },
  outMessage: {
    fold: TaskPriorityMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskPriority: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const TaskAssigneeBinding = ApplicationDefinition.bindChild(TaskAssigneeMenu, {
  field: "assigneePropertyMenu",
  init: { contextToArgs: () => [{ id: "workshop-assignee-property" }] },
  outMessage: {
    fold: TaskAssigneeMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskAssignee: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

/** The toolbar over the tasks and the roster have menus of their own, since a Block's ids are for one place. */
export const ToolbarFilterBinding = ApplicationDefinition.bindChild(TaskFilterMenu, {
  field: "toolbarFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-toolbar-filter" }] },
  outMessage: {
    fold: TaskFilterMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskFilter: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const ToolbarSortBinding = ApplicationDefinition.bindChild(TaskSortMenu, {
  field: "toolbarSortMenu",
  init: { contextToArgs: () => [{ id: "workshop-toolbar-sort" }] },
  outMessage: {
    fold: TaskSortMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ taskSort: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

export const MembersPaneFilterBinding = ApplicationDefinition.bindChild(MemberFilterMenu, {
  field: "membersPaneFilterMenu",
  init: { contextToArgs: () => [{ id: "workshop-members-pane-filter" }] },
  outMessage: {
    fold: MemberFilterMenu.OutMessage.match({
      Selected: ({ value }) => ApplicationDefinition.stepFields(() => ({ memberFilter: () => value })),
      Closed: () => ApplicationDefinition.stepNoop()
    })
  }
})

/** Choosing an appearance moves the check; choosing another entry is only remembered, to show it was chosen. */
const foldAccountOutMessage = AccountMenu.OutMessage.match({
  Selected: ({ value }) =>
    Schema.is(Appearance)(value)
      ? ApplicationDefinition.stepFields(() => ({ appearance: () => value, accountChoice: () => value }))
      : ApplicationDefinition.stepFields(() => ({ accountChoice: () => value })),
  Closed: () => ApplicationDefinition.stepNoop()
})

export const AccountBinding = ApplicationDefinition.bindChild(AccountMenu, {
  field: "accountMenu",
  init: { contextToArgs: () => [{ id: "workshop-account" }] },
  outMessage: { fold: foldAccountOutMessage }
})

export const RailAccountBinding = ApplicationDefinition.bindChild(AccountMenu, {
  field: "railAccountMenu",
  init: { contextToArgs: () => [{ id: "workshop-rail-account" }] },
  outMessage: { fold: foldAccountOutMessage }
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [
    ModalBinding,
    WideModalBinding,
    ChooserModalBinding,
    ConfirmModalBinding,
    CompactModalBinding,
    CreateModalBinding,
    AddViewModalBinding,
    EmptyPickerBinding,
    ChosenPickerBinding,
    CreatePickerBinding,
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
