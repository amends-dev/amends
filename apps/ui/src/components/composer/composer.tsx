import {
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Editor, type ChainedCommands } from "@tiptap/core";
import {
  IconAlertTriangle,
  IconBold,
  IconCode,
  IconCodeBlock,
  IconItalic,
  IconLink,
  IconList,
  IconListOrdered,
  IconMarkMention,
  IconMarkSend,
  IconQuote,
  IconStrikethrough,
  IconType,
} from "@amends/icons";
import { Avatar } from "../avatar/index.ts";
import { Button } from "../button/index.ts";
import { IconButton } from "../icon-button/index.ts";
import { Input as TextInput } from "../input/index.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import {
  commandQuery,
  extensions,
  linkAddress,
  markdownOf,
  mentionQuery,
  textBeforeCaret,
} from "./editor.ts";
import * as s from "./composer.css.ts";

/** Someone the draft can mention after "@". */
export interface MentionCandidate {
  readonly id: string;
  readonly name: string;
  readonly agent?: boolean;
}

/** Something the reader can do by typing "/" and its name in place of a message. */
export interface ComposerCommand {
  /** What follows "/", such as "rename". */
  readonly name: string;
  /** What it does, such as "Rename #general". */
  readonly description: string;
}

/** A suggestion for what is being typed: a member after "@", or a command after "/". */
type Choice =
  | { readonly kind: "mention"; readonly candidate: MentionCandidate }
  | { readonly kind: "command"; readonly command: ComposerCommand };

/** The text a link is being written for: its range in the draft, and its address so far. */
interface LinkTarget {
  readonly from: number;
  readonly to: number;
  readonly href: string;
  /** The range is already a link, which can be removed. */
  readonly existing: boolean;
}

interface State {
  readonly value: Accessor<string>;
  readonly change: (value: string) => void;
  readonly submit: () => void;
  readonly disabled: Accessor<boolean>;
  readonly candidates: Accessor<readonly MentionCandidate[]>;
  readonly commands: Accessor<readonly ComposerCommand[]>;
  readonly runCommand: (name: string) => void;
  readonly editor: Accessor<Editor | undefined>;
  readonly setEditor: (editor: Editor | undefined) => void;
  /** Changes with every edit and caret move, for what reads the editor's state. */
  readonly revision: Accessor<number>;
  readonly revise: () => void;
  readonly formatting: Accessor<boolean>;
  readonly setFormatting: (open: boolean) => void;
  readonly formattingId: string;
  readonly link: Accessor<LinkTarget | undefined>;
  readonly openLink: () => void;
  readonly closeLink: () => void;
}
const Context = createContext<State>();
function useState(part: string): State {
  const state = useContext(Context);
  if (!state) throw new Error(`Composer.${part} must be inside Composer.Root`);
  return state;
}

export type RootProps = Omit<JSX.FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "onCommand"> & {
  /** The draft, as markdown; the caller keeps it so it survives navigation. */
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the draft's markdown when the reader sends it. */
  onSend: (value: string) => void;
  /** While sending, the draft stays editable but cannot be sent again. */
  disabled?: boolean;
  /** People the draft can mention; typing "@" suggests them. */
  mentionCandidates?: readonly MentionCandidate[];
  /** What typing "/" as the whole draft suggests; choosing one runs it rather than sending. */
  commands?: readonly ComposerCommand[];
  /** Runs a command by name; the "/name" typed is cleared from the draft. */
  onCommand?: (name: string) => void;
};

/**
 * Writes and sends a message, formatted as it is written. Holds Formatting, an Input, and a
 * Toolbar ending in Send.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "value",
    "onValueChange",
    "onSend",
    "disabled",
    "mentionCandidates",
    "commands",
    "onCommand",
    "class",
    "children",
  ]);
  const [form, setForm] = createSignal<HTMLFormElement>();
  const [editor, setEditor] = createSignal<Editor>();
  const [revision, setRevision] = createSignal(0);
  // Phones start with the formatting hidden, to leave room for the text.
  const [formatting, setFormatting] = createSignal(true);
  onMount(() => setFormatting(!window.matchMedia(media.mobile).matches));
  const [link, setLink] = createSignal<LinkTarget>();
  const state: State = {
    value: () => local.value,
    change: (value) => local.onValueChange(value),
    submit: () => form()?.requestSubmit(),
    disabled: () => local.disabled ?? false,
    candidates: () => local.mentionCandidates ?? [],
    commands: () => local.commands ?? [],
    runCommand: (name) => local.onCommand?.(name),
    editor,
    setEditor,
    revision,
    revise: () => setRevision((count) => count + 1),
    formatting,
    setFormatting,
    formattingId: createUniqueId(),
    link,
    openLink: () => {
      const current = editor();
      if (!current) return;
      if (current.isActive("link")) current.chain().extendMarkRange("link").run();
      const { from, to } = current.state.selection;
      const href = (current.getAttributes("link")["href"] as string | undefined) ?? "";
      setLink({ from, to, href, existing: href !== "" });
    },
    closeLink: () => {
      setLink(undefined);
      editor()?.commands.focus();
    },
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

export interface InputProps {
  /** Also the accessible name unless `aria-label` is given, such as "Message #general". */
  readonly placeholder: string;
  readonly "aria-label"?: string;
  readonly class?: string;
}

