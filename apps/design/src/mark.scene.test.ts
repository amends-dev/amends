import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  activityMark,
  type MarkContent,
  type MarkSize,
  type MarkStatus,
  mark,
  markStack,
  statusMark,
  statusTooltip,
  type TaskStatusShape,
  taskStatus,
  taskStatusShapes
} from "./mark.ts"

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

describe("mark on the slate ground", () => {
  it("is the ground of a person who wrote a message, between the neutral and the lilac of an agent", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([], [mark(h, { text: "S", tone: "slate" }), mark(h, { text: "Y", tone: "lilac" })])
      },
      given(null),
      expect(text("S")).toHaveClass("bg-avatar-slate-bg"),
      expect(text("S")).toHaveClass("text-avatar-slate-fg"),
      expect(text("S")).not.toHaveClass("bg-avatar-neutral-bg"),
      expect(text("Y")).toHaveClass("bg-avatar-lilac-bg")
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

describe("mark of an account", () => {
  it("is 28px, with letters of 13px, hidden from assistive technology", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div([], [h.p([], ["ada@example.com"]), mark(h, { text: "a", size: "account" })])
      },
      given(null),
      expect(text("a")).toHaveClass("size-7"),
      expect(text("a")).toHaveClass("text-[0.8125rem]"),
      expect(text("a")).toHaveAttr("aria-hidden", "true")
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
                  detail: "Its integration isn’t installed on this host."
                }
              })
            ]
          )
      },
      given(null),
      expect(text("Unavailable")).toHaveClass("text-danger-text"),
      expect(text("Its integration isn’t installed on this host.")).toExist(),
      expect(within(selector("span.size-8"), selector("span.bg-danger-mark"))).toExist()
    )
  })
})

/** The cut-out and the patch a status has at each size: 8px on 24, 9 on 28 and 32, 10 on 40, and 7 on 20 and 22. */
const patchSizes: ReadonlyArray<readonly [MarkSize, string, string]> = [
  ["xs", "size-2.75", "size-1.75"],
  ["choice", "size-2.75", "size-1.75"],
  ["sm", "size-3", "size-2"],
  ["account", "size-3.25", "size-2.25"],
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

  it("says its word on hover in a tooltip, with why when it says and a tone by its shape, and stays hidden from assistive technology", () => {
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
                  detail: "Its integration isn’t installed on this host."
                }
              }),
              mark(h, { text: "A", status: { kind: "available", label: "Online" } })
            ]
          )
      },
      given(null),
      expect(text("R")).not.toHaveAttr("title"),
      expect(text("R")).toHaveAttr("aria-hidden", "true"),
      expect(text("Needs setup")).toHaveClass("text-caution-text"),
      expect(text("Unavailable")).toHaveClass("text-danger-text"),
      expect(text("Its integration isn’t installed on this host.")).toHaveClass("text-ink-secondary"),
      expect(text("Online")).toHaveClass("text-ink"),
      expect(role("img")).toBeAbsent()
    )
  })

  it("puts the tooltip above the mark, or below it when it says it has no room above", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [
              h.div([h.Id("above")], [mark(h, { text: "R", status: { kind: "attention", label: "Needs setup" } })]),
              h.div(
                [h.Id("below")],
                [
                  mark(h, {
                    text: "S",
                    status: { kind: "attention", label: "Needs setup" },
                    statusPlacement: "below"
                  })
                ]
              )
            ]
          )
      },
      given(null),
      expect(within(selector("#above"), selector(".tooltip-above"))).toExist(),
      expect(within(selector("#above"), selector(".tooltip-below"))).toBeAbsent(),
      expect(within(selector("#below"), selector(".tooltip-below"))).toExist(),
      expect(within(selector("#below"), selector(".tooltip-above"))).toBeAbsent()
    )
  })

  it("is wrapped in the trigger of its tooltip only when it has a status", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [h.Id("marks")],
            [mark(h, { text: "S" }), mark(h, { text: "R", status: { kind: "attention", label: "Needs setup" } })]
          )
      },
      given(null),
      expectAll(all.selector("#marks .tooltip-anchor")).toHaveCount(1),
      expect(within(selector(".tooltip-anchor"), text("R"))).toExist()
    )
  })
})

