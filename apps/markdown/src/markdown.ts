/** Chat Markdown parsing, mention resolution, and plain text, without a renderer or browser. */

import * as Array from "effect/Array"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import { Marked, type MarkedToken, type Token, type Tokens } from "marked"

export type { MarkedToken, Token, Tokens } from "marked"

/** A message's markdown, and the members its mentions may name. */
export type Markdown = Readonly<{
  /** Markdown, such as a message's text. A mention is a link to the member, `[@Ada](member:<id>)`. */
  text: string
  /** Who a mention names, as they are called now; a mention of anyone else shows the name the text recorded. */
  mentions?: ReadonlyArray<Mention> | undefined
}>

/** A member a text may mention, by the id its mention links to. */
export type Mention = Readonly<{ id: string; name: string }>

// A newline breaks the line, as people expect of a chat message.
const marked = new Marked({ gfm: true, breaks: true })

/** Parse chat Markdown with GFM and line breaks. */
export const parseMarkdown = (text: string): ReadonlyArray<Token> => marked.lexer(text)

// The lexer yields only the tokens `MarkedToken` lists, since no extension is installed.
export const knownToken = (token: Token): MarkedToken => token as MarkedToken

const mentionPrefix = "member:"

/** The member a `member:<id>` link mentions. */
export const mentionedMemberId = (href: string): Option.Option<string> =>
  href.startsWith(mentionPrefix)
    ? Option.liftThrowable(decodeURIComponent)(href.slice(mentionPrefix.length))
    : Option.none()

// Entity references people and editors write for characters markdown or HTML would otherwise read as syntax; numeric
// references name any character.
const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  times: "×",
  divide: "÷",
  deg: "°",
  plusmn: "±",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶"
}

const entityReference = /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([a-zA-Z][a-zA-Z\d]{1,31}));/gu

const highestCodePoint = 0x10ffff

const firstSurrogate = 0xd800

const lastSurrogate = 0xdfff

const replacementCharacter = "�"

/** The character an entity reference names: a known name’s, a code point’s, or the replacement for an invalid one. */
const characterOfEntity = (
  whole: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined
): string => {
  if (name !== undefined) {
    return namedEntities[name] ?? whole
  }

  const code = Number.parseInt(decimal ?? hex ?? "", decimal === undefined ? 16 : 10)
  const isValid = code > 0 && code <= highestCodePoint && (code < firstSurrogate || code > lastSurrogate)

  return isValid ? String.fromCodePoint(code) : replacementCharacter
}

/** Text with its entity references as the characters they name, as markdown reads them. */
export const decodeEntities = (text: string): string =>
  text.includes("&") ? text.replace(entityReference, characterOfEntity) : text

/** The tokens inside a token, none while it holds only words. */
export const nestedTokens = (token: Readonly<{ tokens?: Array<Token> | undefined }>): ReadonlyArray<Token> =>
  token.tokens ?? []

export type NameOf = (memberId: string) => Option.Option<string>

export const nameLookup = (mentions: ReadonlyArray<Mention>): NameOf => {
  const names = new Map(mentions.map(({ id, name }) => [id, name]))

  return (memberId) => Option.fromUndefinedOr(names.get(memberId))
}

/** Some words of a text, or a mention of a member, which a preview sets apart. */
export type Run = Readonly<{ text: string; isMention: boolean }>

const wordsRun = (text: string): Run => ({ text, isMention: false })

const joinRuns = (runs: ReadonlyArray<Run>): string => runs.map(({ text }) => text).join("")

/** What a mention says: "@" and the name the member has now, or the label the text recorded while they are unknown. */
export const mentionLabel = (nameOf: NameOf, memberId: string, recordedLabel: string): string =>
  Option.match(nameOf(memberId), { onNone: () => recordedLabel, onSome: (name) => `@${name}` })

/** The label a mention link recorded: the words it holds. */
export const recordedLabelOf = (nameOf: NameOf, link: Tokens.Link): string => joinRuns(inlineRuns(nameOf, link.tokens))

/** The words and mentions of inline tokens, without their formatting. */
const inlineRuns = (nameOf: NameOf, tokens: ReadonlyArray<Token>): ReadonlyArray<Run> =>
  tokens.flatMap((token) => inlineTokenRuns(nameOf, knownToken(token)))

