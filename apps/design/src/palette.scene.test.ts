import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  all,
  click,
  expect,
  expectAll,
  expectHandled,
  expectIgnored,
  given,
  keydown,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import { answerKeys } from "./control.ts"
import type { ModalRender } from "./modal.ts"
import { palette, type PaletteLeading } from "./palette.ts"

const Message = defineMessageUnion({
  TypedQuery: { value: Schema.String },
  MovedActive: { to: Schema.Int },
  PickedPlace: { id: Schema.String }
})
type Message = typeof Message.Type

type Model = Readonly<{ query: string; active: number; picked: string }>

const initial: Model = { query: "", active: 0, picked: "nothing yet" }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    TypedQuery: ({ value }) => ({ model: modifyFields(model, { query: () => value, active: () => 0 }) }),
    MovedActive: ({ to }) => ({ model: modifyFields(model, { active: () => to }) }),
    PickedPlace: ({ id }) => ({ model: modifyFields(model, { picked: () => id }) })
  })

/** What the dialog publishes while it is open, with no attribute in any group. */
const visibleRender: ModalRender<Message, never> = {
  dialog: [],
  backdrop: [],
  panel: [],
  title: [],
  description: [],
  initialFocus: [],
  closeButton: [],
  isVisible: true
}

type Place = Readonly<{
  id: string
  label: string
  detail?: string
  leading: PaletteLeading
}>

const sections: ReadonlyArray<Readonly<{ title: string; places: ReadonlyArray<Place> }>> = [
  {
    title: "Go to",
    places: [
      { id: "go-inbox", label: "Inbox", leading: { icon: "mark-mail" } },
      { id: "go-agents", label: "Agents", leading: { icon: "mark-agents" } }
    ]
  },
  {
    title: "Groups",
    places: [{ id: "group-general", label: "general", leading: { icon: "mark-channel" } }]
  },
  {
    title: "People",
    places: [{ id: "person-alex", label: "Alex Morgan", detail: "Direct message", leading: { text: "AM" } }]
  },
  {
    title: "Agents",
    places: [{ id: "agent-yumi", label: "Yumi", leading: { text: "Y", tone: "lilac" } }]
  }
]

const named = (query: string) => {
  const wanted = query.trim().toLowerCase()

  return sections
    .map(({ title, places }) => ({
      title,
      places: places.filter(({ label: name }) => name.toLowerCase().includes(wanted))
    }))
    .filter(({ places }) => places.length > 0)
}

const answerKey = (key: string, places: ReadonlyArray<Place>, active: number): Option.Option<Message> => {
  const count = places.length

  if (count === 0) {
    return Option.none()
  }

  if (key === "ArrowDown") {
    return Option.some(Message.MovedActive({ to: (active + 1) % count }))
  }

  if (key === "ArrowUp") {
    return Option.some(Message.MovedActive({ to: (active + count - 1) % count }))
  }

  return key === "Enter"
    ? Option.map(Option.fromUndefinedOr(places.at(active)), ({ id }) => Message.PickedPlace({ id }))
    : Option.none()
}

const paletteView =
  (render: ModalRender<Message, never> = visibleRender) =>
  (model: Model, h: HtmlBuilder<Message>) => {
    const found = named(model.query)
    const flat = found.flatMap(({ places }) => places)
    const activeId = flat.at(model.active)?.id

    return h.div(
      [],
      [
        h.p([h.Role("note")], [`Picked ${model.picked}`]),
        palette(h, render, {
          label: "Jump to",
          id: "jump-to",
          placeholder: "Jump to a group, person, or page…",
          query: model.query,
          onInput: (value) => Message.TypedQuery({ value }),
          attributes: [
            answerKeys(h, (key) => answerKey(key, flat, model.active)),
            ...(activeId === undefined ? [] : [h.AriaActiveDescendant(activeId)])
          ],
          sections: found.map(({ title, places }) => ({
            title,
            items: places.map((place) => ({
              ...place,
              isActive: place.id === activeId,
              onClick: Message.PickedPlace({ id: place.id })
            }))
          })),
          emptyText: `Nothing matches “${model.query.trim()}”.`
        })
      ]
    )
  }

const jumpTo = label("Jump to")

