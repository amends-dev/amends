import { Extension, Node, mergeAttributes, type ChainedCommands, type Editor, type MarkdownToken } from "@tiptap/core"
import { HardBreak } from "@tiptap/extension-hard-break"
import { Link } from "@tiptap/extension-link"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import { Plugin } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"
import * as text from "../rich-text/rich-text.css.ts"

// The message format core defines: a mention is a link to the member, `[@Ada](member:<id>)`, its
// label escaped so a name reads as itself. Keep in step with core's `ThreadMessage.mentionText`.
const labelMarks = /[\\[\]*_`~<>]/gu
const mentionMarkdown = (id: string, label: string) =>
  `[@${label.replaceAll(labelMarks, "\\$&")}](member:${encodeURIComponent(id)})`

/** The member a `member:<id>` link mentions. */
function memberOf(href: string) {
  if (!href.startsWith("member:")) return undefined
  try {
    return decodeURIComponent(href.slice("member:".length))
  } catch {
    return undefined
  }
}

/** A link label's words, without the "@" it starts with. */
function labelOf(tokens: ReadonlyArray<MarkdownToken>): string {
  return tokens
    .map((token) => (token.tokens?.length ? labelOf(token.tokens) : (token.text ?? "")))
    .join("")
    .replace(/^@/u, "")
}

/** A member mentioned in the draft: one piece, deleted whole, that names them by id. */
const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-member") ?? "",
        renderHTML: (attributes) => ({ "data-member": attributes["id"] })
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") ?? "",
        renderHTML: (attributes) => ({ "data-label": attributes["label"] })
      }
    }
  },
  parseHTML: () => [{ tag: "span[data-member]" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { class: text.mention }),
    `@${node.attrs["label"]}`
  ],
  renderText: ({ node }) => `@${node.attrs["label"]}`,
  renderMarkdown: (node) => mentionMarkdown(node.attrs?.["id"] ?? "", node.attrs?.["label"] ?? "")
})

const linkable = /^(?:https?:|mailto:)/iu

/** Links to web pages and email addresses; a link to `member:` is a mention. */
const MessageLink = Link.extend({
  parseMarkdown(token, helpers) {
    const member = memberOf(token["href"] ?? "")
    if (member !== undefined) return helpers.createNode("mention", { id: member, label: labelOf(token.tokens ?? []) })
    return Link.config.parseMarkdown!.call(this, token, helpers)
  }
})

/**
 * A paragraph's lines, each escaped where it starts with what markdown would read as a heading, a
 * list, or the underline that makes the line above a heading: "#", "-", "+", "1.", or only "-" or
 * "=". The serializer already escapes "*", backticks, and "~", and writes ">" and "<" as entities.
 */
function escapeLineStarts(markdown: string) {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/^( {0,3})(#{1,6}|[-+])(?=\s|$)/u, "$1\\$2")
        .replace(/^( {0,3})(\d{1,9})([.)])(?=\s|$)/u, "$1$2\\$3")
        .replace(/^( {0,3})([=-]+[ \t]*)$/u, "$1\\$2")
    )
    .join("\n")
}

/** A paragraph whose text reads as itself in the message, not as block markdown. */
const MessageParagraph = Paragraph.extend({
  renderMarkdown: (node, helpers, context) => escapeLineStarts(Paragraph.config.renderMarkdown!(node, helpers, context))
})

/** A line break inside a paragraph: a newline, which messages read as a break. */
const LineBreak = HardBreak.extend({ renderMarkdown: () => "\n" })

/** The line `pos` ends within its paragraph: its text so far, and whether a line break starts it. */
function lineBefore(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos)
  if ($pos.parent.type.name !== "paragraph") return undefined
  const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, (node) =>
    node.type.name === "hardBreak" ? "\n" : "\uFFFC"
  )
  const breakAt = before.lastIndexOf("\n")
  return {
    text: before.slice(breakAt + 1),
    afterBreak: breakAt >= 0,
    /** Nothing follows in the paragraph. */
    atEnd: $pos.parentOffset === $pos.parent.content.size
  }
}

type Opening =
  | { readonly kind: "bullet" | "quote" }
  | { readonly kind: "ordered"; readonly start: number }
  | { readonly kind: "code"; readonly language: string | undefined }

/** The block a line of only its marker opens, such as "-", "1.", ">", or "```ts". */
function openingOf(line: string): Opening | undefined {
  const ordered = /^(\d{1,9})\.$/u.exec(line)
  if (ordered) return { kind: "ordered", start: Number(ordered[1]) }
  const fence = /^```([\w+-]*)$/u.exec(line)
  if (fence) return { kind: "code", language: fence[1] || undefined }
  if (line === ">") return { kind: "quote" }
  return /^[-+*]$/u.test(line) ? { kind: "bullet" } : undefined
}

/**
 * Replaces the marker line ending at `pos` with the block it opens, splitting the paragraph at the
 * line break before it, if any. Nothing changes unless all of it can.
 */
function open(
  editor: Editor,
  pos: number,
  line: { readonly text: string; readonly afterBreak: boolean },
  opening: Opening
) {
  const build = (chain: ChainedCommands) => {
    let next = chain.deleteRange({
      from: pos - line.text.length - (line.afterBreak ? 1 : 0),
      to: pos
    })
    if (line.afterBreak) next = next.splitBlock()
    switch (opening.kind) {
      case "ordered":
        return next.toggleOrderedList().updateAttributes("orderedList", { start: opening.start })
      case "code":
        return next.setCodeBlock(opening.language ? { language: opening.language } : undefined)
      case "quote":
        return next.toggleBlockquote()
      case "bullet":
        return next.toggleBulletList()
    }
  }
  return build(editor.can().chain()).run() && build(editor.chain()).run()
}

/**
 * Markdown typed at the start of a line after a line break, as it is at the start of a block: "- ",
 * "1. ", "> ", or "``` " begins a list, quote, or code block there, splitting the block at the break.
 */
const LineStarts = Extension.create({
  name: "lineStarts",
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleTextInput: (_view, from, to, typed) => {
            if (typed !== " " || from !== to) return false
            // A marker opening its block is the editor's own input rule.
            const line = lineBefore(editor, from)
            const opening = line?.afterBreak ? openingOf(line.text) : undefined
            return opening !== undefined && open(editor, from, line!, opening)
          }
        }
      })
    ]
  }
})

