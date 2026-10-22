/**
 * A message's markdown as elements, as `apps/ui`'s `RichText` shows it: paragraphs, emphasis, code, quotes, lists,
 * tables, links, and the members a text mentions, or, for a preview, the same text as one run of words and mentions.
 * No HTML is ever set on the page: every token of the markdown becomes an element of the caller's builder.
 */

import {
  type Markdown,
  type NameOf,
  type MarkedToken,
  type Token,
  type Tokens,
  knownToken,
  mentionedMemberId,
  decodeEntities,
  nestedTokens,
  nameLookup,
  mentionLabel,
  recordedLabelOf,
  previewRuns,
  parseMarkdown
} from "@amends-dev/markdown"
import * as Array from "effect/Array"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { icon } from "./icon.ts"
import { type ProfileOpener, profileTrigger } from "./profile.ts"

const blocksLook = "flex min-w-0 flex-col gap-2 wrap-anywhere"

const inlineLook = "wrap-anywhere"

const paragraphLook = "m-0"

const headingLook = "m-0 font-semibold"

const quoteLook = "m-0 flex flex-col gap-2 border-s-2 border-outline ps-3 text-ink-secondary"

const listLook = "m-0 flex flex-col gap-0.5 ps-6"

const bulletedLook = `${listLook} list-disc`

const numberedLook = `${listLook} list-decimal`

const itemLook = "marker:text-ink-secondary"

const taskLook = "-ms-6 flex list-none items-start gap-2"

const taskBoxLook =
  "mt-[calc((1lh_-_0.875rem)/2)] box-border inline-flex size-3.5 flex-none items-center justify-center border border-outline-selected bg-field aria-checked:border-ink aria-checked:bg-ink aria-checked:text-on-action"

const itemBodyLook = "flex min-w-0 flex-col gap-0.5"

const codeLook = "border border-outline bg-subtle px-1 font-mono text-[0.875em]"

const preLook =
  "m-0 overflow-x-auto border border-outline bg-subtle px-3 py-2 font-mono text-control whitespace-pre wrap-normal [tab-size:2]"

const linkLook = "text-inherit underline decoration-outline-strong underline-offset-3 hover:decoration-ink focus-ring"

const mentionLook = "bg-mention px-0.75 font-semibold"

const ruleLook = "m-0 w-full border-0 border-t border-divider"

const tableScrollLook = "max-w-full overflow-x-auto"

const tableLook = "border-collapse text-control wrap-normal"

const cellLook = "border border-outline px-2 py-1 align-top"

const headerCellLook = `${cellLook} bg-subtle font-semibold`

const alignLooks = { center: "text-center", right: "text-end", left: "text-start" } as const

export type RichTextConfig<Message> = Markdown &
  Readonly<{
    /** One run of words and mentions without layout or formatting, such as a preview's, in place of blocks. */
    isInline?: boolean | undefined
    /** How a mention opens the card of the member it names; a mention opens nothing without it, or in a preview. */
    profiles?: ProfileOpener<Message> | undefined
  }>

const linkableProtocols = new Set(["http:", "https:", "mailto:"])

const parseUrl = Option.liftThrowable((address: string) => new URL(address))

/** The link's address if it leads to a web page or an email address, which alone may link. */
const linkableHref = (href: string): Option.Option<string> =>
  parseUrl(href).pipe(
    Option.filter(({ protocol }) => linkableProtocols.has(protocol)),
    Option.map(() => href)
  )

type Renderer<Message, Requirements> = Readonly<{
  h: HtmlBuilder<Message, Requirements>
  nameOf: NameOf
  profiles: ProfileOpener<Message> | undefined
  nextMentionPart: () => string
}>

const renderMentionChip = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, label: string): Html =>
  h.span([h.Class(mentionLook)], [label])

/** A mention as a chip, a button that opens the member’s card when the text has somewhere to open it. */
const renderMention = <Message, Requirements>(
  { h, profiles, nextMentionPart }: Renderer<Message, Requirements>,
  memberId: string,
  label: string
): Html =>
  profiles === undefined
    ? renderMentionChip(h, label)
    : profileTrigger(h, profiles, { memberId, part: nextMentionPart(), look: mentionLook, children: [label] })

/** A link to a web page or an email address, opening in a new tab, in place of the image or link it shows. */
const renderLink = <Message, Requirements>(
  { h }: Renderer<Message, Requirements>,
  link: Readonly<{ href: string; title?: string | null | undefined }>,
  children: ReadonlyArray<Html | string>
): Html =>
  h.a(
    [
      h.Href(link.href),
      h.Target("_blank"),
      h.Rel("noopener noreferrer"),
      ...(link.title ? [h.Title(decodeEntities(link.title))] : []),
      h.Class(linkLook)
    ],
    children
  )

const renderInlines = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  tokens: ReadonlyArray<Token>
): ReadonlyArray<Html | string> => tokens.flatMap((token) => renderInlineToken(renderer, knownToken(token)))

const renderTextToken = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  token: Tokens.Text
): ReadonlyArray<Html | string> => {
  const nested = nestedTokens(token)

  return Array.isReadonlyArrayNonEmpty(nested) ? renderInlines(renderer, nested) : [decodeEntities(token.text)]
}

