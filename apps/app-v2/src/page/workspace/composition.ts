import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { ThreadBlock } from "../../feature/thread/block.ts"
import { ThreadsBlock } from "../../feature/threads/block.ts"
import { type Model, WorkspaceDefinition } from "./definition.ts"

/** Picking a group opens it, listing its threads, with none open. */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) =>
    WorkspaceDefinition.step((model: Model) =>
      ThreadsBinding.init({
        key: groupId,
        args: [model.workspaceId, model.memberId, groupId],
        toParentModel: (threads) =>
          modifyFields(model, { pane: () => Option.some({ groupId, threads, thread: Option.none() }) })
      })
    )
})

export const GroupsBinding = WorkspaceDefinition.bindChild(GroupsBlock, {
  field: "groups",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldGroupsOutMessage }
})

export const ActionsBinding = WorkspaceDefinition.bindChild(ActionsBlock, {
  field: "actions",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] }
})

/** Picking a thread opens it in the group. */
const foldThreadsOutMessage = (groupId: GroupId.GroupId, outMessage: typeof ThreadsBlock.OutMessage.Type) =>
  ThreadsBlock.OutMessage.match(outMessage, {
    SelectedThread: ({ threadId }) =>
      WorkspaceDefinition.step((model: Model) =>
        ThreadBinding.init({
          key: threadId,
          args: [model.workspaceId, model.memberId, threadId],
          toParentModel: (thread) =>
            modifyFields(model, {
              pane: Option.map((pane) =>
                pane.groupId === groupId ? { ...pane, thread: Option.some({ threadId, model: thread }) } : pane
              )
            })
        })
      )
  })

export const ThreadsBinding = WorkspaceDefinition.bindChild(ThreadsBlock, {
  readAll: (model) => Option.toArray(model.pane),
  key: (pane) => pane.groupId,
  keySchema: GroupId.GroupId,
  read: (pane) => pane.threads,
  writeAt: (model, groupId, nextThreads) =>
    modifyFields(model, {
      pane: Option.map((pane) => (pane.groupId === groupId ? { ...pane, threads: nextThreads } : pane))
    }),
  outMessage: { fold: foldThreadsOutMessage }
})

export const ThreadBinding = WorkspaceDefinition.bindChild(ThreadBlock, {
  readAll: (model) => Option.toArray(Option.flatMap(model.pane, (pane) => pane.thread)),
  key: (open) => open.threadId,
  keySchema: ThreadId.ThreadId,
  read: (open) => open.model,
  writeAt: (model, threadId, nextThread) =>
    modifyFields(model, {
      pane: Option.map((pane) =>
        modifyFields(pane, {
          thread: Option.map((open) => (open.threadId === threadId ? { threadId, model: nextThread } : open))
        })
      )
    })
})

export const WorkspaceComposition = WorkspaceDefinition.makeComposition({
  bindings: [GroupsBinding, ActionsBinding, ThreadsBinding, ThreadBinding]
})
export type WorkspaceViewBuilder = Block.ViewBuilderFor<typeof WorkspaceComposition>
