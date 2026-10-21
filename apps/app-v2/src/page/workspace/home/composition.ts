import { Group, GroupId } from "@amends-dev/core/group"
import type { ThreadId } from "@amends-dev/core/thread"
import type { MemberId } from "@amends-dev/core/workspace"
import { isAsideInDialog } from "@amends-dev/design/shell"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { GroupBlock } from "../../../feature/group/block.ts"
import { GroupsBlock } from "../../../feature/groups/block.ts"
import { InboxBlock } from "../../../feature/inbox/block.ts"
import { ProfileCardBlock } from "../../../feature/profileCard/block.ts"
import { TasksBlock } from "../../../feature/tasks/block.ts"
import { UnsentConversationBlock } from "../../../feature/unsentConversation/block.ts"
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

/**
 * Open the conversation with the members `memberIds` in the main pane before it is started. It lists its people as a
 * direct group does, so that it is named as the conversation will be, and is given the members the groups have read,
 * so that it is named from its first view.
 */
const openUnsentConversation = (memberIds: ReadonlyArray<MemberId.MemberId>) =>
  HomeDefinition.step((model: Model) => {
    const people = Group.directMembers(memberIds)

    return UnsentBinding.init({
      key: Group.directKey(people),
      args: [model.workspaceId, model.memberId, people, model.groups.members],
      toParentModel: (unsent) => modifyFields(model, { open: () => Open.Unsent({ model: unsent }) })
    })
  })

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
 * Open the conversation with the members `memberIds` before it is started, as picking a group opens it: close the side
 * pane's dialog and the thread beside the inbox, and leave no group marked in the sidebar, since there is none.
 */
export const openUnsentConversationAlone = (memberIds: ReadonlyArray<MemberId.MemberId>) =>
  Update.combine([
    hideAside,
    InboxBinding.requestCloseThread(),
    GroupsBinding.informOpenGroup({ groupId: Option.none() }),
    openUnsentConversation(memberIds)
  ])

/** Mark the group `groupId` in the sidebar and open it without a thread, as asking Home to open it does. */
export const markAndOpenGroup = (groupId: GroupId.GroupId) =>
  Update.combine([GroupsBinding.informOpenGroup({ groupId: Option.some(groupId) }), openGroupAlone(groupId)])

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
 * Picking a group opens it without a thread, picking people the person has no conversation with opens the one they
 * would start, and asking to browse shows the groups. Joining a group changes nothing in Home. A group the person
 * created opens, as picking it does.
 */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) => openGroupAlone(groupId),
  SelectedPeople: ({ memberIds }) => openUnsentConversationAlone(memberIds),
  RequestedBrowse: () => switchTo(showGroups),
  JoinedGroup: () => HomeDefinition.stepNoop(),
  CreatedGroup: ({ groupId }) => openGroupAlone(groupId)
})

/**
 * Picking a group or people to talk with and asking to browse are the person moving within Home, which Home reports,
 * and joining a group and creating one are reported as they are, for the page to confirm.
 */
const forwardGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: () => OutMessage.Navigated(),
  SelectedPeople: () => OutMessage.Navigated(),
  RequestedBrowse: () => OutMessage.Navigated(),
  JoinedGroup: ({ groupId, place }) => OutMessage.JoinedGroup({ groupId, place }),
  CreatedGroup: ({ groupId }) => OutMessage.CreatedGroup({ groupId })
})

/**
 * A notification's thread opening beside the inbox opens the side pane's dialog where the pane is one, and closing it
 * closes the dialog, and an author or thread opening a member's card opens it. The settings of an agent that its
 * thread's turn asked for are the page's to open, which Home reports as they are.
 */
const foldInboxOutMessage = InboxBlock.OutMessage.match({
  OpenedThread: () => showAside,
  ClosedThread: () => hideAside,
  OpenedAgent: () => HomeDefinition.stepNoop(),
  OpenedProfile: ({ memberId, triggerId }) => ProfileCardBinding.requestOpen({ memberId, triggerId })
})

