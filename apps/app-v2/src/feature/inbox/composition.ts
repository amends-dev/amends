import type { GroupId } from "@amends-dev/core/group"
import type { Notification } from "@amends-dev/core/notification"
import { ThreadId, type ThreadMessageId } from "@amends-dev/core/thread"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { ThreadBlock } from "../thread/block.ts"
import { InboxDefinition, type Model } from "./definition.ts"

/** The thread opened beside the inbox, a keyed occurrence, so opening another makes a fresh one and a late result cannot land in the wrong one. */
export const ThreadBinding = InboxDefinition.bindChild(ThreadBlock, {
  readAll: (model) => Option.toArray(model.selected),
  key: (selected) => selected.threadId,
  keySchema: ThreadId.ThreadId,
  read: (selected) => selected.model,
  writeAt: (model, threadId, nextThread) =>
    modifyFields(model, {
      selected: Option.map((selected) =>
        selected.threadId === threadId ? { ...selected, model: nextThread } : selected
      )
    })
})

/**
 * Select the notification `notificationId` and open its thread `threadId`, in the group `groupId`, beside the
 * inbox, with the message `messageId` its activity is about highlighted, if the store holds it.
 */
export const selectNotification = (
  notificationId: Notification.NotificationId,
  groupId: GroupId.GroupId,
  threadId: ThreadId.ThreadId,
  messageId: Option.Option<ThreadMessageId.ThreadMessageId>
) =>
  InboxDefinition.step((model: Model) =>
    ThreadBinding.init({
      key: threadId,
      args: [model.workspaceId, model.memberId, threadId],
      toParentModel: (thread) =>
        modifyFields(model, {
          selected: () => Option.some({ notificationId, threadId, groupId, messageId, model: thread })
        })
    })
  )

export const InboxComposition = InboxDefinition.makeComposition({ bindings: [ThreadBinding] })
export type InboxViewBuilder = Block.ViewBuilderFor<typeof InboxComposition>
