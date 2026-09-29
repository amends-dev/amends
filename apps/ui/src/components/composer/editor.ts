import { Extension, Node, mergeAttributes, type Editor, type MarkdownToken } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import * as text from "../rich-text/rich-text.css.ts";

// The message format core defines: a mention is a link to the member, `[@Ada](member:<id>)`, its
// label escaped so a name reads as itself. Keep in step with core's `ThreadMessage.mentionText`.
const labelMarks = /[\\[\]*_`~<>]/gu;
const mentionMarkdown = (id: string, label: string) =>
  `[@${label.replaceAll(labelMarks, "\\$&")}](member:${encodeURIComponent(id)})`;

/** The member a `member:<id>` link mentions. */
function memberOf(href: string) {
  if (!href.startsWith("member:")) return undefined;
  try {
    return decodeURIComponent(href.slice("member:".length));
  } catch {
    return undefined;
  }
}

/** A link label's words, without the "@" it starts with. */
function labelOf(tokens: readonly MarkdownToken[]): string {
  return tokens
    .map((token) => (token.tokens?.length ? labelOf(token.tokens) : (token.text ?? "")))
    .join("")
    .replace(/^@/u, "");
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
        renderHTML: (attributes) => ({ "data-member": attributes["id"] }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") ?? "",
        renderHTML: (attributes) => ({ "data-label": attributes["label"] }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-member]" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { class: text.mention }),
    `@${node.attrs["label"]}`,
  ],
  renderText: ({ node }) => `@${node.attrs["label"]}`,
  renderMarkdown: (node) => mentionMarkdown(node.attrs?.["id"] ?? "", node.attrs?.["label"] ?? ""),
});

const linkable = /^(?:https?:|mailto:)/iu;

/** Links to web pages and email addresses; a link to `member:` is a mention. */
const MessageLink = Link.extend({
  parseMarkdown(token, helpers) {
    const member = memberOf(token["href"] ?? "");
    if (member !== undefined)
      return helpers.createNode("mention", { id: member, label: labelOf(token.tokens ?? []) });
    return Link.config.parseMarkdown!.call(this, token, helpers);
  },
});

/** A line break inside a paragraph: a newline, which messages read as a break. */
const LineBreak = HardBreak.extend({ renderMarkdown: () => "\n" });

/**
 * Markdown typed at the start of a line after a line break, as it is at the start of a block: "- ",
 * "1. ", "> ", or "``` " begins a list, quote, or code block there, splitting the block at the break.
 */
const LineStarts = Extension.create({
  name: "lineStarts",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleTextInput: (_view, from, to, typed) => {
            const $from = editor.state.doc.resolve(from);
            if (typed !== " " || from !== to || $from.parent.type.name !== "paragraph")
              return false;
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, (node) =>
              node.type.name === "hardBreak" ? "\n" : "\uFFFC",
            );
            const lineAt = before.lastIndexOf("\n");
            if (lineAt < 0) return false;
            const line = before.slice(lineAt + 1);
            const ordered = /^(\d{1,9})\.$/u.exec(line);
            const fence = /^```([\w+-]*)$/u.exec(line);
            if (!/^[-+*>]$/u.test(line) && !ordered && !fence) return false;
            // Remove the break and the marker, and begin a new block where the line began.
            const chain = editor
              .chain()
              .deleteRange({ from: from - line.length - 1, to: from })
              .splitBlock();
            if (ordered)
              chain
                .toggleOrderedList()
                .updateAttributes("orderedList", { start: Number(ordered[1]) });
            else if (fence) chain.setCodeBlock(fence[1] ? { language: fence[1] } : undefined);
            else if (line === ">") chain.toggleBlockquote();
            else chain.toggleBulletList();
            return chain.run();
          },
        },
      }),
    ];
  },
});

/**
 * Plain text pasted outside code reads as markdown, as a message would, so a reply copied as text
 * keeps its formatting. Pasted HTML keeps its own, and a link pasted over a selection links it.
 */
const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data || data.types.includes("text/html") || data.files.length > 0) return false;
            const pasted = data.getData("text/plain");
            if (pasted === "" || editor.isActive("codeBlock") || editor.isActive("code"))
              return false;
            return editor.commands.insertContent(pasted, { contentType: "markdown" });
          },
        },
      }),
    ];
  },
});

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
          openLink();
          return true;
        },
      };
    },
  });
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
      paragraph: { HTMLAttributes: { class: text.paragraph } },
      heading: { levels: [1, 2, 3], HTMLAttributes: { class: text.heading } },
      blockquote: { HTMLAttributes: { class: text.quote } },
      bulletList: { HTMLAttributes: { class: text.list } },
      orderedList: { HTMLAttributes: { class: text.list } },
      listItem: { HTMLAttributes: { class: text.item } },
      code: { HTMLAttributes: { class: text.code } },
      codeBlock: { HTMLAttributes: { class: text.pre } },
      horizontalRule: { HTMLAttributes: { class: text.rule } },
    }),
    LineBreak,
    MessageLink.configure({
      openOnClick: false,
      defaultProtocol: "https",
      // An address without a scheme, such as "example.com" typed or pasted, is a web address.
      isAllowedUri: (url) => linkable.test(url) || !/^[a-z][a-z\d+.-]*:/iu.test(url),
      HTMLAttributes: { class: text.link, target: null, rel: null },
    }),
    Mention,
    LineStarts,
    MarkdownPaste,
    Placeholder.configure({ placeholder: () => options.placeholder() }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    shortcuts(options.openLink),
  ];
}

/** The draft as a message's markdown. */
export const markdownOf = (editor: Editor) =>
  editor
    .getMarkdown()
    // Empty lines and paragraphs, which the markdown keeps as non-breaking spaces, send nothing
    // before or after the text.
    .replace(/^(?:[ \t]*(?:&nbsp;)?[ \t]*\n)+/u, "")
    .replace(/(?:\s*&nbsp;)+\s*$/u, "")
    .trimEnd();

/** The "@name" being typed just before the caret, and where it starts, if any. */
export function mentionQuery(editor: Editor) {
  const { selection } = editor.state;
  const $from = selection.$from;
  if (!selection.empty || $from.parent.type.spec.code || editor.isActive("code")) return undefined;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const match = /(^|\s)@([^\s@]*)$/u.exec(before);
  if (!match) return undefined;
  const query = match[2]!;
  return { from: $from.pos - query.length - 1, to: $from.pos, query };
}

/** The text before the caret in its block, where a mention would start. */
export function textBeforeCaret(editor: Editor) {
  const $from = editor.state.selection.$from;
  return $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
}

/**
 * A link address as written: web and email addresses keep their scheme, an email address alone
 * gets `mailto:`, and anything else is taken as a web address. Other schemes are refused.
 */
export function linkAddress(written: string) {
  const address = written.trim();
  if (address === "" || /\s/u.test(address)) return undefined;
  if (/^[a-z][a-z\d+.-]*:/iu.test(address)) return linkable.test(address) ? address : undefined;
  if (/^[^@/]+@[^@/]+\.[^@/]+$/u.test(address)) return `mailto:${address}`;
  return `https://${address}`;
}
