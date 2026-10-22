import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { ScrollToItem } from "./command.ts"
import { clearQuery, DialogBinding, SearchComposition } from "./composition.ts"
import { activeItem, Item, itemId, Message, orderTargets, OutMessage, SearchStatus, shownItems } from "./definition.ts"

export const update = SearchComposition.makeUpdate((model, message) => {
  /** Close the dialog and report the page, the group, the thread, the person, or the agent `item` opens. */
  const choose = (item: Item) =>
    Update.withOutMessage(
      Update.combine(model, [DialogBinding.requestClose()]),
      Item.match(item, {
        Destination: ({ destination }) => OutMessage.OpenedDestination({ destination }),
        Group: ({ group }) => OutMessage.OpenedGroup({ groupId: group.id }),
        Person: ({ member }) => OutMessage.OpenedPerson({ memberId: member.id }),
        Agent: ({ agentId }) => OutMessage.OpenedAgent({ agentId }),
        Thread: ({ thread }) => OutMessage.OpenedThread({ groupId: thread.groupId, threadId: thread.id })
      })
    )

  return Message.match(message, {
    RequestedDismiss: () => Update.combine(model, [DialogBinding.requestClose()]),
    RequestedOpen: () => Update.combine(model, [clearQuery, DialogBinding.requestOpen()]),
    // The item reached stays reached while the places change under it, unless the list is now too short to hold it.
    ReceivedTargets: ({ targets }) => {
      const received = modifyFields(model, { status: () => SearchStatus.Read({ targets: orderTargets(targets) }) })

      return {
        model: modifyFields(received, {
          activeIndex: (activeIndex) => (activeIndex < shownItems(received).length ? activeIndex : 0)
        })
      }
    },
    FailedRead: ({ error }) => ({
      model: modifyFields(model, { status: () => SearchStatus.Failed({ error }), activeIndex: () => 0 })
    }),
    TypedQuery: ({ query }) => ({ model: modifyFields(model, { query: () => query, activeIndex: () => 0 }) }),
    // The view counts the items it shows, so it says which one is active.
    MovedActive: ({ to }) => {
      const moved = modifyFields(model, { activeIndex: () => to })

      return {
        model: moved,
        commands: Option.toArray(
          Option.map(Array.get(shownItems(moved), to), (item) => ScrollToItem({ id: itemId(item) }))
        )
      }
    },
    CompletedScrollToItem: () => ({ model }),
    ChoseActive: () =>
      Option.match(activeItem(model), {
        onNone: () => ({ model }),
        onSome: choose
      }),
    ClickedItem: ({ item }) => choose(item)
  })
})
