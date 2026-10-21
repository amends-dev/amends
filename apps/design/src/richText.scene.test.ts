import { describe, expect as expectValue, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import type { ProfileOpener } from "./profile.ts"
import { type RichTextConfig, richText, richTextWords } from "./richText.ts"

const Message = defineMessageUnion({ Unused: {} })
type Message = typeof Message.Type

const update = (model: null, _message: Message): Update.Return<null, Message> => ({ model })

const richView =
  (config: RichTextConfig<Message>) =>
  (_: null, h: HtmlBuilder<Message>): Html =>
    h.div([], [richText(h, config)])

const ada = { id: "member-1", name: "Ada Lovelace" }

const mention = (id: string, label: string) => `[@${label}](member:${id})`

describe("richText", () => {
  it("is a column of blocks, a paragraph for each, with a line break where the text has one", () => {
    scene(
      { update, view: richView({ text: "one\ntwo\n\nthree" }) },
      given(null),
      expectAll(all.selector("p")).toHaveCount(2),
      expect(selector("p br")).toExist(),
      expect(selector("div div")).toHaveClass("flex-col"),
      expect(selector("div div")).toHaveClass("gap-2")
    )
  })

  it("shows emphasis, strong text, strikethrough, and inline code in the words around them", () => {
    scene(
      { update, view: richView({ text: "*lean* **bold** ~~gone~~ `code`" }) },
      given(null),
      expect(selector("em")).toHaveText("lean"),
      expect(selector("strong")).toHaveText("bold"),
      expect(selector("del")).toHaveText("gone"),
      expect(selector("code")).toHaveText("code"),
      expect(selector("code")).toHaveClass("font-mono"),
      expect(selector("code")).toHaveClass("bg-subtle")
    )
  })

  it("keeps a code block as written, with its language", () => {
    scene(
      { update, view: richView({ text: "```ts\n  a  <b> &amp;\n```" }) },
      given(null),
      expect(selector("pre")).toHaveClass("whitespace-pre"),
      expect(selector("pre code")).toHaveText("  a  <b> &amp;"),
      expect(selector("pre code")).toHaveAttr("data-language", "ts")
    )
    scene(
      { update, view: richView({ text: "```\nplain\n```" }) },
      given(null),
      expect(selector("pre code")).toHaveText("plain"),
      expect(selector("pre code[data-language]")).toBeAbsent()
    )
  })

  it("sets a quote apart, holding blocks of its own", () => {
    scene(
      { update, view: richView({ text: "> first\n>\n> second" }) },
      given(null),
      expect(selector("blockquote")).toHaveClass("border-s-2"),
      expect(selector("blockquote")).toHaveClass("text-ink-secondary"),
      expectAll(all.selector("blockquote p")).toHaveCount(2)
    )
  })

  it("keeps a heading at the text's size, only heavier, and not a heading of the page", () => {
    scene(
      { update, view: richView({ text: "# Plan\n\n### Next" }) },
      given(null),
      expect(role("heading")).toBeAbsent(),
      expect(text("Plan")).toHaveClass("font-semibold"),
      expect(text("Next")).toHaveClass("font-semibold")
    )
  })

  it("lists bulleted items, and numbered ones from the number the text starts at", () => {
    scene(
      { update, view: richView({ text: "- one\n- two\n\n3. three\n4. four" }) },
      given(null),
      expectAll(all.selector("ul li")).toHaveCount(2),
      expectAll(all.selector("ol li")).toHaveCount(2),
      expect(selector("ol")).toHaveAttr("start", "3"),
      expect(selector("ul li")).toHaveText("one")
    )
    scene(
      { update, view: richView({ text: "1. first\n2. second" }) },
      given(null),
      expect(selector("ol")).toHaveAttr("start", "1")
    )
  })

  it("draws a task item's box where the bullet would be, checked when the text says it is done", () => {
    scene(
      { update, view: richView({ text: "- [x] shipped\n- [ ] to do\n- plain" }) },
      given(null),
      expect(role("checkbox", { name: "Done" })).toExist(),
      expect(role("checkbox", { name: "Not done" })).toExist(),
      expect(role("checkbox", { name: "Done" })).toHaveAttr("aria-checked", "true"),
      expect(role("checkbox", { name: "Not done" })).toHaveAttr("aria-checked", "false"),
      expect(role("checkbox", { name: "Done" })).toHaveAttr("aria-disabled", "true"),
      expect(within(role("checkbox", { name: "Done" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("checkbox", { name: "Not done" }), selector("svg"))).toBeAbsent(),
      expect(text("shipped")).toExist(),
      expectAll(all.role("checkbox")).toHaveCount(2)
    )
  })

  it("shows a table that scrolls sideways when wide, its columns aligned as the text aligns them", () => {
    scene(
      { update, view: richView({ text: "| Name | Count |\n| :--- | ---: |\n| Ada | 3 |" }) },
      given(null),
      expect(selector("table")).toExist(),
      expect(selector("table")).toHaveClass("border-collapse"),
      expect(text("Name")).toHaveClass("bg-subtle"),
      expect(text("Name")).toHaveClass("text-start"),
      expect(text("Count")).toHaveClass("text-end"),
      expect(text("3")).toHaveClass("text-end"),
      expect(text("Ada")).toHaveClass("border")
    )
    scene(
      { update, view: richView({ text: "| A |\n| - |\n| b |" }) },
      given(null),
      expect(selector("div div div")).toHaveClass("overflow-x-auto")
    )
  })

  it("draws a rule for a thematic break", () => {
    scene({ update, view: richView({ text: "above\n\n---\n\nbelow" }) }, given(null), expect(selector("hr")).toExist())
  })

  it("links only web and email addresses, in a new tab, and shows the text of any other link", () => {
    scene(
      {
        update,
        view: richView({
          text:
            "[web](https://example.com) [mail](mailto:a@example.com) [script](javascript:alert(1)) " +
            "[page](/relative) [data](data:text/html;base64,x)"
        })
      },
      given(null),
      expectAll(all.selector("a")).toHaveCount(2),
      expect(text("web")).toHaveAttr("href", "https://example.com"),
      expect(text("web")).toHaveAttr("target", "_blank"),
      expect(text("web")).toHaveAttr("rel", "noopener noreferrer"),
      expect(text("web")).toHaveClass("underline"),
      expect(text("mail")).toHaveAttr("href", "mailto:a@example.com"),
      expect(selector("a[href^='javascript']")).toBeAbsent(),
      expect(selector("p")).toContainText("script page data")
    )
  })

  it("gives a link its title", () => {
    scene(
      { update, view: richView({ text: '[docs](https://example.com "The docs &amp; guides")' }) },
      given(null),
      expect(text("docs")).toHaveAttr("title", "The docs & guides")
    )
  })

  it("shows an image as a link to it, and never loads one", () => {
    scene(
      {
        update,
        view: richView({
          text: "![chart](https://example.com/chart.png) ![local](data:image/png;base64,x) ![](/x.png)"
        })
      },
      given(null),
      expect(selector("img")).toBeAbsent(),
      expectAll(all.selector("a")).toHaveCount(1),
      expect(text("chart")).toHaveAttr("href", "https://example.com/chart.png"),
      expect(selector("p")).toContainText("local /x.png")
    )
  })

  it("shows raw HTML as written, never as elements", () => {
    scene(
      { update, view: richView({ text: '<img src=x onerror="alert(1)"> and <script>alert(2)</script>' }) },
      given(null),
      expect(selector("img")).toBeAbsent(),
      expect(selector("script")).toBeAbsent(),
      expect(selector("p")).toContainText('<img src=x onerror="alert(1)"> and')
    )
    scene(
      { update, view: richView({ text: "<div>block</div>\n\nafter" }) },
      given(null),
      expect(text("<div>block</div>")).toExist(),
      expect(text("after")).toExist()
    )
  })

  it("reads entity references as the characters they name, except in code", () => {
    scene(
      { update, view: richView({ text: "Tom &amp; Jerry &lt;3 &copy; &#169; &#x1F600; &bogus; &#0; `&amp;`" }) },
      given(null),
      expect(selector("p")).toHaveText("Tom & Jerry <3 © © 😀 &bogus; � &amp;")
    )
  })

  it("shows a mention as a chip with the name the member has now, or the recorded name for anyone else", () => {
    scene(
      {
        update,
        view: richView({
          text: `${mention("member-1", "Ada")} and ${mention("gone", "Old name")} and ${mention("member-2", "x")}`,
          mentions: [ada, { id: "member-2", name: "Grace" }]
        })
      },
      given(null),
      expect(text("@Ada Lovelace")).toHaveClass("bg-mention"),
      expect(text("@Ada Lovelace")).toHaveClass("font-semibold"),
      expect(text("@Old name")).toHaveClass("bg-mention"),
      expect(text("@Grace")).toHaveClass("bg-mention"),
      expect(text("@Ada")).toBeAbsent(),
      expect(selector("a")).toBeAbsent(),
      expect(selector("p")).toHaveText("@Ada Lovelace and @Old name and @Grace")
    )
  })

  it("reads a mention of a member whose id needs encoding", () => {
    scene(
      {
        update,
        view: richView({
          text: `${mention("member%20one", "Ada")} ${mention("%E0%A4%A", "Broken")}`,
          mentions: [{ id: "member one", name: "Ada Lovelace" }]
        })
      },
      given(null),
      expect(text("@Ada Lovelace")).toHaveClass("bg-mention"),
      expect(selector("p")).toContainText("Broken")
    )
  })

  it("shows a mention in a list, a quote, and strong text", () => {
    scene(
      {
        update,
        view: richView({
          text: `- ${mention("member-1", "Ada")} first\n\n> **${mention("member-1", "Ada")}**`,
          mentions: [ada]
        })
      },
      given(null),
      expectAll(all.selector("span.bg-mention")).toHaveCount(2)
    )
  })

  it("is one span of words and mentions, without layout or formatting, when it is inline", () => {
    scene(
      {
        update,
        view: richView({
          text: `# Plan\n\n${mention("member-1", "Ada")} please:\n\n- **ship**\n- \`test\`\n\n> soon`,
          mentions: [ada],
          isInline: true
        })
      },
      given(null),
      expect(selector("div span")).toHaveText("Plan @Ada Lovelace please: ship test soon"),
      expect(selector("p")).toBeAbsent(),
      expect(selector("strong")).toBeAbsent(),
      expect(selector("code")).toBeAbsent(),
      expect(selector("li")).toBeAbsent(),
      expect(selector("blockquote")).toBeAbsent(),
      expect(selector("a")).toBeAbsent(),
      expect(text("@Ada Lovelace")).toHaveClass("bg-mention")
    )
  })

  it("leaves a link's words and an image's name in an inline preview, and breaks lines into spaces", () => {
    scene(
      {
        update,
        view: richView({
          text: "see [the docs](https://example.com)\nand ![chart](https://example.com/c.png)",
          isInline: true
        })
      },
      given(null),
      expect(selector("div span")).toHaveText("see the docs and chart"),
      expect(selector("a")).toBeAbsent()
    )
  })

  it("shows nothing for empty text", () => {
    scene(
      { update, view: richView({ text: "" }) },
      given(null),
      expect(selector("p")).toBeAbsent(),
      expect(selector("div div")).toHaveText("")
    )
    scene(
      { update, view: richView({ text: " \n ", isInline: true }) },
      given(null),
      expect(selector("div span")).toHaveText("")
    )
  })
})

describe("richTextWords", () => {
  it("is the words of the text without its syntax, a space between blocks", () => {
    expectValue(
      richTextWords({ text: "# Plan\n\nShip **it** `now`\n\n- one\n- two\n\n> quoted\n\n```\ncode\n```" })
    ).toBe("Plan Ship it now one two quoted code")
  })

  it("reads a mention as the name the member has now, or the one the text recorded", () => {
    const text = `Hey ${mention("member-1", "Ada")}, ${mention("gone", "Old name")} look`
    expectValue(richTextWords({ text, mentions: [ada] })).toBe("Hey @Ada Lovelace, @Old name look")
    expectValue(richTextWords({ text })).toBe("Hey @Ada, @Old name look")
  })

  it("reads a link as its words, an image as its name, and entity references as their characters", () => {
    expectValue(richTextWords({ text: "[docs](https://example.com) ![chart](/c.png) Tom &amp; Jerry" })).toBe(
      "docs chart Tom & Jerry"
    )
  })

  it("is the text of the inline form, and nothing for empty text", () => {
    expectValue(richTextWords({ text: "" })).toBe("")
    expectValue(richTextWords({ text: "\n\n" })).toBe("")
  })
})

describe("richText mentions that open cards", () => {
  const OpenedProfile = defineMessageUnion({ OpenedProfile: { memberId: Schema.String, triggerId: Schema.String } })
  type OpenedProfile = typeof OpenedProfile.Type

  const profiles = (openTriggerId?: string): ProfileOpener<OpenedProfile> => ({
    scope: "thread-message-1",
    openTriggerId,
    open: (memberId, triggerId) => OpenedProfile.OpenedProfile({ memberId, triggerId })
  })

  const opened = (_model: string, message: OpenedProfile): Update.Return<string, OpenedProfile> => ({
    model: `${message.memberId} from ${message.triggerId}`
  })

  const openingView =
    (config: RichTextConfig<OpenedProfile>) =>
    (model: string, h: HtmlBuilder<OpenedProfile>): Html =>
      h.div([], [h.p([h.Id("opened")], [model]), richText(h, config)])

  it("makes each a button named by the chip, with an id of the scope, mention, and its number, that opens the member's card", () => {
    scene(
      {
        update: opened,
        view: openingView({
          text: `${mention("member-1", "Ada")} and ${mention("member-2", "x")} and ${mention("member-1", "Ada")}`,
          mentions: [ada, { id: "member-2", name: "Grace" }],
          profiles: profiles()
        })
      },
      given(""),
      expect(nth(all.role("button", { name: "@Ada Lovelace" }), 0)).toHaveAttr("id", "thread-message-1-mention-0"),
      expect(role("button", { name: "@Grace" })).toHaveAttr("id", "thread-message-1-mention-1"),
      expect(nth(all.role("button", { name: "@Ada Lovelace" }), 1)).toHaveAttr("id", "thread-message-1-mention-2"),
      expect(role("button", { name: "@Grace" })).toHaveClass("bg-mention"),
      expect(role("button", { name: "@Grace" })).toHaveClass("font-semibold"),
      click(role("button", { name: "@Grace" })),
      expect(selector("#opened")).toHaveText("member-2 from thread-message-1-mention-1")
    )
  })

  it("opens the card of a member it does not know, by the name the text recorded", () => {
    scene(
      {
        update: opened,
        view: openingView({ text: mention("gone", "Old name"), mentions: [], profiles: profiles() })
      },
      given(""),
      click(role("button", { name: "@Old name" })),
      expect(selector("#opened")).toHaveText("gone from thread-message-1-mention-0")
    )
  })

  it("says which mention has its card open, and no other", () => {
    scene(
      {
        update: opened,
        view: openingView({
          text: `${mention("member-1", "Ada")} ${mention("member-2", "Grace")}`,
          mentions: [ada, { id: "member-2", name: "Grace" }],
          profiles: profiles("thread-message-1-mention-1")
        })
      },
      given(""),
      expect(role("button", { name: "@Ada Lovelace" })).toHaveAttr("aria-expanded", "false"),
      expect(role("button", { name: "@Grace" })).toHaveAttr("aria-expanded", "true")
    )
  })

  it("opens one from a list, a quote, and strong text", () => {
    scene(
      {
        update: opened,
        view: openingView({
          text: `- ${mention("member-1", "Ada")} first\n\n> **${mention("member-1", "Ada")}**`,
          mentions: [ada],
          profiles: profiles()
        })
      },
      given(""),
      expectAll(all.role("button", { name: "@Ada Lovelace" })).toHaveCount(2)
    )
  })

  it("leaves a mention a chip that opens nothing without profiles, and in a preview", () => {
    scene(
      { update: opened, view: openingView({ text: mention("member-1", "Ada"), mentions: [ada] }) },
      given(""),
      expect(role("button")).toBeAbsent(),
      expect(text("@Ada Lovelace")).toHaveClass("bg-mention")
    )
    scene(
      {
        update: opened,
        view: openingView({ text: mention("member-1", "Ada"), mentions: [ada], isInline: true, profiles: profiles() })
      },
      given(""),
      expect(role("button")).toBeAbsent(),
      expect(text("@Ada Lovelace")).toHaveClass("bg-mention")
    )
  })
})