/**
 * Where the caret ends a paragraph on a line of only a code fence, such as "```" or "```ts", starts a
 * code block in its place, as Shift+Enter does. False, changing nothing, for any other line.
 */
export function openCodeFence(editor: Editor) {
  const { selection } = editor.state
  if (!selection.empty) return false
  const line = lineBefore(editor, selection.from)
  const opening = line?.atEnd ? openingOf(line.text) : undefined
  return opening?.kind === "code" && open(editor, selection.from, line!, opening)
}

/**
 * Plain text pasted outside code reads as markdown, as a message would, so a reply copied as text
 * keeps its formatting. Pasted HTML keeps its own, and a link pasted over a selection links it.
 */
const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData
            if (!data || data.types.includes("text/html") || data.files.length > 0) return false
            const pasted = data.getData("text/plain")
            if (pasted === "" || editor.isActive("codeBlock") || editor.isActive("code")) return false
            return editor.commands.insertContent(pasted, { contentType: "markdown" })
          }
        }
      })
    ]
  }
})

/** Slack's formatting shortcuts, beside the editor's own. */
function shortcuts(openLink: () => void) {
  return Extension.create({
    name: "composerShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
        "Mod-Shift-c": () => this.editor.commands.toggleCode(),
        "Mod-Alt-Shift-c": () => this.editor.commands.toggleCodeBlock(),
        "Mod-Shift-9": () => this.editor.commands.toggleBlockquote(),
        "Mod-Shift-u": () => {
          openLink()
          return true
        }
      }
    }
  })
}

