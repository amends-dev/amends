import { DialogBlock } from "@foldkit/ui/dialog"
import * as Schema from "effect/Schema"
import type { Block } from "foldkit"
import {
  AccountMenu,
  Appearance,
  ApplicationDefinition,
  AssigneeFilterMenu,
  MemberFilterMenu,
  TaskFilterMenu,
  TaskSortMenu
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
    MemberFilterBinding,
    AssigneeFilterBinding,
    TaskFilterBinding,
    TaskSortBinding,
    ToolbarFilterBinding,
    ToolbarSortBinding,
    MembersPaneFilterBinding,
    AccountBinding,
    RailAccountBinding
  ]
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