describe("palette", () => {
  it("is a dialog's panel with a title that only assistive technology reads, and a field named for what it does", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(role("heading", { name: "Jump to", level: 2 })).toHaveClass("sr-only"),
      expect(role("combobox", { name: "Jump to" })).toExist(),
      expect(jumpTo).toHaveAttr("placeholder", "Jump to a group, person, or page…"),
      expect(jumpTo).toHaveAttr("type", "text"),
      expect(jumpTo).toHaveAttr("autocomplete", "off"),
      expect(jumpTo).toHaveAttr("spellcheck", "false"),
      expect(jumpTo).toHaveAttr("aria-expanded", "true"),
      expect(jumpTo).toHaveAttr("aria-autocomplete", "list"),
      expect(jumpTo).toHaveAttr("aria-controls", "jump-to-results"),
      expect(role("listbox", { name: "Places" })).toHaveAttr("id", "jump-to-results"),
      expect(role("form")).toBeAbsent()
    )
  })

  it("has a Close button after the field, named Close unless given another name", () => {
    scene({ update, view: paletteView() }, given(initial), expect(role("button", { name: "Close" })).toExist())
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          palette(h, visibleRender, {
            label: "Jump to",
            id: "jump-to",
            placeholder: "Jump to…",
            query: "",
            onInput: (value) => Message.TypedQuery({ value }),
            closeLabel: "Close search",
            attributes: [],
            sections: [],
            emptyText: "Nothing here."
          })
      },
      given(initial),
      expect(role("button", { name: "Close search" })).toExist(),
      expect(role("button", { name: "Close" })).toBeAbsent()
    )
  })

  it("lists the places in a group for each section, named by its title, in the order given", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expectAll(all.role("group")).toHaveCount(4),
      expect(role("group", { name: "Go to" })).toExist(),
      expect(role("group", { name: "Groups" })).toExist(),
      expect(role("group", { name: "People" })).toExist(),
      expect(role("group", { name: "Agents" })).toExist(),
      expect(within(role("group", { name: "Go to" }), role("option", { name: "Inbox" }))).toExist(),
      expect(within(role("group", { name: "Go to" }), role("option", { name: "Agents" }))).toExist(),
      expect(within(role("group", { name: "Groups" }), role("option", { name: "general" }))).toExist(),
      expect(within(role("group", { name: "Agents" }), role("option", { name: "Yumi" }))).toExist(),
      expect(nth(all.role("group"), 0)).toHaveText("Go toInboxAgents")
    )
  })

  it("draws the title of a section in capitals, quiet", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(text("Go to")).toHaveClass("uppercase"),
      expect(text("Go to")).toHaveClass("text-ink-muted")
    )
  })

  it("puts a quiet note after a place's name, and a person's or an agent's mark before it", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(within(role("option", { name: /^Alex Morgan/ }), text("Direct message"))).toHaveClass("ms-auto"),
      expect(within(role("option", { name: /^Alex Morgan/ }), text("Direct message"))).toHaveClass("text-ink-muted"),
      expect(within(role("option", { name: /^Alex Morgan/ }), text("AM"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("option", { name: /^Yumi/ }), text("Y"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("option", { name: "Inbox" }), selector("svg"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("fills the place that is reached, and names it as the field's active descendant", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(role("option", { name: "Inbox" })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: "Inbox" })).toHaveClass("aria-selected:bg-selected"),
      expect(role("option", { name: "Agents" })).toHaveAttr("aria-selected", "false"),
      expect(jumpTo).toHaveAttr("aria-activedescendant", "go-inbox"),
      expect(role("option", { name: "Inbox" })).toHaveAttr("id", "go-inbox")
    )
  })

  it("sends what typing sends, and what the keys it was given answer", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      type(jumpTo, "ale"),
      expect(jumpTo).toHaveValue("ale"),
      expect(role("group", { name: "People" })).toExist(),
      expect(role("group", { name: "Go to" })).toBeAbsent(),
      expect(role("option", { name: /^Alex Morgan/ })).toHaveAttr("aria-selected", "true")
    )
    scene(
      { update, view: paletteView() },
      given(initial),
      keydown(jumpTo, "ArrowDown"),
      expectHandled(),
      expect(role("option", { name: "Agents" })).toHaveAttr("aria-selected", "true"),
      keydown(jumpTo, "ArrowUp"),
      keydown(jumpTo, "ArrowUp"),
      expect(role("option", { name: "Yumi" })).toHaveAttr("aria-selected", "true"),
      keydown(jumpTo, "Enter"),
      expect(role("note")).toHaveText("Picked agent-yumi"),
      keydown(jumpTo, "a"),
      expectIgnored()
    )
  })

  it("sends a place's message when it is clicked", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      click(role("option", { name: /^Alex Morgan/ })),
      expect(role("note")).toHaveText("Picked person-alex")
    )
  })

  it("says what it has in place of the sections when there are none", () => {
    scene(
      { update, view: paletteView() },
      given({ ...initial, query: " zzz " }),
      expect(role("status")).toHaveText("Nothing matches “zzz”."),
      expectAll(all.role("group")).toHaveCount(0),
      expectAll(all.role("option")).toHaveCount(0),
      expect(role("listbox", { name: "Places" })).toExist(),
      expect(jumpTo).not.toHaveAttr("aria-activedescendant")
    )
  })

  it("shows the keys to use it by, to move, to open, and to close, only where there is a keyboard", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(selector('p[aria-hidden="true"]')).toHaveClass("max-desktop:hidden"),
      expect(text("↑")).toExist(),
      expect(text("↓")).toExist(),
      expect(text("↵")).toExist(),
      expect(text("esc")).toExist(),
      expect(text("↑")).toHaveClass("border-outline"),
      expect(selector('p[aria-hidden="true"]')).toHaveText("↑↓ to move↵ to openesc to close")
    )
  })

  it("makes its lines as tall as a touch target below 64rem", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(role("option", { name: "Inbox" })).toHaveClass("min-h-9"),
      expect(role("option", { name: "Inbox" })).toHaveClass("max-desktop:min-h-11")
    )
  })

  it("is the palette's panel: 40rem by 30rem, 12vh from the top, and the whole window below 48rem", () => {
    scene(
      { update, view: paletteView() },
      given(initial),
      expect(selector("div.self-start")).toHaveClass("w-[min(40rem,calc(100%-2rem))]"),
      expect(selector("div.self-start")).toHaveClass("h-[min(30rem,calc(100dvh-4rem))]"),
      expect(selector("div.self-start")).toHaveClass("mt-[12vh]"),
      expect(selector("div.self-start")).toHaveClass("max-tablet:mt-0"),
      expect(selector("div.self-start")).toHaveClass("max-tablet:h-dvh"),
      expect(selector("div.self-start")).toHaveClass("max-tablet:w-full"),
      expect(selector("div.self-start")).toHaveClass("max-tablet:shadow-none")
    )
  })

  it("shows nothing but its dialog element while the dialog is not visible", () => {
    scene(
      { update, view: paletteView({ ...visibleRender, isVisible: false }) },
      given(initial),
      expect(jumpTo).toBeAbsent(),
      expect(role("button", { name: "Close" })).toBeAbsent()
    )
  })
})
