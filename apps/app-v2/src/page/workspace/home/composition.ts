import { GroupId } from "@amends-dev/core/group"
import type { ThreadId } from "@amends-dev/core/thread"
import { isAsideInDialog } from "@amends-dev/design/shell"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { GroupBlock } from "../../../feature/group/block.ts"
import { GroupsBlock } from "../../../feature/groups/block.ts"
import { InboxBlock } from "../../../feature/inbox/block.ts"
import { TasksBlock } from "../../../feature/tasks/block.ts"
import { HomeDefinition, type Model, Open, OutMessage } from "./definition.ts"

/** Open the group `groupId` in the main pane, with the thread `threadId` open in it, if there is one. */
const openGroup = (groupId: GroupId.GroupId, threadId: Option.Option<ThreadId.ThreadId>) =>
  HomeDefinition.step((model: Model) =>
    GroupBinding.init({
      key: groupId,
      args: [model.workspaceId, model.memberId, groupId, threadId],
      toParentModel: (group) => modifyFields(model, { open: () => Open.Group({ groupId, model: group }) })
    })
  )

/** Show the inbox in the main pane. */
export const showInbox = HomeDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Inbox() })
}))

/** Show the tasks in triage in the main pane. */
export const showTriage = HomeDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Triage() })
}))

/** Show every open task in the main pane. */
export const showTasks = HomeDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Tasks() })
}))

/** Show the groups to browse in the main pane. */
export const showGroups = HomeDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Groups() })
}))

/**
 * Switch to a list of Home, as the sidebar does: close the side pane's dialog and the thread beside the inbox, leave
 * no group marked in the sidebar, and `show` the list.
 */
export const switchTo = (show: typeof showInbox) =>
  Update.combine([
    hideAside,
    InboxBinding.requestCloseThread(),
    GroupsBinding.informOpenGroup({ groupId: Option.none() }),
    show
  ])

/** Open the group `groupId` without a thread, and close the side pane's dialog and the thread beside the inbox. */
export const openGroupAlone = (groupId: GroupId.GroupId) =>
  Update.combine([hideAside, InboxBinding.requestCloseThread(), openGroup(groupId, Option.none())])

/**
 * Open the group `groupId` with the thread `threadId` open in it, mark the group open in the list, close the thread
 * beside the inbox, and open the side pane's dialog where the pane is one.
 */
export const openThreadInGroup = (groupId: GroupId.GroupId, threadId: ThreadId.ThreadId) =>
  Update.combine([
    InboxBinding.requestCloseThread(),
    GroupsBinding.informOpenGroup({ groupId: Option.some(groupId) }),
    openGroup(groupId, Option.some(threadId)),
    showAside
  ])

/**
 * Picking a group opens it without a thread, and asking to browse shows the groups. Joining a group changes nothing in
 * Home. A group the person created opens, as picking it does.
 */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) => openGroupAlone(groupId),
  RequestedBrowse: () => switchTo(showGroups),
  JoinedGroup: () => HomeDefinition.stepNoop(),
  CreatedGroup: ({ groupId }) => openGroupAlone(groupId)
})

/**
 * Picking a group and asking to browse are the person moving within Home, which Home reports, and joining a group and
 * creating one are reported as they are, for the page to confirm.
 */
const forwardGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: () => OutMessage.Navigated(),
  RequestedBrowse: () => OutMessage.Navigated(),
  JoinedGroup: ({ groupId, place }) => OutMessage.JoinedGroup({ groupId, place }),
  CreatedGroup: ({ groupId }) => OutMessage.CreatedGroup({ groupId })
})

/**
 * A notification's thread opening beside the inbox opens the side pane's dialog where the pane is one, and closing it
 * closes the dialog.
 */
const foldInboxOutMessage = InboxBlock.OutMessage.match({
  OpenedThread: () => showAside,
  ClosedThread: () => hideAside
})

