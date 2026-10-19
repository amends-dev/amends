import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { mark, markCluster } from "./mark.ts"

const marks = (_: null, h: HtmlBuilder<never>) =>
  h.div(
    [],
    [
      h.p([], ["Alex Morgan"]),
      mark(h, { text: "AM", size: "xs" }),
      mark(h, { text: "S" }),
      mark(h, { text: "Y", size: "md" })
    ]
  )

describe("mark", () => {
  it("shows its letters at each size, hidden from assistive technology", () => {
    scene(
      { update: (model: null) => ({ model }), view: marks },
      given(null),
      expect(text("AM")).toHaveAttr("aria-hidden", "true"),
      expect(text("S")).toHaveAttr("aria-hidden", "true"),
      expect(text("Y")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent(),
      expect(text("Alex Morgan")).toExist()
    )
  })
})

const Message = defineMessageUnion({ ClickedMembers: {} })
type Message = typeof Message.Type

type Model = Readonly<{ openings: number }>

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedMembers: () => ({ model: modifyFields(model, { openings: (openings) => openings + 1 }) })
  })

const clusterOf = (people: ReadonlyArray<string>, label: string) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Opened ${model.openings} times`]),
      markCluster(h, { marks: people, label, onClick: Message.ClickedMembers() })
    ]
  )

describe("markCluster", () => {
  it("is a button named by its label, and clicking it sends its message", () => {
    scene(
      { update, view: clusterOf(["AM", "Y"], "2 members") },
      given({ openings: 0 }),
      expect(role("button", { name: "2 members" })).toExist(),
      click(role("button", { name: "2 members" })),
      click(role("button", { name: "2 members" })),
      expect(role("status")).toHaveText("Opened 2 times")
    )
  })

  it("shows up to three marks, hidden from assistive technology, and no count", () => {
    for (const people of [
      ["AM", "Y"],
      ["AM", "Y", "S"]
    ]) {
      scene(
        { update, view: clusterOf(people, `${people.length} members`) },
        given({ openings: 0 }),
        ...people.map((letters) => expect(within(role("button"), text(letters))).toHaveAttr("aria-hidden", "true")),
        expect(text(/\+\d/)).toBeAbsent()
      )
    }
  })

  it("shows the first three marks of more, and counts the rest, hidden from assistive technology", () => {
    scene(
      { update, view: clusterOf(["AM", "Y", "S", "OK", "AJ", "KL", "RT"], "7 members") },
      given({ openings: 0 }),
      expect(role("button", { name: "7 members" })).toExist(),
      expect(within(role("button"), text("AM"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button"), text("S"))).toHaveAttr("aria-hidden", "true"),
      expect(text("OK")).toBeAbsent(),
      expect(text("RT")).toBeAbsent(),
      expect(within(role("button"), text("+4"))).toHaveAttr("aria-hidden", "true")
    )
  })
})