describe("statusTooltip", () => {
  it("is the status's label as the title, why under it, and the tone of its shape: none, caution, or danger", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [
              statusTooltip(h, { kind: "offline", label: "Offline" }, [h.span([], ["o"])]),
              statusTooltip(h, { kind: "attention", label: "Needs setup", detail: "The key is missing." }, [
                h.span([], ["n"])
              ]),
              statusTooltip(h, { kind: "blocked", label: "Unavailable" }, [h.span([], ["u"])], "below")
            ]
          )
      },
      given(null),
      expect(text("Offline")).toHaveClass("text-ink"),
      expect(text("Needs setup")).toHaveClass("text-caution-text"),
      expect(text("The key is missing.")).toExist(),
      expect(text("Unavailable")).toHaveClass("text-danger-text"),
      expect(selector(".tooltip-below")).toExist(),
      expect(text("o")).toExist()
    )
  })
})

describe("statusMark", () => {
  it("is the shape alone at 9px, hidden from assistive technology, with nothing to say on hover", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) => h.div([h.Id("end")], [statusMark(h, "attention")])
      },
      given(null),
      expect(within(selector("#end"), selector("[aria-hidden]"))).toHaveAttr("aria-hidden", "true"),
      expect(within(selector("#end"), selector("span span"))).toHaveClass("size-2.25"),
      expect(within(selector("#end"), selector("span span"))).toHaveClass("bg-caution-mark"),
      expect(within(selector("#end"), selector("[title]"))).toBeAbsent(),
      expect(within(selector("#end"), selector(".tooltip-anchor"))).toBeAbsent(),
      expect(role("img")).toBeAbsent()
    )
  })
})

describe("activityMark", () => {
  it("is the logo at 0.875rem in its working motion, hidden from assistive technology", () => {
    scene(
      { ...still, view: (_: null, h: HtmlBuilder<never>) => h.div([h.Id("work")], [activityMark(h)]) },
      given(null),
      expect(selector("#work svg")).toHaveAttr("aria-hidden", "true"),
      expect(selector("#work svg")).toHaveAttr("viewBox", "0 0 64 64"),
      expect(selector("#work svg")).toHaveAttr("width", "0.875rem"),
      expect(selector("#work svg")).toHaveClass("logo-working"),
      expect(role("img")).toBeAbsent()
    )
  })

  it("moves as the motion says: the thread drawn through while it waits, the patch tugged while it stops", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [h.span([h.Id("waits")], [activityMark(h, "thread")]), h.span([h.Id("stops")], [activityMark(h, "tug")])]
          )
      },
      given(null),
      expect(selector("#waits svg")).toHaveClass("logo-thread"),
      expect(selector("#waits svg")).toHaveAttr("width", "0.875rem"),
      expect(selector("#stops svg")).toHaveClass("logo-tug"),
      expect(selector("#stops svg")).not.toHaveClass("logo-working")
    )
  })
})

