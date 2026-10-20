import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { activityMark, type MarkSize, type MarkStatus, mark, markCluster, statusMark } from "./mark.ts"

const marks = (_: null, h: HtmlBuilder<never>) =>
  h.div(
    [],
    [
      h.p([], ["Alex Morgan"]),
      mark(h, { text: "AM", size: "xs" }),
      mark(h, { text: "S" }),
      mark(h, { text: "Y", size: "md" }),
      mark(h, { text: "N", size: "lg" })
    ]
  )

const still = { update: (model: null) => ({ model }) }

describe("mark", () => {
  it("shows its letters at each size, hidden from assistive technology", () => {
    scene(
      { ...still, view: marks },
      given(null),
      expect(text("AM")).toHaveAttr("aria-hidden", "true"),
      expect(text("S")).toHaveAttr("aria-hidden", "true"),
      expect(text("Y")).toHaveAttr("aria-hidden", "true"),
      expect(text("N")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent(),
      expect(text("Alex Morgan")).toExist(),
      expect(text("AM")).toHaveClass("size-5"),
      expect(text("S")).toHaveClass("size-6"),
      expect(text("Y")).toHaveClass("size-8"),
      expect(text("N")).toHaveClass("size-10")
    )
  })

  it("is on the neutral ground unless it is given a tone, and has no patch without a status", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([], [mark(h, { text: "S" }), mark(h, { text: "Y", tone: "lilac" })])
      },
      given(null),
      expect(text("S")).toHaveClass("bg-avatar-neutral-bg"),
      expect(text("S")).toHaveClass("text-avatar-neutral-fg"),
      expect(text("Y")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("Y")).toHaveClass("text-avatar-lilac-fg"),
      expect(text("S")).not.toHaveAttr("title"),
      expect(within(selector("div"), selector("span span"))).toBeAbsent()
    )
  })
})

describe("mark beside a choice", () => {
  it("is 22px, between the reply line's 20 and the row's 24, with letters of 10px, hidden from assistive technology", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([], [h.p([], ["Alex Morgan"]), mark(h, { text: "am", size: "choice" })])
      },
      given(null),
      expect(text("am")).toHaveClass("size-5.5"),
      expect(text("am")).toHaveClass("text-[0.625rem]"),
      expect(text("am")).toHaveClass("uppercase"),
      expect(text("am")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent()
    )
  })

  it("fits its icon at the size of the 20px mark's, 12px", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([h.Id("icon")], [mark(h, { icon: "mark-connections", size: "choice" })])
      },
      given(null),
      expect(within(selector("#icon"), selector("svg"))).toHaveAttr("width", "0.75rem"),
      expect(within(selector("#icon"), selector("span.relative"))).toHaveClass("size-5.5")
    )
  })
})

describe("mark with an icon", () => {
  const icons = (_: null, h: HtmlBuilder<never>) =>
    h.div(
      [],
      [
        h.p([], ["Anthropic"]),
        mark(h, { icon: "mark-connections", size: "xs" }),
        mark(h, { icon: "mark-connections" }),
        mark(h, { icon: "mark-connections", size: "md" }),
        mark(h, { icon: "mark-connections", size: "lg", tone: "lilac" })
      ]
    )

  it("draws the icon in the square in place of letters, hidden from assistive technology", () => {
    scene(
      { ...still, view: icons },
      given(null),
      expect(role("img")).toBeAbsent(),
      expectAll(all.selector("span.relative")).toHaveCount(4),
      expectAll(all.selector("span.relative svg")).toHaveCount(4),
      expect(nth(all.selector("span.relative"), 0)).toHaveAttr("aria-hidden", "true"),
      expect(nth(all.selector("span.relative"), 3)).toHaveAttr("aria-hidden", "true"),
      expect(nth(all.selector("span.relative svg"), 0)).toHaveAttr("aria-hidden", "true"),
      expect(nth(all.selector("span.relative svg"), 3)).toHaveAttr("aria-hidden", "true")
    )
  })

  it("fits the icon to the square: 12px in 20, 16px in 24 and 32, and 20px in 40", () => {
    scene(
      { ...still, view: icons },
      given(null),
      expect(nth(all.selector("span.relative svg"), 0)).toHaveAttr("width", "0.75rem"),
      expect(nth(all.selector("span.relative svg"), 1)).toHaveAttr("width", "1rem"),
      expect(nth(all.selector("span.relative svg"), 2)).toHaveAttr("width", "1rem"),
      expect(nth(all.selector("span.relative svg"), 3)).toHaveAttr("width", "1.25rem"),
      expect(nth(all.selector("span.relative"), 0)).toHaveClass("size-5"),
      expect(nth(all.selector("span.relative"), 3)).toHaveClass("bg-avatar-lilac-bg")
    )
  })

  it("carries a status as a patch like a mark of letters", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [
              mark(h, {
                icon: "mark-connections",
                size: "md",
                status: {
                  kind: "blocked",
                  label: "Unavailable",
                  detail: "Its integration isn't installed on this host."
                }
              })
            ]
          )
      },
      given(null),
      expect(selector("span.relative")).toHaveAttr(
        "title",
        "Unavailable: Its integration isn't installed on this host."
      ),
      expect(within(selector("span.relative"), selector("span.bg-danger-mark"))).toExist()
    )
  })
})

