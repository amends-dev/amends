import { IconCheck } from "@amends/icons";
import { Marked, type MarkedToken, type Token, type Tokens } from "marked";
import remend from "remend";
import { For, Show, createMemo, type JSX } from "solid-js";
import { Keyed } from "../../internal/keyed.tsx";
import { classes } from "../../internal/props.ts";
import * as s from "./rich-text.css.ts";

/** A member the text may mention, by the id its mention links to. */
export interface RichTextMention {
  readonly id: string;
  /** Their current name, shown after "@". */
  readonly name: string;
}

export interface RichTextProps {
  /**
   * Markdown, such as a message's text. A mention is a link to the member, such as
   * `[@Ada](member:<id>)`. Raw HTML shows as written, images as links to them, and only web and
   * email links link.
   */
  readonly text: string;
  /** The members its mentions name; a mention of anyone else shows the name the text recorded. */
  readonly mentions?: readonly RichTextMention[];
  /** One run of words and mentions without layout or formatting, such as a preview's. */
  readonly inline?: boolean;
  /** The text is still arriving: formatting left open at its end shows as if closed. */
  readonly streaming?: boolean;
  /** Marks where the text is still arriving, after its last word. */
  readonly caret?: boolean;
  readonly class?: string;
}

// A newline breaks the line, as people expect of a chat message.
const markdown = new Marked({ gfm: true, breaks: true });

const linkable = new Set(["http:", "https:", "mailto:"]);
/** The link's address if it leads to a web page or an email address, which alone may link. */
function safeHref(href: string) {
  try {
    return linkable.has(new URL(href).protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

/** The member a `member:<id>` link mentions. */
function memberOf(href: string) {
  if (!href.startsWith("member:")) return undefined;
  try {
    return decodeURIComponent(href.slice("member:".length));
  } catch {
    return undefined;
  }
}

// Entity references people and editors write for characters markdown or HTML would otherwise
// read as syntax; numeric references name any character.
const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
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
  para: "¶",
};
const entities = /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([a-zA-Z][a-zA-Z\d]{1,31}));/gu;

/** Text with its entity references as the characters they name, as markdown reads them. */
function decode(text: string) {
  if (!text.includes("&")) return text;
  return text.replace(entities, (whole, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) return namedEntities[name] ?? whole;
    const code = decimal === undefined ? Number.parseInt(hex!, 16) : Number.parseInt(decimal, 10);
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    return valid ? String.fromCodePoint(code) : "\uFFFD";
  });
}

interface Context {
  readonly member: (id: string) => RichTextMention | undefined;
}

const tokensOf = (token: Token) => token as MarkedToken;

/** Words, or a mentioned member and the label the text gave them. */
type Run = string | { readonly id: string; readonly label: string };

/** The words and mentions of inline tokens, without their formatting. */
function inlineRuns(tokens: readonly Token[]): Run[] {
  return tokens.flatMap((token): Run[] => {
    const current = tokensOf(token);
    switch (current.type) {
      case "br":
        return [" "];
      case "codespan":
      case "escape":
        return [current.text];
      case "image":
        return [decode(current.text)];
      case "link": {
        const member = memberOf(current.href);
        return member === undefined
          ? inlineRuns(current.tokens)
          : [{ id: member, label: plain(current.tokens) }];
      }
      case "text":
      case "strong":
      case "em":
      case "del":
        return current.tokens?.length ? inlineRuns(current.tokens) : [decode(current.text)];
      default:
        return [current.raw];
    }
  });
}

/** The words and mentions of blocks, a space between each, without their layout. */
function blockRuns(tokens: readonly Token[]): Run[] {
  return tokens.flatMap((token): Run[] => {
    const current = tokensOf(token);
    switch (current.type) {
      case "space":
      case "def":
      case "hr":
      case "checkbox":
        return [];
      case "code":
        return [" ", current.text];
      case "blockquote":
        return [" ", ...blockRuns(current.tokens)];
      case "list":
        return current.items.flatMap((item) => [" ", ...blockRuns(item.tokens)]);
      case "table":
        return [current.header, ...current.rows]
          .flat()
          .flatMap((cell) => [" ", ...inlineRuns(cell.tokens)]);
      case "paragraph":
      case "heading":
      case "text":
        return [
          " ",
          ...(current.tokens?.length ? inlineRuns(current.tokens) : [decode(current.text)]),
        ];
      default:
        return [" ", current.raw];
    }
  });
}

/** The words of some tokens, without their formatting. */
function plain(tokens: readonly Token[]) {
  return inlineRuns(tokens)
    .map((run) => (typeof run === "string" ? run : run.label))
    .join("");
}

/** Runs with each stretch of whitespace a single space, trimmed at both ends. */
function collapsed(all: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of all) {
    const previous = out.at(-1);
    if (typeof run !== "string") out.push(run);
    else if (typeof previous === "string") out[out.length - 1] = previous + run;
    else out.push(run);
  }
  return out
    .map((run, index) => {
      if (typeof run !== "string") return run;
      let text = run.replaceAll(/\s+/gu, " ");
      if (index === 0) text = text.trimStart();
      if (index === out.length - 1) text = text.trimEnd();
      return text;
    })
    .filter((run) => run !== "");
}

function Mention(props: {
  readonly id: string;
  readonly label: string;
  readonly context: Context;
}) {
  const member = () => props.context.member(props.id);
  return (
    <span class={s.mention} data-member={props.id}>
      {member() ? `@${member()!.name}` : props.label}
    </span>
  );
}