describe("taskStatus", () => {
  const drawn = (shape: TaskStatusShape, size?: string) => (_: null, h: HtmlBuilder<never>) =>
    h.div([h.Id("status")], [taskStatus(h, shape, size === undefined ? {} : { size })])

  it("is a circle on a 16-unit grid, 0.875rem wide unless given a size, hidden from assistive technology", () => {
    scene(
      { ...still, view: drawn("open") },
      given(null),
      expect(selector("#status svg")).toHaveAttr("viewBox", "0 0 16 16"),
      expect(selector("#status svg")).toHaveAttr("width", "0.875rem"),
      expect(selector("#status svg")).toHaveAttr("height", "0.875rem"),
      expect(selector("#status svg")).toHaveAttr("aria-hidden", "true"),
      expect(selector("#status circle")).toHaveAttr("r", "6.4"),
      expect(selector("#status circle")).toHaveAttr("fill", "none"),
      expect(role("img")).toBeAbsent()
    )
    scene(
      { ...still, view: drawn("open", "1rem") },
      given(null),
      expect(selector("#status svg")).toHaveAttr("width", "1rem")
    )
  })

  it("is gray, and ink once the task is done, which is the one filled circle, with a check in the color of an action's text", () => {
    scene(
      { ...still, view: drawn("progress") },
      given(null),
      expect(selector("#status svg")).toHaveClass("text-ink-secondary"),
      expect(selector("#status svg")).not.toHaveClass("text-ink")
    )
    scene(
      { ...still, view: drawn("done") },
      given(null),
      expect(selector("#status svg")).toHaveClass("text-ink"),
      expect(selector("#status svg")).not.toHaveClass("text-ink-secondary"),
      expect(selector("#status circle")).toHaveAttr("fill", "currentColor"),
      expect(selector("#status path")).toHaveClass("stroke-on-action")
    )
  })

  it("draws what each shape means in the circle: a bar and a point for triage, half for progress, two bars for paused, and a cross for dismissed", () => {
    scene(
      { ...still, view: drawn("triage") },
      given(null),
      expect(selector("#status circle[r='6.4']")).toExist(),
      expect(selector("#status path")).toHaveAttr("d", "M8 4.6 V8.8"),
      expect(selector("#status circle[r='0.8']")).toHaveAttr("fill", "currentColor")
    )
    scene(
      { ...still, view: drawn("progress") },
      given(null),
      expect(selector("#status path")).toHaveAttr("d", "M8 3.6 A4.4 4.4 0 0 0 8 12.4 Z"),
      expect(selector("#status path")).toHaveAttr("fill", "currentColor")
    )
    scene(
      { ...still, view: drawn("paused") },
      given(null),
      expect(nth(all.selector("#status path"), 0)).toHaveAttr("d", "M6.5 5.8 V10.2"),
      expect(nth(all.selector("#status path"), 1)).toHaveAttr("d", "M9.5 5.8 V10.2")
    )
    scene(
      { ...still, view: drawn("dismissed") },
      given(null),
      expect(nth(all.selector("#status path"), 0)).toHaveAttr("d", "M6.2 6.2 L9.8 9.8"),
      expect(nth(all.selector("#status path"), 1)).toHaveAttr("d", "M9.8 6.2 L6.2 9.8")
    )
    scene({ ...still, view: drawn("open") }, given(null), expect(selector("#status path")).toBeAbsent())
  })

  it("draws every shape it lists as a circle", () => {
    for (const shape of taskStatusShapes) {
      scene({ ...still, view: drawn(shape) }, given(null), expect(selector("#status circle[r='6.4']")).toExist())
    }
  })
})

const Message = defineMessageUnion({ ClickedMembers: {} })
type Message = typeof Message.Type

type Model = Readonly<{ openings: number }>

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedMembers: () => ({ model: modifyFields(model, { openings: (openings) => openings + 1 }) })
  })

const stackOf = (people: ReadonlyArray<MarkContent>, label: string) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Opened ${model.openings} times`]),
      markStack(h, { marks: people, label, onClick: Message.ClickedMembers() })
    ]
  )

describe("markStack", () => {
  it("is a button named by its label, and clicking it sends its message", () => {
    scene(
      { update, view: stackOf([{ text: "AM" }, { text: "Y" }], "2 members") },
      given({ openings: 0 }),
      expect(role("button", { name: "2 members" })).toExist(),
      click(role("button", { name: "2 members" })),
      click(role("button", { name: "2 members" })),
      expect(role("status")).toHaveText("Opened 2 times")
    )
  })

  it("draws each mark it is given at 22px in its tone, hidden from assistive technology, and no count", () => {
    scene(
      {
        update,
        view: stackOf([{ text: "AM" }, { text: "Y", tone: "lilac" }, { text: "S" }, { text: "OK" }], "9 members")
      },
      given({ openings: 0 }),
      expect(within(role("button"), text("AM"))).toHaveClass("size-5.5"),
      expect(within(role("button"), text("AM"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("button"), text("Y"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button"), text("OK"))).toHaveClass("size-5.5"),
      expect(within(role("button"), text("S"))).toHaveAttr("aria-hidden", "true"),
      expect(text(/\+\d/)).toBeAbsent()
    )
  })

  it("overlaps the marks by 5px, is 32px tall and 44px on touch, and is not shown below 48rem", () => {
    scene(
      { update, view: stackOf([{ text: "AM" }, { text: "Y" }], "2 members") },
      given({ openings: 0 }),
      expect(within(role("button"), selector("span.inline-flex"))).toHaveClass("[&>*+*]:-ms-1.25"),
      expect(role("button", { name: "2 members" })).toHaveClass("h-8"),
      expect(role("button", { name: "2 members" })).toHaveClass("max-desktop:h-11"),
      expect(role("button", { name: "2 members" })).toHaveClass("max-tablet:hidden")
    )
  })
})