/**
 * The draft, formatted as it is written, growing with its text up to 40% of the viewport. Enter
 * sends; Shift+Enter starts a new line, list item, or code line. Markdown typed as it is written,
 * such as `**bold**` or "- " at the start of a line, becomes its formatting. Typing "@" suggests the
 * Root's mention candidates, and "/" as the whole draft its commands: arrows move, Enter or Tab
 * chooses, Escape closes.
 */
export function Input(props: InputProps) {
  const state = useState("Input");
  const id = createUniqueId();
  const [host, setHost] = createSignal<HTMLDivElement>();
  // The draft the editor last reported, so the caller's copy coming back is not reapplied.
  let reported: string | undefined;
  const [query, setQuery] = createSignal<{
    readonly kind: Choice["kind"];
    readonly from: number;
    readonly to: number;
    readonly query: string;
  }>();
  const [dismissed, setDismissed] = createSignal<number>();
  const [active, setActive] = createSignal(0);
  const suggestions = createMemo((): readonly Choice[] => {
    const current = query();
    if (!current || dismissed() === current.from) return [];
    const needle = current.query.toLocaleLowerCase();
    if (current.kind === "command")
      return state
        .commands()
        .filter((command) => command.name.toLocaleLowerCase().startsWith(needle))
        .map((command) => ({ kind: "command", command }));
    return state
      .candidates()
      .filter((candidate) =>
        candidate.name
          .toLocaleLowerCase()
          .split(/\s+/u)
          .some((word) => word.startsWith(needle)),
      )
      .slice(0, 8)
      .map((candidate) => ({ kind: "mention", candidate }));
  });
  createEffect(() => {
    suggestions();
    setActive(0);
  });
  const open = () => suggestions().length > 0;
  const choose = (choice: Choice) => {
    const current = query();
    const editor = state.editor();
    if (!current || !editor) return;
    if (choice.kind === "command") {
      // A command is done, not said: its "/name" leaves the draft.
      editor.commands.clearContent(true);
      state.runCommand(choice.command.name);
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt({ from: current.from, to: current.to }, [
        { type: "mention", attrs: { id: choice.candidate.id, label: choice.candidate.name } },
        { type: "text", text: " " },
      ])
      .run();
  };
  const keydown = (editor: Editor, event: KeyboardEvent) => {
    // Keys while an input method composes text, such as the Enter that confirms a Japanese
    // conversion, belong to it: they neither send nor edit. Safari reports that Enter as keyCode 229.
    if (event.isComposing || event.keyCode === 229) return true;
    if (open()) {
      const count = suggestions().length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setActive((active() + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
        const choice = suggestions()[active()];
        if (choice) choose(choice);
        return true;
      }
      if (event.key === "Escape") {
        // Only the suggestions close, not a sheet the composer sits in.
        event.stopPropagation();
        setDismissed(query()?.from);
        return true;
      }
    }
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
    // A mention deletes whole, as it was chosen.
    const { selection } = editor.state;
    const before = selection.$from.nodeBefore;
    if (event.key === "Backspace" && plain && selection.empty && before?.type.name === "mention")
      return editor.commands.deleteRange({
        from: selection.from - before.nodeSize,
        to: selection.from,
      });
    if (event.key !== "Enter" || !plain) return false;
    if (!event.shiftKey) {
      state.submit();
      return true;
    }
    return editor.commands.first(({ commands }) => [
      () => commands.newlineInCode(),
      () => commands.splitListItem("listItem"),
      () => commands.setHardBreak(),
    ]);
  };
  const combobox = () => state.candidates().length > 0 || state.commands().length > 0;
  const attributes = (): Record<string, string> => {
    const named: Record<string, string> = {
      class: classes(s.input, props.class),
      role: combobox() ? "combobox" : "textbox",
      "aria-multiline": "true",
      "aria-label": props["aria-label"] ?? props.placeholder,
    };
    if (combobox()) {
      named["aria-autocomplete"] = "list";
      named["aria-expanded"] = String(open());
    }
    if (open()) {
      named["aria-controls"] = `${id}-suggestions`;
      named["aria-activedescendant"] = `${id}-suggestion-${active()}`;
    }
    return named;
  };
  onMount(() => {
    reported = state.value();
    const editor = new Editor({
      element: host(),
      injectCSS: false,
      extensions: extensions({ placeholder: () => props.placeholder, openLink: state.openLink }),
      content: reported,
      contentType: "markdown",
      editorProps: {
        attributes: attributes(),
        handleKeyDown: (_view, event) => keydown(editor, event),
      },
      onUpdate: ({ editor: current }) => {
        reported = markdownOf(current);
        state.change(reported);
      },
      onTransaction: ({ editor: current }) => {
        const command = commandQuery(current);
        const mention = command ? undefined : mentionQuery(current);
        setQuery(
          command ? { kind: "command", ...command } : mention && { kind: "mention", ...mention },
        );
        state.revise();
      },
      onFocus: () => setDismissed(undefined),
      onBlur: () => setDismissed(query()?.from),
    });
    state.setEditor(editor);
    onCleanup(() => {
      state.setEditor(undefined);
      editor.destroy();
    });
  });
  // A draft the caller replaces, such as one cleared once sent, or another thread's.
  createEffect(() => {
    const value = state.value(),
      editor = state.editor();
    if (!editor || value === reported) return;
    reported = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  });
  createEffect(() => {
    const editor = state.editor();
    if (editor)
      editor.setOptions({
        editorProps: { ...editor.options.editorProps, attributes: attributes() },
      });
  });
  return (
    <>
      <Show when={open()}>
        <ul
          class={s.suggestions}
          role="listbox"
          id={`${id}-suggestions`}
          aria-label={query()?.kind === "command" ? "Commands" : "People to mention"}
        >
          <For each={suggestions()}>
            {(choice, index) => (
              <li
                id={`${id}-suggestion-${index()}`}
                role="option"
                aria-selected={active() === index()}
                class={s.suggestion}
                // Keep focus in the text while choosing with the pointer.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(choice)}
              >
                <Show
                  when={choice.kind === "mention" && choice.candidate}
                  fallback={
                    <Show when={choice.kind === "command" && choice.command}>
                      {(command) => (
                        <>
                          <span class={s.commandName}>/{command().name}</span>
                          <span class={s.commandDescription}>{command().description}</span>
                        </>
                      )}
                    </Show>
                  }
                >
                  {(candidate) => (
                    <>
                      <Avatar name={candidate().name} size={22} decorative />
                      <span
                        class={s.suggestionName}
                        data-agent={candidate().agent ? "" : undefined}
                      >
                        {candidate().name}
                      </span>
                    </>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={state.link()}>{(target) => <LinkForm target={target()} />}</Show>
      <div ref={setHost} class={s.host} />
    </>
  );
}

/** Where a link leads: the selected text's, or the address itself as the text when none is. */
function LinkForm(props: { readonly target: LinkTarget }) {
  const state = useState("Input");
  const [address, setAddress] = createSignal(props.target.href);
  const [invalid, setInvalid] = createSignal(false);
  const [field, setField] = createSignal<HTMLInputElement>();
  onMount(() => field()?.focus());
  const save = () => {
    const editor = state.editor();
    const href = linkAddress(address());
    if (!editor) return;
    if (href === undefined) {
      setInvalid(true);
      return;
    }
    const { from, to } = props.target;
    const chain = editor.chain().focus().setTextSelection({ from, to });
    if (from === to)
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] });
    else chain.setLink({ href });
    chain.run();
    state.closeLink();
  };
  const remove = () => {
    const { from, to } = props.target;
    state.editor()?.chain().focus().setTextSelection({ from, to }).unsetLink().run();
    state.closeLink();
  };
  return (
    <div
      class={s.linkForm}
      role="group"
      aria-label="Link"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        state.closeLink();
      }}
    >
      <TextInput
        ref={setField}
        class={s.linkAddress}
        value={address()}
        placeholder="https://"
        aria-label="Link address"
        aria-invalid={invalid() ? true : undefined}
        onInput={(event) => {
          setAddress(event.currentTarget.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.isComposing) return;
          event.preventDefault();
          save();
        }}
      />
      <Show when={props.target.existing}>
        <Button variant="quiet" onClick={remove}>
          Remove
        </Button>
      </Show>
      <Button variant="primary" onClick={save}>
        Save
      </Button>
    </div>
  );
}

const mac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.platform);
/** A shortcut as assistive technology names it, Mod being the platform's command key. */
const shortcut = (keys: string) => keys.replace("Mod", mac() ? "Meta" : "Control");

