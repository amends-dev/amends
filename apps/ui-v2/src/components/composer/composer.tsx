import {
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { IconAlertTriangle, IconMarkMention, IconMarkSend } from "@amends/icons";
import { Avatar } from "../avatar/index.ts";
import { IconButton } from "../icon-button/index.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./composer.css.ts";

/** Someone the draft can mention after "@". */
export interface MentionCandidate {
  readonly id: string;
  readonly name: string;
  readonly agent?: boolean;
}

interface State {
  readonly value: Accessor<string>;
  readonly change: (value: string) => void;
  readonly form: Accessor<HTMLFormElement | undefined>;
  readonly disabled: Accessor<boolean>;
  readonly candidates: Accessor<readonly MentionCandidate[]>;
  readonly mention: (candidate: MentionCandidate) => void;
  readonly input: Accessor<HTMLTextAreaElement | undefined>;
  readonly setInput: (input: HTMLTextAreaElement) => void;
}
const Context = createContext<State>();
function useState(part: string): State {
  const state = useContext(Context);
  if (!state) throw new Error(`Composer.${part} must be inside Composer.Root`);
  return state;
}

export type RootProps = Omit<JSX.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  /** The draft; the caller keeps it so it survives navigation. */
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the draft when the reader sends it. */
  onSend: (value: string) => void;
  /** While sending, the draft stays editable but cannot be sent again. */
  disabled?: boolean;
  /** People the draft can mention; typing "@" suggests them. */
  mentionCandidates?: readonly MentionCandidate[];
  /** The draft now mentions `candidate` by "@name". */
  onMention?: (candidate: MentionCandidate) => void;
};

/** Writes and sends a message. Holds an Input and a Toolbar ending in Send. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "value",
    "onValueChange",
    "onSend",
    "disabled",
    "mentionCandidates",
    "onMention",
    "class",
    "children",
  ]);
  const [form, setForm] = createSignal<HTMLFormElement>();
  const [input, setInput] = createSignal<HTMLTextAreaElement>();
  const state: State = {
    value: () => local.value,
    change: (value) => local.onValueChange(value),
    form,
    disabled: () => local.disabled ?? false,
    candidates: () => local.mentionCandidates ?? [],
    mention: (candidate) => local.onMention?.(candidate),
    input,
    setInput,
  };
  return (
    <Context.Provider value={state}>
      <form
        {...native}
        ref={setForm}
        class={classes(s.composer, local.class)}
        onSubmit={(event) => {
          event.preventDefault();
          if (!local.disabled && local.value.trim()) local.onSend(local.value);
        }}
      >
        {local.children}
      </form>
    </Context.Provider>
  );
}

export type InputProps = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onInput" | "children"
> & {
  /** Also the accessible name unless `aria-label` is given, such as "Message #general". */
  placeholder: string;
};

/** The "@name" being typed just before the caret, if any. */
function mentionQuery(text: string, caret: number) {
  const match = /(^|\s)@([^\s@]*)$/u.exec(text.slice(0, caret));
  return match ? { start: caret - match[2]!.length - 1, query: match[2]! } : undefined;
}

/**
 * Grows with its text up to 40% of the viewport. Enter sends; Shift+Enter starts a new line.
 * Typing "@" suggests the Root's mention candidates: arrows move, Enter or Tab chooses, Escape
 * closes.
 */