/** The draft's formatting, markdown in and out, mentions, and shortcuts. */
export function extensions(options: { placeholder: () => string; openLink: () => void }) {
  return [
    StarterKit.configure({
      // Messages have no underline, and drafts need no drop or gap cursors.
      underline: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      link: false,
      hardBreak: false,
      paragraph: false,
      heading: { levels: [1, 2, 3], HTMLAttributes: { class: text.heading } },
      blockquote: { HTMLAttributes: { class: text.quote } },
      bulletList: { HTMLAttributes: { class: text.list } },
      orderedList: { HTMLAttributes: { class: text.list } },
      listItem: { HTMLAttributes: { class: text.item } },
      code: { HTMLAttributes: { class: text.code } },
      codeBlock: { HTMLAttributes: { class: text.pre } },
      horizontalRule: { HTMLAttributes: { class: text.rule } }
    }),
    MessageParagraph.configure({ HTMLAttributes: { class: text.paragraph } }),
    LineBreak,
    MessageLink.configure({
      openOnClick: false,
      defaultProtocol: "https",
      // An address without a scheme, such as "example.com" typed or pasted, is a web address.
      isAllowedUri: (url) => linkable.test(url) || !/^[a-z][a-z\d+.-]*:/iu.test(url),
      HTMLAttributes: { class: text.link, target: null, rel: null }
    }),
    Mention,
    LineStarts,
    MarkdownPaste,
    Placeholder.configure({ placeholder: () => options.placeholder() }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    shortcuts(options.openLink)
  ]
}

/** The draft as a message's markdown. */
export const markdownOf = (editor: Editor) =>
  editor
    .getMarkdown()
    // Empty lines and paragraphs, which the markdown keeps as non-breaking spaces, send nothing
    // before or after the text.
    .replace(/^(?:[ \t]*(?:&nbsp;)?[ \t]*\n)+/u, "")
    .replace(/(?:\s*&nbsp;)+\s*$/u, "")
    .trimEnd()

/** The "@name" being typed just before the caret, and where it starts, if any. */
export function mentionQuery(editor: Editor) {
  const { selection } = editor.state
  const $from = selection.$from
  if (!selection.empty || $from.parent.type.spec.code || editor.isActive("code")) return undefined
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼")
  const match = /(^|\s)@([^\s@]*)$/u.exec(before)
  if (!match) return undefined
  const query = match[2]!
  return { from: $from.pos - query.length - 1, to: $from.pos, query }
}

/**
 * The command being typed: the whole draft is "/" and a name so far, with the caret at its end, as
 * `/rename`. Anything else, such as "/" later in the text, is text.
 */
export function commandQuery(editor: Editor) {
  const { doc, selection } = editor.state
  if (!selection.empty) return undefined
  // The one block with anything in it; empty paragraphs around it send nothing.
  const written: Array<{ readonly block: typeof doc; readonly at: number }> = []
  doc.forEach((block, at) => {
    if (block.type.name !== "paragraph" || block.content.size > 0) written.push({ block, at })
  })
  const [only] = written
  if (written.length !== 1 || only!.block.type.name !== "paragraph") return undefined
  const { block, at } = only!
  // Only text: a mention or line break has no text of its own.
  if (block.content.size !== block.textContent.length) return undefined
  const match = /^\/([\w-]*)$/u.exec(block.textContent)
  const from = at + 1,
    to = from + block.textContent.length
  if (!match || selection.from !== to) return undefined
  return { from, to, query: match[1]! }
}

/** The text before the caret in its block, where a mention would start. */
export function textBeforeCaret(editor: Editor) {
  const $from = editor.state.selection.$from
  return $from.parent.textBetween(0, $from.parentOffset, undefined, "￼")
}

/**
 * A link address as written: web and email addresses keep their scheme, an email address alone
 * gets `mailto:`, and anything else is taken as a web address. Other schemes are refused.
 */
export function linkAddress(written: string) {
  const address = written.trim()
  if (address === "" || /\s/u.test(address)) return undefined
  if (/^[a-z][a-z\d+.-]*:/iu.test(address)) return linkable.test(address) ? address : undefined
  if (/^[^@/]+@[^@/]+\.[^@/]+$/u.test(address)) return `mailto:${address}`
  return `https://${address}`
}