function inlines(tokens: readonly Token[], context: Context): JSX.Element[] {
  return tokens.map((token) => inline(token, context));
}

function inline(token: Token, context: Context): JSX.Element {
  const current = tokensOf(token);
  switch (current.type) {
    case "text":
      return current.tokens?.length ? inlines(current.tokens, context) : decode(current.text);
    case "escape":
      return current.text;
    case "strong":
      return <strong>{inlines(current.tokens, context)}</strong>;
    case "em":
      return <em>{inlines(current.tokens, context)}</em>;
    case "del":
      return <del>{inlines(current.tokens, context)}</del>;
    case "codespan":
      return <code class={s.code}>{current.text}</code>;
    case "br":
      return <br />;
    case "link": {
      const member = memberOf(current.href);
      if (member !== undefined)
        return <Mention id={member} label={plain(current.tokens)} context={context} />;
      const href = safeHref(current.href);
      if (!href) return inlines(current.tokens, context);
      return (
        <a
          class={s.link}
          href={href}
          title={current.title ? decode(current.title) : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {inlines(current.tokens, context)}
        </a>
      );
    }
    case "image": {
      // Images are not loaded, which would tell their host who read the message.
      const href = safeHref(current.href);
      const label = decode(current.text) || current.href;
      if (!href) return label;
      return (
        <a class={s.link} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      );
    }
    default:
      return current.raw;
  }
}

function block(token: Token, context: Context): JSX.Element {
  const current = tokensOf(token);
  switch (current.type) {
    case "space":
    case "def":
      return null;
    case "paragraph":
      return <p class={s.paragraph}>{inlines(current.tokens, context)}</p>;
    // A tight list item's words.
    case "text":
      return (
        <p class={s.paragraph}>
          {current.tokens?.length ? inlines(current.tokens, context) : decode(current.text)}
        </p>
      );
    case "heading":
      return <p class={s.heading}>{inlines(current.tokens, context)}</p>;
    case "code":
      return (
        <pre class={s.pre}>
          <code data-language={current.lang || undefined}>{current.text}</code>
        </pre>
      );
    case "blockquote":
      return <blockquote class={s.quote}>{blocks(current.tokens, context)}</blockquote>;
    case "list": {
      const items = current.items.map((item) => listItem(item, context));
      return current.ordered ? (
        <ol class={s.list} start={current.start === "" ? undefined : current.start}>
          {items}
        </ol>
      ) : (
        <ul class={s.list}>{items}</ul>
      );
    }
    case "table":
      return (
        <div class={s.tableScroll}>
          <table class={s.table}>
            <thead>
              <tr>
                {current.header.map((cell) => (
                  <th class={s.headerCell} data-align={cell.align ?? undefined}>
                    {inlines(cell.tokens, context)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.rows.map((row) => (
                <tr>
                  {row.map((cell) => (
                    <td class={s.cell} data-align={cell.align ?? undefined}>
                      {inlines(cell.tokens, context)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr class={s.rule} />;
    case "html":
      return <p class={s.paragraph}>{current.raw.trimEnd()}</p>;
    default:
      return "tokens" in current && current.tokens ? (
        <p class={s.paragraph}>{inlines(current.tokens, context)}</p>
      ) : (
        <p class={s.paragraph}>{current.raw}</p>
      );
  }
}

function blocks(tokens: readonly Token[], context: Context): JSX.Element[] {
  return tokens.map((token) => block(token, context));
}

function listItem(item: Tokens.ListItem, context: Context) {
  const content = item.tokens.filter((token) => token.type !== "checkbox");
  if (!item.task) return <li class={s.item}>{blocks(content, context)}</li>;
  return (
    <li class={s.task}>
      <span
        role="checkbox"
        aria-checked={item.checked ?? false}
        aria-disabled="true"
        aria-label={item.checked ? "Done" : "Not done"}
        class={s.taskBox}
      >
        <Show when={item.checked}>
          <IconCheck class={s.taskCheck} />
        </Show>
      </span>
      <div class={s.itemBody}>{blocks(content, context)}</div>
    </li>
  );
}

/**
 * Formatted text: paragraphs, lists, quotes, code, tables, links, and mentions, in the
 * surrounding type. Blocks that did not change keep their elements as the text grows.
 */
export function RichText(props: RichTextProps) {
  const people = createMemo(
    () => new Map((props.mentions ?? []).map((person) => [person.id, person])),
  );
  const context: Context = { member: (id) => people().get(id) };
  const source = () =>
    props.streaming
      ? remend(props.text, { linkMode: "text-only", katex: false, inlineKatex: false })
      : props.text;
  const tokens = createMemo(() => markdown.lexer(source()));
  // Keyed by position and source, so a block re-renders only when its own text changes.
  const keyed = createMemo(() =>
    tokens()
      .filter((token) => token.type !== "space" && token.type !== "def")
      .map((token, index) => ({ key: `${index}\u0000${token.raw}`, token })),
  );
  return (
    <Show
      when={!props.inline}
      fallback={
        <span class={classes(s.inline, props.class)}>
          <For each={collapsed(blockRuns(tokens()))}>
            {(run) =>
              typeof run === "string" ? (
                run
              ) : (
                <Mention id={run.id} label={run.label} context={context} />
              )
            }
          </For>
        </span>
      }
    >
      <div class={classes(s.blocks, props.class)} data-caret={props.caret ? "" : undefined}>
        <Keyed each={keyed()} by={(entry) => entry.key}>
          {(entry) => block(entry().token, context)}
        </Keyed>
      </div>
    </Show>
  );
}
