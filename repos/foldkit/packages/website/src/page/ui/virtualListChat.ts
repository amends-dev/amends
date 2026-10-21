import { Array, Option, Tuple, pipe } from 'effect'
import { Update } from 'foldkit'

import { ScrollTarget } from '@foldkit/ui/virtualList'

import { UiDefinition } from './definition'
import { ChatVirtualListBlock } from './demo/components'
import {
  type VirtualListChatMessage,
  VirtualListChatStartProximity,
} from './domain/domain'
import { Model } from './model'

const VIRTUAL_LIST_CHAT_START_THRESHOLD_PX = 48
const VIRTUAL_LIST_CHAT_HISTORY_BATCH_SIZE = 8

const olderVirtualListChatMessages = (model: Model) => {
  const firstId = pipe(
    model.virtualListChatMessages,
    Array.head,
    Option.match({
      onNone: () => model.virtualListChatNextId,
      onSome: message => message.id,
    }),
  )
  const olderMessages = Array.makeBy(
    VIRTUAL_LIST_CHAT_HISTORY_BATCH_SIZE,
    index => {
      const id = firstId - VIRTUAL_LIST_CHAT_HISTORY_BATCH_SIZE + index
      return {
        id,
        body: `Older message ${id} loaded above the viewport.`,
        isExpanded: id % 3 === 0,
      }
    },
  )

  return [...olderMessages, ...model.virtualListChatMessages]
}

const foldVirtualListChatOutMessage = ChatVirtualListBlock.OutMessage.match({
  ObservedContainerScroll: ({ scrollTop }) =>
    UiDefinition.step(model => {
      const isNearStart = scrollTop <= VIRTUAL_LIST_CHAT_START_THRESHOLD_PX
      const nextVirtualListChatStartProximity = isNearStart
        ? VirtualListChatStartProximity.Near()
        : VirtualListChatStartProximity.Away()
      const updateStartProximity = UiDefinition.stepFields(() => ({
        virtualListChatStartProximity: () => nextVirtualListChatStartProximity,
      }))

      if (!isNearStart || model.virtualListChatStartProximity._tag === 'Near') {
        return updateStartProximity
      }

      const nextMessages = olderVirtualListChatMessages(model)
      const updateMessages = UiDefinition.stepFields(() => ({
        virtualListChatMessages: () => nextMessages,
      }))

      return Update.combine([
        updateStartProximity,
        updateMessages,
        VirtualListChatDemoBinding.informItemsChanged(
          Array.map(nextMessages, message => globalThis.String(message.id)),
        ),
      ])
    }),
})

export const VirtualListChatDemoBinding = UiDefinition.bindChild(
  ChatVirtualListBlock,
  {
    field: 'virtualListChatDemo',
    outMessage: { fold: foldVirtualListChatOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({
          id: 'virtual-list-chat-demo',
          rowHeightPx: 64,
          initialScroll: { target: ScrollTarget.End() },
          followEnd: { thresholdPx: 8 },
        }),
    },
  },
)

export const updateVirtualListChatMessages = (
  nextMessages: ReadonlyArray<VirtualListChatMessage>,
  nextId?: number,
) =>
  UiDefinition.step(model => {
    const nextVirtualListChatNextId =
      nextId === undefined ? model.virtualListChatNextId : nextId
    const updateMessages = UiDefinition.stepFields(() => ({
      virtualListChatMessages: () => nextMessages,
      virtualListChatNextId: () => nextVirtualListChatNextId,
    }))

    return Update.combine([
      updateMessages,
      VirtualListChatDemoBinding.informItemsChanged(
        Array.map(nextMessages, message => globalThis.String(message.id)),
      ),
    ])
  })

export const prependVirtualListChatMessages = UiDefinition.step(model =>
  updateVirtualListChatMessages(olderVirtualListChatMessages(model)),
)