const renderInlineToken = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  token: MarkedToken
): ReadonlyArray<Html | string> => {
  const { h, nameOf } = renderer

  return Match.value(token).pipe(
    Match.discriminators("type")({
      text: (text) => renderTextToken(renderer, text),
      escape: ({ text }) => [text],
      strong: ({ tokens }) => [h.strong([], renderInlines(renderer, tokens))],
      em: ({ tokens }) => [h.em([], renderInlines(renderer, tokens))],
      del: ({ tokens }) => [h.del([], renderInlines(renderer, tokens))],
      codespan: ({ text }) => [h.code([h.Class(codeLook)], [text])],
      br: () => [h.br([])],
      link: (link) =>
        Option.match(mentionedMemberId(link.href), {
          onSome: (memberId) => [
            renderMention(renderer, memberId, mentionLabel(nameOf, memberId, recordedLabelOf(nameOf, link)))
          ],
          onNone: () =>
            Option.match(linkableHref(link.href), {
              onNone: () => renderInlines(renderer, link.tokens),
              onSome: (href) => [
                renderLink(renderer, { href, title: link.title }, renderInlines(renderer, link.tokens))
              ]
            })
        }),
      image: ({ href, text }) => {
        const label = decodeEntities(text) || href

        return Option.match(linkableHref(href), {
          onNone: () => [label],
          onSome: (linkable) => [renderLink(renderer, { href: linkable }, [label])]
        })
      }
    }),
    Match.orElse(({ raw }) => [raw])
  )
}

const renderBlocks = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  tokens: ReadonlyArray<Token>
): ReadonlyArray<Html> => tokens.map((token) => renderBlockToken(renderer, knownToken(token)))

const renderListItem = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  item: Tokens.ListItem
): Html => {
  const { h } = renderer
  const content = renderBlocks(
    renderer,
    item.tokens.filter(({ type }) => type !== "checkbox")
  )

  if (!item.task) {
    return h.li([h.Class(itemLook)], content)
  }

  const isDone = item.checked === true

  return h.li(
    [h.Class(taskLook)],
    [
      h.span(
        [
          h.Role("checkbox"),
          h.AriaChecked(isDone),
          h.AriaDisabled(true),
          h.AriaLabel(isDone ? "Done" : "Not done"),
          h.Class(taskBoxLook)
        ],
        isDone ? [icon(h, "check", { size: "xs" })] : []
      ),
      h.div([h.Class(itemBodyLook)], content)
    ]
  )
}

const renderTable = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  { header, rows }: Tokens.Table
): Html => {
  const { h } = renderer
  const renderCell = (cell: Tokens.TableCell, look: string, element: typeof h.td): Html =>
    element([h.Class(`${look} ${alignLooks[cell.align ?? "left"]}`)], renderInlines(renderer, cell.tokens))

  return h.div(
    [h.Class(tableScrollLook)],
    [
      h.table(
        [h.Class(tableLook)],
        [
          h.thead(
            [],
            [
              h.tr(
                [],
                header.map((cell) => renderCell(cell, headerCellLook, h.th))
              )
            ]
          ),
          h.tbody(
            [],
            rows.map((row) =>
              h.tr(
                [],
                row.map((cell) => renderCell(cell, cellLook, h.td))
              )
            )
          )
        ]
      )
    ]
  )
}

const renderBlockToken = <Message, Requirements>(
  renderer: Renderer<Message, Requirements>,
  token: MarkedToken
): Html => {
  const { h } = renderer
  const paragraph = (children: ReadonlyArray<Html | string>, look = paragraphLook): Html =>
    h.p([h.Class(look)], children)

  return Match.value(token).pipe(
    Match.discriminators("type")({
      space: () => h.empty,
      def: () => h.empty,
      paragraph: ({ tokens }) => paragraph(renderInlines(renderer, tokens)),
      text: (text) => paragraph(renderTextToken(renderer, text)),
      heading: ({ tokens }) => paragraph(renderInlines(renderer, tokens), headingLook),
      code: ({ text, lang }) =>
        h.pre([h.Class(preLook)], [h.code(lang ? [h.DataAttribute("language", lang)] : [], [text])]),
      blockquote: ({ tokens }) => h.blockquote([h.Class(quoteLook)], renderBlocks(renderer, tokens)),
      list: ({ ordered, start, items }) => {
        const children = items.map((item) => renderListItem(renderer, item))

        return ordered
          ? h.ol([...(start === "" ? [] : [h.Start(start)]), h.Class(numberedLook)], children)
          : h.ul([h.Class(bulletedLook)], children)
      },
      table: (table) => renderTable(renderer, table),
      hr: () => h.hr([h.Class(ruleLook)]),
      html: ({ raw }) => paragraph([raw.trimEnd()])
    }),
    Match.orElse(({ raw }) => paragraph([raw]))
  )
}

/**
 * `config.text` as the markdown it is, in the type around it: paragraphs with a line break where the text has one,
 * emphasis, strong text, strikethrough, inline code and code blocks, quotes, numbered, bulleted, and task lists,
 * tables that scroll sideways when wide, rules, headings that keep the text’s size and only weigh more, links, and
 * mentions. A mention, a link to `member:<id>`, is a chip with "@" and the member’s current name among `mentions`, or
 * the name the text recorded for anyone else. Only web and email addresses link, in a new tab; any other link shows
 * its text. Images are not loaded: they show as links to them. Raw HTML shows as written, and entity references as the
 * characters they name, except in code. With `profiles` each mention is a button that opens the card of the member it
 * names, with an id made of the scope, "mention", and the mention’s number in the text. With `isInline` it is one run
 * of words and mentions, a `span` without layout or formatting, for a preview, whose mentions open nothing.
 */
export const richText = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: RichTextConfig<Message>
): Html => {
  if (config.isInline === true) {
    return h.span(
      [h.Class(inlineLook)],
      previewRuns(config).map((run) => (run.isMention ? renderMentionChip(h, run.text) : run.text))
    )
  }

  let mentionCount = 0
  const nextMentionPart = () => `mention-${mentionCount++}`

  return h.div(
    [h.Class(blocksLook)],
    renderBlocks(
      { h, nameOf: nameLookup(config.mentions ?? []), profiles: config.profiles, nextMentionPart },
      parseMarkdown(config.text)
    )
  )
}
