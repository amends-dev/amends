import { ThreadId } from "@amends-dev/core/thread"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { ThreadBlock } from "../thread/block.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { GroupDefinition, type Model } from "./definition.ts"

/** Picking a thread opens it in the group. */
const foldThreadsOutMessage = ThreadsBlock.OutMessage.match({
  SelectedThread: ({ threadId }) =>
    GroupDefinition.step((model: Model) =>
      ThreadBinding.init({
        key: threadId,
        args: [model.workspaceId, model.memberId, threadId],
        toParentModel: (thread) => modifyFields(model, { thread: () => Option.some({ threadId, model: thread }) })
      })
    )
})

export const ThreadsBinding = GroupDefinition.bindChild(ThreadsBlock, {
  field: "threads",
  init: { contextToArgs: ({ workspaceId, memberId, groupId }) => [workspaceId, memberId, groupId] },
  outMessage: { fold: foldThreadsOutMessage }
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

export const GroupComposition = GroupDefinition.makeComposition({ bindings: [ThreadsBinding, ThreadBinding] })
export type GroupViewBuilder = Block.ViewBuilderFor<typeof GroupComposition>