/** The cut-out and the patch a status has at each size: 8px on 24, 9 on 32, 10 on 40, and 7 on 20 and 22. */
const patchSizes: ReadonlyArray<readonly [MarkSize, string, string]> = [
  ["xs", "size-2.75", "size-1.75"],
  ["choice", "size-2.75", "size-1.75"],
  ["sm", "size-3", "size-2"],
  ["md", "size-3.25", "size-2.25"],
  ["lg", "size-3.5", "size-2.5"]
]

const patchColors: ReadonlyArray<readonly [MarkStatus["kind"], string]> = [
  ["available", "bg-success-mark"],
  ["offline", "border-ink-muted"],
  ["attention", "bg-caution-mark"],
  ["blocked", "bg-danger-mark"]
]

describe("mark with a status", () => {
  for (const [size, cutSize, patchSize] of patchSizes) {
    for (const [kind, color] of patchColors) {
      it(`draws ${kind} at ${size} as a ${patchSize} patch in a ${cutSize} cut-out`, () => {
        const id = `${size}-${kind}`
        scene(
          {
            ...still,
            view: (_: null, h: HtmlBuilder<never>) =>
              h.div([h.Id(id)], [mark(h, { text: "A", size, status: { kind, label: `is ${kind}` } })])
          },
          given(null),
          expect(within(selector(`#${id}`), selector(".absolute"))).toHaveClass(cutSize),
          expect(within(selector(`#${id}`), selector(".absolute"))).toHaveClass("bg-status-knockout"),
          expect(within(selector(`#${id}`), selector(".absolute span"))).toHaveClass(patchSize),
          expect(within(selector(`#${id}`), selector(".absolute span"))).toHaveClass(color)
        )
      })
    }
  }

  it("overhangs the corner at its end by 2px, and cuts its notch from the surface a row sets", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([], [mark(h, { text: "A", status: { kind: "available", label: "Ready" } })])
      },
      given(null),
      expect(selector(".absolute")).toHaveClass("-end-1"),
      expect(selector(".absolute")).toHaveClass("-bottom-1"),
      expect(text("A")).toHaveClass("relative")
    )
  })

  it("shapes each kind by more than its color: a triangle, a hollow square, a square with a bar", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            patchColors.map(([kind]) =>
              h.div([h.Id(kind)], [mark(h, { text: "A", status: { kind, label: `is ${kind}` } })])
            )
          )
      },
      given(null),
      expect(within(selector("#attention"), selector(".absolute span"))).toHaveClass(
        "[clip-path:polygon(50%_4%,100%_96%,0_96%)]"
      ),
      expect(within(selector("#offline"), selector(".absolute span"))).toHaveClass("border-[1.5px]"),
      expect(within(selector("#offline"), selector(".absolute span"))).toHaveClass("bg-status-knockout"),
      expect(within(selector("#blocked"), selector(".absolute span span"))).toHaveClass("bg-status-knockout"),
      expect(within(selector("#available"), selector(".absolute span span"))).toBeAbsent()
    )
  })

  it("says its word on hover, with why when it says, and stays hidden from assistive technology", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [
              mark(h, { text: "R", status: { kind: "attention", label: "Needs setup" } }),
              mark(h, {
                text: "S",
                status: {
                  kind: "blocked",
                  label: "Unavailable",
                  detail: "Its integration isn't installed on this host."
                }
              })
            ]
          )
      },
      given(null),
      expect(text("R")).toHaveAttr("title", "Needs setup"),
      expect(text("R")).toHaveAttr("aria-hidden", "true"),
      expect(text("S")).toHaveAttr("title", "Unavailable: Its integration isn't installed on this host."),
      expect(role("img")).toBeAbsent()
    )
  })
})

describe("statusMark", () => {
  it("is the shape alone at 9px, with its word on hover, hidden from assistive technology", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([h.Id("end")], [statusMark(h, { kind: "attention", label: "Needs setup" })])
      },
      given(null),
      expect(selector("#end [title]")).toHaveAttr("title", "Needs setup"),
      expect(selector("#end [title]")).toHaveAttr("aria-hidden", "true"),
      expect(selector("#end [title] span")).toHaveClass("size-2.25"),
      expect(selector("#end [title] span")).toHaveClass("bg-caution-mark"),
      expect(role("img")).toBeAbsent()
    )
  })
})

describe("activityMark", () => {
  it("is the logo in its working motion, hidden from assistive technology", () => {
    scene(
      { ...still, view: (_: null, h: HtmlBuilder<never>) => h.div([h.Id("work")], [activityMark(h)]) },
      given(null),
      expect(selector("#work svg")).toHaveAttr("aria-hidden", "true"),
      expect(selector("#work svg")).toHaveAttr("viewBox", "0 0 64 64"),
      expect(selector("#work svg")).toHaveAttr("width", "1rem"),
      expect(selector("#work svg")).toHaveClass("logo-working"),
      expect(role("img")).toBeAbsent()
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