interface FormatProps {
  readonly icon: IconComponent;
  readonly label: string;
  /** Such as "Mod+B", Mod being the platform's command key. */
  readonly keys: string;
  readonly active: () => boolean;
  readonly can: (chain: ChainedCommands) => ChainedCommands;
}

function Format(props: FormatProps) {
  const state = useState("Formatting");
  const editor = () => {
    state.revision();
    return state.editor();
  };
  return (
    <IconButton
      icon={props.icon}
      label={props.label}
      size="compact"
      class={s.format}
      aria-pressed={props.active()}
      aria-keyshortcuts={shortcut(props.keys)}
      disabled={!editor() || !props.can(editor()!.can().chain()).run()}
      // Keep the selection in the text while formatting it with the pointer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const editor = state.editor();
        if (editor) props.can(editor.chain().focus()).run();
      }}
    />
  );
}

/**
 * Bold, italic, strikethrough, link, lists, quote, code, and code block for the text or selection,
 * each pressed while it applies there. Hidden while FormattingToggle has it closed.
 */
export function Formatting() {
  const state = useState("Formatting");
  const active = (name: string) => () => {
    state.revision();
    return state.editor()?.isActive(name) ?? false;
  };
  const linked = active("link");
  return (
    <div
      id={state.formattingId}
      role="toolbar"
      aria-label="Formatting"
      class={s.formatting}
      hidden={!state.formatting()}
    >
      <Format
        icon={IconBold}
        label="Bold"
        keys="Mod+B"
        active={active("bold")}
        can={(chain) => chain.toggleBold()}
      />
      <Format
        icon={IconItalic}
        label="Italic"
        keys="Mod+I"
        active={active("italic")}
        can={(chain) => chain.toggleItalic()}
      />
      <Format
        icon={IconStrikethrough}
        label="Strikethrough"
        keys="Mod+Shift+X"
        active={active("strike")}
        can={(chain) => chain.toggleStrike()}
      />
      <span class={s.separator} aria-hidden="true" />
      <IconButton
        icon={IconLink}
        label="Link"
        size="compact"
        class={s.format}
        aria-pressed={linked()}
        aria-keyshortcuts={shortcut("Mod+Shift+U")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => state.openLink()}
      />
      <span class={s.separator} aria-hidden="true" />
      <Format
        icon={IconListOrdered}
        label="Numbered list"
        keys="Mod+Shift+7"
        active={active("orderedList")}
        can={(chain) => chain.toggleOrderedList()}
      />
      <Format
        icon={IconList}
        label="Bulleted list"
        keys="Mod+Shift+8"
        active={active("bulletList")}
        can={(chain) => chain.toggleBulletList()}
      />
      <span class={s.separator} aria-hidden="true" />
      <Format
        icon={IconQuote}
        label="Quote"
        keys="Mod+Shift+9"
        active={active("blockquote")}
        can={(chain) => chain.toggleBlockquote()}
      />
      <Format
        icon={IconCode}
        label="Code"
        keys="Mod+Shift+C"
        active={active("code")}
        can={(chain) => chain.toggleCode()}
      />
      <Format
        icon={IconCodeBlock}
        label="Code block"
        keys="Mod+Alt+Shift+C"
        active={active("codeBlock")}
        can={(chain) => chain.toggleCodeBlock()}
      />
    </div>
  );
}

/** Shows or hides Formatting. */
export function FormattingToggle() {
  const state = useState("FormattingToggle");
  return (
    <IconButton
      icon={IconType}
      label="Formatting"
      aria-pressed={state.formatting()}
      aria-controls={state.formattingId}
      class={s.format}
      onClick={() => state.setFormatting(!state.formatting())}
    />
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
        const editor = state.editor();
        if (!editor) return;
        const before = textBeforeCaret(editor);
        editor
          .chain()
          .focus()
          .insertContent(before === "" || /\s$/u.test(before) ? "@" : " @")
          .run();
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
