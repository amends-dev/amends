import { ThreadId } from "@amends-dev/core/thread"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { ThreadBlock } from "../thread/block.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { GroupDefinition, type Model, OutMessage } from "./definition.ts"

/** Open the thread `threadId` in the group. */
export const openThread = (threadId: ThreadId.ThreadId) =>
  GroupDefinition.step((model: Model) =>
    ThreadBinding.init({
      key: threadId,
      args: [model.workspaceId, model.memberId, threadId],
      toParentModel: (thread) => modifyFields(model, { thread: () => Option.some({ threadId, model: thread }) })
    })
  )

/** Picking a thread opens it in the group. */
const foldThreadsOutMessage = ThreadsBlock.OutMessage.match({
  SelectedThread: ({ threadId }) => openThread(threadId)
})

/** Picking a thread, which opens it, is reported to the group's parent as the thread opening. */
const forwardThreadsOutMessage = ThreadsBlock.OutMessage.match({
  SelectedThread: () => OutMessage.OpenedThread()
})

export const ThreadsBinding = GroupDefinition.bindChild(ThreadsBlock, {
  field: "threads",
  init: { contextToArgs: ({ workspaceId, memberId, groupId }) => [workspaceId, memberId, groupId] },
  outMessage: { forward: forwardThreadsOutMessage, fold: foldThreadsOutMessage }
})

/** The dialog closing, by the person or by the settings' own submit, drops the drafts it held. */
const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => GroupDefinition.stepNoop(),
  Closed: () => GroupDefinition.stepFields(() => ({ renaming: () => Option.none(), admitting: () => Option.none() })),
  CompletedClose: () => GroupDefinition.stepNoop()
})

export const DialogBinding = GroupDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "group-settings" }] },
  outMessage: { fold: foldDialogOutMessage }
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
    })
})

export const GroupComposition = GroupDefinition.makeComposition({
  bindings: [ThreadsBinding, ThreadBinding, DialogBinding]
})
export type GroupViewBuilder = Block.ViewBuilderFor<typeof GroupComposition>