export function Input(props: InputProps) {
  const state = useState("Input");
  const [local, native] = splitProps(props, ["class", "placeholder", "aria-label"]);
  const id = createUniqueId();
  const [caret, setCaret] = createSignal(0);
  const [dismissed, setDismissed] = createSignal<number>();
  const [active, setActive] = createSignal(0);
  createEffect(() => {
    const area = state.input();
    state.value();
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  });
  const query = createMemo(() => mentionQuery(state.value(), caret()));
  const suggestions = createMemo(() => {
    const current = query();
    if (!current || dismissed() === current.start) return [];
    const needle = current.query.toLocaleLowerCase();
    return state
      .candidates()
      .filter((candidate) =>
        candidate.name
          .toLocaleLowerCase()
          .split(/\s+/u)
          .some((word) => word.startsWith(needle)),
      )
      .slice(0, 8);
  });
  createEffect(() => {
    suggestions();
    setActive(0);
  });
  const open = () => suggestions().length > 0;
  const track = (area: HTMLTextAreaElement) => setCaret(area.selectionStart ?? area.value.length);
  const choose = (candidate: MentionCandidate) => {
    const current = query();
    const area = state.input();
    if (!current || !area) return;
    const text = state.value();
    const inserted = `@${candidate.name} `;
    const next = text.slice(0, current.start) + inserted + text.slice(caret());
    const position = current.start + inserted.length;
    state.change(next);
    state.mention(candidate);
    queueMicrotask(() => {
      area.focus();
      area.setSelectionRange(position, position);
      setCaret(position);
    });
  };
  return (
    <div class={s.field}>
      <Show when={open()}>
        <ul
          class={s.suggestions}
          role="listbox"
          id={`${id}-mentions`}
          aria-label="People to mention"
        >
          <For each={suggestions()}>
            {(candidate, index) => (
              <li
                id={`${id}-mention-${index()}`}
                role="option"
                aria-selected={active() === index()}
                class={s.suggestion}
                // Keep focus in the text while choosing with the pointer.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(candidate)}
              >
                <Avatar name={candidate.name} size={22} decorative />
                <span class={s.suggestionName} data-agent={candidate.agent ? "" : undefined}>
                  {candidate.name}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <textarea
        {...native}
        ref={state.setInput}
        rows={1}
        value={state.value()}
        placeholder={local.placeholder}
        aria-label={local["aria-label"] ?? local.placeholder}
        role={state.candidates().length ? "combobox" : undefined}
        aria-autocomplete={state.candidates().length ? "list" : undefined}
        aria-expanded={state.candidates().length ? open() : undefined}
        aria-controls={open() ? `${id}-mentions` : undefined}
        aria-activedescendant={open() ? `${id}-mention-${active()}` : undefined}
        class={classes(s.input, local.class)}
        onInput={(event) => {
          track(event.currentTarget);
          state.change(event.currentTarget.value);
        }}
        onSelect={(event) => track(event.currentTarget)}
        onClick={(event) => track(event.currentTarget)}
        onBlur={() => setDismissed(query()?.start)}
        onFocus={() => setDismissed(undefined)}
        onKeyDown={(event) => {
          if (open()) {
            const count = suggestions().length;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((active() + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
              return;
            }
            if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
              event.preventDefault();
              const candidate = suggestions()[active()];
              if (candidate) choose(candidate);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDismissed(query()?.start);
              return;
            }
          }
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            state.form()?.requestSubmit();
          }
        }}
      />
    </div>
  );
}

export type ToolbarProps = JSX.HTMLAttributes<HTMLDivElement>;

/** Actions under the text, such as IconButtons for attaching or mentioning, then Send. */
export function Toolbar(props: ToolbarProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.toolbar, local.class)} />;
}

/** Starts a mention at the caret, opening the suggestions. */
export function Mention() {
  const state = useState("Mention");
  return (
    <IconButton
      icon={IconMarkMention}
      label="Mention someone"
      onClick={() => {
        const area = state.input();
        if (!area) return;
        const text = state.value();
        const at = area.selectionStart ?? text.length;
        const before = text.slice(0, at);
        const insert = before === "" || /\s$/u.test(before) ? "@" : " @";
        const position = at + insert.length;
        state.change(before + insert + text.slice(at));
        queueMicrotask(() => {
          area.focus();
          area.setSelectionRange(position, position);
          area.dispatchEvent(new Event("select"));
        });
      }}
    />
  );
}

export type AlertProps = Omit<JSX.HTMLAttributes<HTMLParagraphElement>, "role">;

/** Why the draft was not sent; it stays for another try. Announced when shown. */
export function Alert(props: AlertProps) {
  const [local, native] = splitProps(props, ["class", "children"]);
  return (
    <p {...native} role="alert" class={classes(s.error, local.class)}>
      <IconAlertTriangle class={s.errorIcon} />
      {local.children}
    </p>
  );
}

export type SendProps = {
  /** Default "Send". */
  label?: string;
};

/** Sends the draft; unavailable while it is empty. */
export function Send(props: SendProps) {
  const state = useState("Send");
  return (
    <IconButton
      type="submit"
      icon={IconMarkSend}
      label={props.label ?? "Send"}
      class={s.send}
      disabled={state.disabled() || !state.value().trim()}
    />
  );
}
