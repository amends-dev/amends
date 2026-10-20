import { answerKeys } from "@amends-dev/design/control"
import type { IconName } from "@amends-dev/design/icon"
import { palette, type PaletteItem, type PaletteLeading } from "@amends-dev/design/palette"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { initials } from "../../seen.ts"
import { DialogBinding, SearchComposition, type SearchViewBuilder } from "./composition.ts"
import {
  activeItem,
  type Destination,
  Item,
  itemId,
  Message,
  type Model,
  SearchStatus,
  sectionsShown,
  shownItems
} from "./definition.ts"

/** What the arrow keys and Enter do in the field: move the active item around the list, or open it. */
const answerKey = (key: string, count: number, activeIndex: number): Option.Option<Message> =>
  count === 0
    ? Option.none()
    : Match.value(key).pipe(
        Match.when("ArrowDown", () => Option.some(Message.MovedActive({ to: (activeIndex + 1) % count }))),
        Match.when("ArrowUp", () => Option.some(Message.MovedActive({ to: (activeIndex + count - 1) % count }))),
        Match.when("Enter", () => Option.some(Message.ChoseActive())),
        Match.orElse(() => Option.none())
      )

/** The drawing of each page, as the rail and the sidebar draw it. */
const destinationIcons: Readonly<Record<Destination, IconName>> = {
  Inbox: "mark-mail",
  Agents: "mark-agents",
  Connections: "mark-connections",
  Settings: "mark-settings"
}

/**
 * What stands before an item: a drawing for a page, a team (`#`), and a thread, and the initials of a conversation's
 * other members, of a person, or of an agent, on the agent's tone.
 */
const leadingOf = (item: Item): PaletteLeading =>
  Item.match<PaletteLeading>(item, {
    Destination: ({ destination }) => ({ icon: destinationIcons[destination] }),
    Group: ({ group, name }) => (group.kind === "Team" ? { icon: "mark-channel" } : { text: initials(name) }),
    Person: ({ member }) => ({ text: initials(member.name) }),
    Agent: ({ member }) => ({ text: initials(member.name), tone: "lilac" }),
    Thread: () => ({ icon: "message" })
  })

/** A quiet note after an item's name: that a person opens a conversation, and which group a thread is in. */
const detailOf = (item: Item): string | undefined =>
  Item.match(item, {
    Destination: () => undefined,
    Group: () => undefined,
    Person: () => "Direct message",
    Agent: () => undefined,
    Thread: ({ groupName }) => groupName
  })

/** What an item is called, which is what is typed to find it. */
const labelOf = (item: Item): string =>
  Item.match(item, {
    Destination: ({ destination }) => destination,
    Group: ({ name }) => name,
    Person: ({ member }) => member.name,
    Agent: ({ member }) => member.name,
    Thread: ({ words }) => words
  })

/** An item as a line of the palette that opens it, filled while it is the one at `activeIndex`. */
const paletteItem = (item: Item, isActive: boolean): PaletteItem<Message> => ({
  id: itemId(item),
  label: labelOf(item),
  detail: detailOf(item),
  leading: leadingOf(item),
  isActive,
  onClick: Message.ClickedItem({ item })
})

/** What the palette says when it has nothing to list: why the read failed, or that nothing matches what is typed. */
const emptyTextOf = (model: Model): string =>
  SearchStatus.match(model.status, {
    Reading: () => `Nothing matches "${model.query.trim()}".`,
    Read: () => `Nothing matches "${model.query.trim()}".`,
    Failed: ({ error }) => error
  })

/**
 * The palette: the field, which takes the focus as it opens and walks the items with the arrow keys, over the items.
 */
const searchPalette = (render: RenderInfo, model: Model, h: SearchViewBuilder): Html => {
  const active = activeItem(model)
  const count = shownItems(model).length
  const activeId = Option.map(active, itemId)

  return palette(h, render, {
    label: "Jump to",
    id: "jump-to",
    placeholder: "Jump to a group, person, or page…",
    query: model.query,
    onInput: (query) => Message.TypedQuery({ query }),
    attributes: [
      ...render.initialFocus,
      answerKeys(h, (key) => answerKey(key, count, model.activeIndex)),
      ...Option.toArray(Option.map(activeId, (id) => h.AriaActiveDescendant(id)))
    ],
    sections: sectionsShown(model).map(({ title, items }) => ({
      title,
      items: items.map((item) =>
        paletteItem(
          item,
          Option.exists(activeId, (id) => id === itemId(item))
        )
      )
    })),
    emptyText: emptyTextOf(model)
  })
}

/** The search dialog, which the page lends the shell: its `dialog` element, with nothing in it while it is closed. */
export const view = SearchComposition.makeView((model, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "dialog",
      model: model.dialog,
      viewInputs: { toView: (render) => searchPalette(render, model, h) }
    })
  )
)