/** Opening a task's thread opens it in its group. */
const foldTasksOutMessage = TasksBlock.OutMessage.match({
  OpenedThread: ({ groupId, threadId }) => openThreadInGroup(groupId, threadId)
})

/** A task's thread opening is the person moving within Home, which Home reports. */
const forwardTasksOutMessage = TasksBlock.OutMessage.match({
  OpenedThread: () => OutMessage.Navigated()
})

/**
 * The side pane's dialog opening and finishing its close change nothing else. Its closing, by Escape, its scrim, or
 * Home, closes the thread it shows, except at `Split`: there it is the pane moving beside the main pane, not the
 * person leaving the thread.
 */
const foldAsideOutMessage = DialogBlock.OutMessage.match({
  Opened: () => HomeDefinition.stepNoop(),
  Closed: () =>
    HomeDefinition.step((model: Model) => (isAsideInDialog(model.viewport) ? closeThread : HomeDefinition.stepNoop())),
  CompletedClose: () => HomeDefinition.stepNoop()
})

export const AsideBinding = HomeDefinition.bindChild(DialogBlock, {
  field: "aside",
  init: { contextToArgs: () => [{ id: "home-aside" }] },
  outMessage: { fold: foldAsideOutMessage }
})

/** Open the side pane's dialog, where the window's width puts the side pane in one. */
export const showAside = HomeDefinition.step((model: Model) =>
  isAsideInDialog(model.viewport) ? AsideBinding.requestOpen() : HomeDefinition.stepNoop()
)

/** Close the side pane's dialog; closing one that is closed does nothing. */
export const hideAside = AsideBinding.requestClose()

/** Close the thread open in the group open or beside the inbox, if there is one. */
const closeThread = HomeDefinition.step((model: Model) =>
  Open.matchOrElse(
    model.open,
    {
      Inbox: () => InboxBinding.requestCloseThread(),
      Group: ({ groupId }) => GroupBinding.requestCloseThread(groupId)
    },
    () => HomeDefinition.stepNoop()
  )
)

export const GroupsBinding = HomeDefinition.bindChild(GroupsBlock, {
  field: "groups",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { forward: forwardGroupsOutMessage, fold: foldGroupsOutMessage }
})

export const InboxBinding = HomeDefinition.bindChild(InboxBlock, {
  field: "inbox",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldInboxOutMessage }
})

export const TasksBinding = HomeDefinition.bindChild(TasksBlock, {
  field: "tasks",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { forward: forwardTasksOutMessage, fold: foldTasksOutMessage }
})

/** The open group's thread opening opens the side pane's dialog where the pane is one, and closing it closes it. */
const foldGroupOutMessage = (_groupId: GroupId.GroupId, outMessage: typeof GroupBlock.OutMessage.Type) =>
  GroupBlock.OutMessage.match(outMessage, {
    OpenedThread: () => showAside,
    ClosedThread: () => hideAside
  })

/**
 * The open group, a keyed occurrence, so opening another makes a fresh one and a late result cannot land in the wrong
 * one.
 */
export const GroupBinding = HomeDefinition.bindChild(GroupBlock, {
  readAll: (model) => (Open.isAnyOf(["Group"])(model.open) ? [model.open] : []),
  key: (open) => open.groupId,
  keySchema: GroupId.GroupId,
  read: (open) => open.model,
  writeAt: (model, groupId, nextGroup) =>
    modifyFields(model, {
      open: (open) =>
        Open.isAnyOf(["Group"])(open) && open.groupId === groupId ? Open.Group({ groupId, model: nextGroup }) : open
    }),
  outMessage: { fold: foldGroupOutMessage }
})

export const HomeComposition = HomeDefinition.makeComposition({
  bindings: [AsideBinding, GroupsBinding, InboxBinding, TasksBinding, GroupBinding]
})
export type HomeViewBuilder = Block.ViewBuilderFor<typeof HomeComposition>