const forwardInboxOutMessage = InboxBlock.OutMessage.match({
  OpenedThread: () => undefined,
  ClosedThread: () => undefined,
  OpenedAgent: ({ agentId }) => OutMessage.OpenedAgent({ agentId }),
  OpenedProfile: () => undefined
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

/**
 * The conversation the person has not started being listed, whether their own first message started it or it was
 * made elsewhere, opens it as any group opens, and marks it in the sidebar.
 */
const foldUnsentOutMessage = (_key: string, outMessage: typeof UnsentConversationBlock.OutMessage.Type) =>
  UnsentConversationBlock.OutMessage.match(outMessage, {
    FoundConversation: ({ groupId }) => markAndOpenGroup(groupId)
  })

export const GroupsBinding = HomeDefinition.bindChild(GroupsBlock, {
  field: "groups",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { forward: forwardGroupsOutMessage, fold: foldGroupsOutMessage }
})

/**
 * What the person chose on a member's card is the page's to do, which Home reports as it is: Message opens the
 * conversation with them, Open agent opens their agent's page, and Change name asks for the dialog of the account menu.
 */
const forwardProfileCardOutMessage = ProfileCardBlock.OutMessage.match({
  OpenedPerson: ({ memberId }) => OutMessage.OpenedPerson({ memberId }),
  OpenedAgent: ({ agentId }) => OutMessage.OpenedAgent({ agentId }),
  RequestedNameChange: () => OutMessage.RequestedNameChange()
})

export const ProfileCardBinding = HomeDefinition.bindChild(ProfileCardBlock, {
  field: "profileCard",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { forward: forwardProfileCardOutMessage }
})

export const InboxBinding = HomeDefinition.bindChild(InboxBlock, {
  field: "inbox",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { forward: forwardInboxOutMessage, fold: foldInboxOutMessage }
})

export const TasksBinding = HomeDefinition.bindChild(TasksBlock, {
  field: "tasks",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { forward: forwardTasksOutMessage, fold: foldTasksOutMessage }
})

/**
 * The open group's thread opening opens the side pane's dialog where the pane is one, and closing it closes it, and an
 * author or mention opening a member's card opens it. Following the group and stopping, the settings of an agent its
 * thread's turn asked for, and the search a phone's header asks for, change nothing in Home.
 */
const foldGroupOutMessage = (_groupId: GroupId.GroupId, outMessage: typeof GroupBlock.OutMessage.Type) =>
  GroupBlock.OutMessage.match(outMessage, {
    OpenedThread: () => showAside,
    ClosedThread: () => hideAside,
    OpenedAgent: () => HomeDefinition.stepNoop(),
    OpenedProfile: ({ memberId, triggerId }) => ProfileCardBinding.requestOpen({ memberId, triggerId }),
    FollowedGroup: () => HomeDefinition.stepNoop(),
    UnfollowedGroup: () => HomeDefinition.stepNoop(),
    RequestedSearch: () => HomeDefinition.stepNoop()
  })

/**
 * What the open group reports for the page is reported as it is: the settings of an agent its thread's turn asked for,
 * which the page opens, the group being followed, or no longer, which the page confirms, and the search a phone's
 * header asks for, which the page opens.
 */
const forwardGroupOutMessage = (_groupId: GroupId.GroupId, outMessage: typeof GroupBlock.OutMessage.Type) =>
  GroupBlock.OutMessage.match(outMessage, {
    OpenedThread: () => undefined,
    ClosedThread: () => undefined,
    OpenedAgent: ({ agentId }) => OutMessage.OpenedAgent({ agentId }),
    OpenedProfile: () => undefined,
    FollowedGroup: ({ place }) => OutMessage.FollowedGroup({ place }),
    UnfollowedGroup: ({ place }) => OutMessage.UnfollowedGroup({ place }),
    RequestedSearch: () => OutMessage.RequestedSearch()
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
  outMessage: { forward: forwardGroupOutMessage, fold: foldGroupOutMessage }
})

/**
 * The conversation not started, a keyed occurrence by its people, so opening another makes a fresh one and a late
 * result cannot land in the wrong one.
 */
export const UnsentBinding = HomeDefinition.bindChild(UnsentConversationBlock, {
  readAll: (model) => (Open.isAnyOf(["Unsent"])(model.open) ? [model.open] : []),
  key: (open) => Group.directKey(open.model.memberIds),
  keySchema: Schema.String,
  read: (open) => open.model,
  writeAt: (model, key, nextUnsent) =>
    modifyFields(model, {
      open: (open) =>
        Open.isAnyOf(["Unsent"])(open) && Group.directKey(open.model.memberIds) === key
          ? Open.Unsent({ model: nextUnsent })
          : open
    }),
  outMessage: { fold: foldUnsentOutMessage }
})

export const HomeComposition = HomeDefinition.makeComposition({
  bindings: [AsideBinding, GroupsBinding, ProfileCardBinding, InboxBinding, TasksBinding, GroupBinding, UnsentBinding]
})
export type HomeViewBuilder = Block.ViewBuilderFor<typeof HomeComposition>