const textTokenRuns = (nameOf: NameOf, token: Tokens.Text | Tokens.Strong | Tokens.Em | Tokens.Del) => {
  const nested = nestedTokens(token)

  return Array.isReadonlyArrayNonEmpty(nested) ? inlineRuns(nameOf, nested) : [wordsRun(decodeEntities(token.text))]
}

const inlineTokenRuns = (nameOf: NameOf, token: MarkedToken): ReadonlyArray<Run> =>
  Match.value(token).pipe(
    Match.discriminators("type")({
      br: () => [wordsRun(" ")],
      codespan: ({ text }) => [wordsRun(text)],
      escape: ({ text }) => [wordsRun(text)],
      image: ({ text }) => [wordsRun(decodeEntities(text))],
      link: (link) =>
        Option.match(mentionedMemberId(link.href), {
          onNone: () => inlineRuns(nameOf, link.tokens),
          onSome: (memberId) => [
            { text: mentionLabel(nameOf, memberId, recordedLabelOf(nameOf, link)), isMention: true }
          ]
        }),
      text: (text) => textTokenRuns(nameOf, text),
      strong: (strong) => textTokenRuns(nameOf, strong),
      em: (em) => textTokenRuns(nameOf, em),
      del: (del) => textTokenRuns(nameOf, del)
    }),
    Match.orElse(({ raw }) => [wordsRun(raw)])
  )

const spaceRun = wordsRun(" ")

/** The words and mentions of blocks, a space between each, without their layout. */
const blockRuns = (nameOf: NameOf, tokens: ReadonlyArray<Token>): ReadonlyArray<Run> =>
  tokens.flatMap((token) => blockTokenRuns(nameOf, knownToken(token)))

const leafBlockRuns = (nameOf: NameOf, token: Tokens.Paragraph | Tokens.Heading | Tokens.Text) => {
  const nested = nestedTokens(token)

  return [
    spaceRun,
    ...(Array.isReadonlyArrayNonEmpty(nested) ? inlineRuns(nameOf, nested) : [wordsRun(decodeEntities(token.text))])
  ]
}

const blockTokenRuns = (nameOf: NameOf, token: MarkedToken): ReadonlyArray<Run> =>
  Match.value(token).pipe(
    Match.discriminators("type")({
      space: () => [],
      def: () => [],
      hr: () => [],
      checkbox: () => [],
      code: ({ text }) => [spaceRun, wordsRun(text)],
      blockquote: ({ tokens }) => [spaceRun, ...blockRuns(nameOf, tokens)],
      list: ({ items }) => items.flatMap(({ tokens }) => [spaceRun, ...blockRuns(nameOf, tokens)]),
      table: ({ header, rows }) =>
        [header, ...rows].flat().flatMap(({ tokens }) => [spaceRun, ...inlineRuns(nameOf, tokens)]),
      paragraph: (paragraph) => leafBlockRuns(nameOf, paragraph),
      heading: (heading) => leafBlockRuns(nameOf, heading),
      text: (text) => leafBlockRuns(nameOf, text)
    }),
    Match.orElse(({ raw }) => [spaceRun, wordsRun(raw)])
  )

/**
 * `runs` with each stretch of whitespace a single space, neighbouring words as one run, trimmed at both ends, and
 * nothing for the empty.
 */
const collapseRuns = (runs: ReadonlyArray<Run>): ReadonlyArray<Run> => {
  if (!Array.isReadonlyArrayNonEmpty(runs)) {
    return []
  }

  const merged = Array.groupWith(runs, (run, first) => !run.isMention && !first.isMention).map((group): Run =>
    Array.headNonEmpty(group).isMention ? Array.headNonEmpty(group) : wordsRun(joinRuns(group))
  )

  return merged
    .map((run, index) => {
      if (run.isMention) {
        return run
      }

      const spaced = run.text.replaceAll(/\s+/gu, " ")
      const startTrimmed = index === 0 ? spaced.trimStart() : spaced

      return wordsRun(index === merged.length - 1 ? startTrimmed.trimEnd() : startTrimmed)
    })
    .filter(({ text }) => text !== "")
}

export const previewRuns = ({ text, mentions = [] }: Markdown): ReadonlyArray<Run> =>
  collapseRuns(blockRuns(nameLookup(mentions), parseMarkdown(text)))

/**
 * The words of `markdown` as a reader hears them, without its syntax or layout: one line of words, each mention as "@"
 * and the member’s current name. Mentions retain their current or recorded names.
 */
export const markdownWords = (markdown: Markdown): string => joinRuns(previewRuns(markdown))
