import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  on,
  Show,
  splitProps,
  type JSX,
} from "solid-js";
import { FormError } from "../form-error.tsx";
import * as Avatar from "../../primitives/avatar/avatar.tsx";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./composer.css.ts";
import { insertMention, matching, mentionAt, type MentionCandidate } from "./mentions.ts";

export type { MentionCandidate } from "./mentions.ts";

export type RootProps = Omit<JSX.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  /** Sending was asked for, by the send button or Enter in the input. */
  onSend: () => void;
  /** `comfortable` (default) for a page; `compact` for a narrow thread panel. */
  density?: "comfortable" | "compact";
};
/**
 * Writing a message: Root > Frame(Input + Actions) + an optional Note or Error. Root is a form;
 * submitting it calls `onSend`, and the caller owns the draft, sending, and its outcome.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["onSend", "density", "class", "classList"]);
  return (
    <form
      {...native}
      data-density={local.density ?? "comfortable"}
      class={classes(s.root, local.class, local.classList)}
      onSubmit={(event) => {
        event.preventDefault();
        local.onSend();
      }}
    />
  );
}
export function Frame(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.frame, local.class, local.classList)} />;
}
/** Who can be mentioned, what the list is called, and what to do when someone is chosen. */
export interface Mentions {
  readonly candidates: ReadonlyArray<MentionCandidate>;
  /** Names the list of suggestions, such as "People to mention". */
  readonly label: string;
  readonly onMention: (candidate: MentionCandidate) => void;
}
export type InputProps = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onInput" | "rows"
> & {
  value: string;
  onInput: (value: string) => void;
  /** Suggest people while an @ word is typed, and insert the chosen one's token. */
  mentions?: Mentions;
} & ({ "aria-label": string } | { "aria-labelledby": string });
/**
 * The message text. Enter sends it and Shift+Enter starts a new line, except while an input
 * method is composing. It grows with its text up to about half the viewport, then scrolls.
 *
 * With `mentions`, typing a word that starts with @ lists matching people above the composer:
 * arrows move through them, Enter or Tab inserts the highlighted one, and Escape dismisses the
 * list for that word. The text stays a textbox; the list is its active descendant.
 */
export function Input(props: InputProps) {
  const [local, native] = splitProps(props, [
    "value",
    "onInput",
    "onKeyDown",
    "mentions",
    "class",
    "classList",
    "ref",
  ]);
  let input!: HTMLTextAreaElement;
  const fit = () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  createEffect(
    on(
      () => local.value,
      () => queueMicrotask(fit),
    ),
  );
  const listId = createUniqueId();
  const [caret, setCaret] = createSignal(0),
    [focused, setFocused] = createSignal(false),
    [dismissed, setDismissed] = createSignal<number>(),
    [active, setActive] = createSignal(0);
  const typing = createMemo(() =>
    local.mentions && focused() ? mentionAt(local.value, caret()) : undefined,
  );
  const options = createMemo(() => {
    const word = typing();
    return word && local.mentions && dismissed() !== word.start
      ? matching(local.mentions.candidates, word.query)
      : [];
  });
  createEffect(on(options, () => setActive(0)));
  const open = () => options().length > 0;
  const track = () => setCaret(input.selectionStart ?? input.value.length);
  const choose = (candidate: MentionCandidate) => {
    const word = typing();
    if (!word) return;
    const next = insertMention(local.value, word.start, caret(), candidate.label);
    local.onInput(next.text);
    local.mentions?.onMention(candidate);
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
      fit();
    });
  };
  const optionId = (index: number) => `${listId}-${index}`;
  return (
    <>
      <textarea
        {...native}
        ref={(node) => {
          input = node;
          if (typeof local.ref === "function") local.ref(node);
        }}
        rows={2}
        value={local.value}
        aria-autocomplete={local.mentions ? "list" : undefined}
        aria-controls={open() ? listId : undefined}
        aria-activedescendant={open() ? optionId(active()) : undefined}
        class={classes(s.input, local.class, local.classList)}
        onInput={(event) => {
          local.onInput(event.currentTarget.value);
          track();
          fit();
        }}
        onKeyUp={track}
        onClick={track}
        onFocus={() => {
          setFocused(true);
          track();
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (typeof local.onKeyDown === "function") local.onKeyDown(event);
          if (event.defaultPrevented || event.isComposing) return;
          if (open()) {
            const count = options().length;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
              return;
            }
            if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
              event.preventDefault();
              choose(options()[active()]!);
              return;
            }
            if (event.key === "Escape") {
              // Closing the list must not also close a sheet around the composer.
              event.preventDefault();
              event.stopPropagation();
              setDismissed(typing()?.start);
              return;
            }
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <Show when={open()}>
        <ul id={listId} role="listbox" aria-label={local.mentions?.label} class={s.suggestions}>
          <For each={options()}>
            {(candidate, index) => (
              <li
                id={optionId(index())}
                role="option"
                aria-selected={index() === active()}
                class={s.suggestion}
                // Choosing keeps focus in the text.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index())}
                onClick={() => choose(candidate)}
              >
                <Avatar.Root kind={candidate.kind} decorative>
                  <Avatar.Fallback>{initialsOf(candidate.label)}</Avatar.Fallback>
                </Avatar.Root>
                <span class={s.suggestionLabel}>{candidate.label}</span>
                <Show when={candidate.description}>
                  <span class={s.suggestionNote}>{candidate.description}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  );
}
const initialsOf = (label: string) =>
  label
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(new Intl.Segmenter().segment(word), (part) => part.segment)[0])
    .join("")
    .toLocaleUpperCase() || "?";
/** Controls under the text, ending with the send button. */
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.actions, local.class, local.classList)} />;
}
/** What sending does, under the frame. Give it an `id` and describe the Input by it. */
export function Note(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.note, local.class, local.classList)} />;
}
/** Why sending failed; describe the Input by its `id` and mark the Input invalid. */
export function Error(props: { id: string; children: JSX.Element }) {
  return <FormError id={props.id}>{props.children}</FormError>;
}
export type DockProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** The surface the composer sits on, which scrolling content passes beneath. */
  surface?: "canvas" | "panel";
};
/** Keeps a composer at the bottom of its scrolling region, over the content behind it. */
export function Dock(props: DockProps) {
  const [local, native] = splitProps(props, ["surface", "class", "classList"]);
  return (
    <div
      {...native}
      class={classes(
        `${s.docked} ${s.dock[local.surface ?? "canvas"]}`,
        local.class,
        local.classList,
      )}
    />
  );
}
