import { ThreadId } from "@amends-dev/core/thread"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { MembersComboboxBlock } from "../../memberPicker.ts"
import type { SlashCommand } from "../composer/definition.ts"
import { ThreadBlock } from "../thread/block.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { FollowGroup, UnfollowGroup } from "./command.ts"
import {
  admitMembersId,
  chooseToAdmit,
  GroupDefinition,
  inGroup,
  mayRename,
  type Model,
  OutMessage,
  placeOf,
  type SettingsTab,
  teamName
} from "./definition.ts"

/** Open the thread `threadId` in the group. */
export const openThread = (threadId: ThreadId.ThreadId) =>
  GroupDefinition.step((model: Model) =>
    ThreadBinding.init({
      key: threadId,
      args: [model.workspaceId, model.memberId, threadId],
      toParentModel: (thread) => modifyFields(model, { thread: () => Option.some({ threadId, model: thread }) })
    })
  )

/** Show the settings' section `tab`. */
const showSettingsTab = (tab: SettingsTab) => GroupDefinition.stepFields(() => ({ settingsTab: () => tab }))

/** Start the draft of the team's name from its name, for someone who may rename the team, so its field is live. */
const startRenaming = GroupDefinition.step((model: Model) => ({
  model: mayRename(model) ? modifyFields(model, { renaming: () => teamName(model) }) : model
}))

/** Open the settings' section `tab`, with the draft of the team's name started for someone who may rename it. */
export const openSettings = (tab: SettingsTab) =>
  Update.combine([showSettingsTab(tab), startRenaming, DialogBinding.requestOpen()])

/**
 * Follow the group as the bell does, and report it, with where the group is, for the page to confirm; nothing happens
 * before the group is read.
 */
const followBySlashCommand = GroupDefinition.step((model: Model) =>
  Option.match(placeOf(model), {
    onNone: () => ({ model }),
    onSome: (place) => ({
      model,
      commands: [FollowGroup(inGroup(model))],
      outMessage: OutMessage.FollowedGroup({ place })
    })
  })
)

/** Stop following the group as the bell does, and report it. */
const unfollowBySlashCommand = GroupDefinition.step((model: Model) =>
  Option.match(placeOf(model), {
    onNone: () => ({ model }),
    onSome: (place) => ({
      model,
      commands: [UnfollowGroup(inGroup(model))],
      outMessage: OutMessage.UnfollowedGroup({ place })
    })
  })
)

/** Run the slash command the person picked in the composer, as the bell and the settings' button do. */
const runSlashCommand = (command: SlashCommand) =>
  Match.value(command).pipe(
    Match.when("follow", () => followBySlashCommand),
    Match.when("unfollow", () => unfollowBySlashCommand),
    Match.when("rename", () => openSettings("General")),
    Match.exhaustive
  )

/** Picking a thread opens it in the group, and a slash command picked runs; opening a member's card changes nothing. */
const foldThreadsOutMessage = ThreadsBlock.OutMessage.match({
  SelectedThread: ({ threadId }) => openThread(threadId),
  RanSlashCommand: ({ command }) => runSlashCommand(command),
  OpenedProfile: () => GroupDefinition.stepNoop()
})

/**
 * Picking a thread, which opens it, is reported to the group's parent as the thread opening, and the card opened as it
 * is. What the slash commands report is said when they run.
 */
const forwardThreadsOutMessage = ThreadsBlock.OutMessage.match({
  SelectedThread: () => OutMessage.OpenedThread(),
  RanSlashCommand: () => undefined,
  OpenedProfile: ({ memberId, triggerId }) => OutMessage.OpenedProfile({ memberId, triggerId })
})

export const ThreadsBinding = GroupDefinition.bindChild(ThreadsBlock, {
  field: "threads",
  init: { contextToArgs: ({ workspaceId, memberId, groupId }) => [workspaceId, memberId, groupId] },
  outMessage: { forward: forwardThreadsOutMessage, fold: foldThreadsOutMessage }
})

/** The dialog closing, by the person or by the settings' own submit, drops the drafts it held. */
const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => GroupDefinition.stepNoop(),
  Closed: () =>
    Update.combine([
      GroupDefinition.stepFields(() => ({
        renaming: () => Option.none(),
        admitting: () => [],
        admitQuery: () => "",
        isAddViewOpen: () => false
      })),
      MembersBinding.requestClose()
    ]),
  CompletedClose: () => GroupDefinition.stepNoop()
})

export const DialogBinding = GroupDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "group-settings" }] },
  outMessage: { fold: foldDialogOutMessage }
})

/**
 * Choosing a member chooses them to admit, unless they are not one of the people who may be admitted or are chosen
 * already. The combobox does not empty the text typed once a choice is made, so the list is closed and opened again,
 * which empties it and leaves the list open for the next choice.
 */
const foldMembersOutMessage = MembersComboboxBlock.OutMessage.match({
  Selected: ({ value }) =>
    Update.combine([
      GroupDefinition.step((model: Model) => ({ model: chooseToAdmit(model, value) })),
      MembersBinding.requestClose(),
      MembersBinding.requestOpen()
    ]),
  ClearedSelection: () => GroupDefinition.stepNoop()
})

export const MembersBinding = GroupDefinition.bindChild(MembersComboboxBlock, {
  field: "membersCombobox",
  init: { contextToArgs: () => [{ id: admitMembersId }] },
  outMessage: { fold: foldMembersOutMessage }
})

/** Close the thread open in the group. */
export const closeThread = GroupDefinition.stepFields(() => ({ thread: () => Option.none() }))

/**
 * The person closing the log of one of the open thread's turns leaves the thread too; asking for the settings of an
 * agent, or opening a member's card, changes nothing in the group.
 */
const foldThreadOutMessage = (_threadId: ThreadId.ThreadId, outMessage: typeof ThreadBlock.OutMessage.Type) =>
  ThreadBlock.OutMessage.match(outMessage, {
    ClosedTurnLog: () => closeThread,
    OpenedAgent: () => GroupDefinition.stepNoop(),
    OpenedProfile: () => GroupDefinition.stepNoop()
  })

/**
 * Closing the log of one of the open thread's turns is reported to the group's parent as the thread closing, and the
 * settings of an agent asked for and the card opened as they are.
 */
const forwardThreadOutMessage = (_threadId: ThreadId.ThreadId, outMessage: typeof ThreadBlock.OutMessage.Type) =>
  ThreadBlock.OutMessage.match(outMessage, {
    ClosedTurnLog: () => OutMessage.ClosedThread(),
    OpenedAgent: ({ agentId }) => OutMessage.OpenedAgent({ agentId }),
    OpenedProfile: ({ memberId, triggerId }) => OutMessage.OpenedProfile({ memberId, triggerId })
  })

/** The open thread, a keyed occurrence, so opening another makes a fresh one and a late result cannot land in the wrong one. */
export const ThreadBinding = GroupDefinition.bindChild(ThreadBlock, {
  readAll: (model) => Option.toArray(model.thread),
  key: (open) => open.threadId,
  keySchema: ThreadId.ThreadId,
  read: (open) => open.model,
  writeAt: (model, threadId, nextThread) =>
    modifyFields(model, {
      thread: Option.map((open) => (open.threadId === threadId ? { threadId, model: nextThread } : open))
    }),
  outMessage: { forward: forwardThreadOutMessage, fold: foldThreadOutMessage }
})

export const GroupComposition = GroupDefinition.makeComposition({
  bindings: [ThreadsBinding, ThreadBinding, DialogBinding, MembersBinding]
})
export type GroupViewBuilder = Block.ViewBuilderFor<typeof GroupComposition>
