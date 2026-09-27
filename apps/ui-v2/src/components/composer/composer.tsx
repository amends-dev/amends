import {
  createContext,
  createEffect,
  createSignal,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { IconMarkSend } from "@amends/icons";
import { IconButton } from "../icon-button/index.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./composer.css.ts";

interface State {
  readonly value: Accessor<string>;
  readonly change: (value: string) => void;
  readonly form: Accessor<HTMLFormElement | undefined>;
  readonly disabled: Accessor<boolean>;
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
};

/** Writes and sends a message. Holds an Input and a Toolbar ending in Send. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "value",
    "onValueChange",
    "onSend",
    "disabled",
    "class",
    "children",
  ]);
  const [form, setForm] = createSignal<HTMLFormElement>();
  const state: State = {
    value: () => local.value,
    change: (value) => local.onValueChange(value),
    form,
    disabled: () => local.disabled ?? false,
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

/** Grows with its text up to 40% of the viewport. Enter sends; Shift+Enter starts a new line. */
export function Input(props: InputProps) {
  const state = useState("Input");
  const [local, native] = splitProps(props, ["class", "placeholder", "aria-label"]);
  const [element, setElement] = createSignal<HTMLTextAreaElement>();
  createEffect(() => {
    const area = element();
    state.value();
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  });
  return (
    <textarea
      {...native}
      ref={setElement}
      rows={1}
      value={state.value()}
      placeholder={local.placeholder}
      aria-label={local["aria-label"] ?? local.placeholder}
      class={classes(s.input, local.class)}
      onInput={(event) => state.change(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          state.form()?.requestSubmit();
        }
      }}
    />
  );
}

export type ToolbarProps = JSX.HTMLAttributes<HTMLDivElement>;

/** Actions under the text, such as IconButtons for attaching or mentioning, then Send. */
export function Toolbar(props: ToolbarProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.toolbar, local.class)} />;
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
