import { Show, createContext, createUniqueId, splitProps, useContext, type JSX } from "solid-js";
import { IconCheck } from "@amends/icons";
import * as fieldStyles from "../field/field.css.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./choice.css.ts";

interface State {
  readonly name: string;
  readonly value: () => string;
  readonly select: (value: string) => void;
  readonly disabled: () => boolean;
}
const Context = createContext<State>();

export type GroupProps = Omit<JSX.FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Help under the options, such as what the chosen one means. */
  hint?: string;
  /** Default a unique name. */
  name?: string;
};

/** One choice among a few boxed options, such as a group's visibility. */
export function Group(props: GroupProps) {
  const [local, native] = splitProps(props, [
    "label",
    "value",
    "onChange",
    "hint",
    "name",
    "disabled",
    "class",
    "children",
  ]);
  const id = createUniqueId();
  const state: State = {
    name: local.name ?? `choice-${id}`,
    value: () => local.value,
    select: (value) => local.onChange(value),
    disabled: () => local.disabled ?? false,
  };
  return (
    <Context.Provider value={state}>
      <fieldset
        {...native}
        disabled={local.disabled}
        aria-describedby={local.hint ? `choice-${id}-hint` : undefined}
        class={classes(s.group, local.class)}
      >
        <legend class={fieldStyles.label}>{local.label}</legend>
        <div class={s.options}>{local.children}</div>
        <Show when={local.hint}>
          <p id={`choice-${id}-hint`} class={fieldStyles.hint}>
            {local.hint}
          </p>
        </Show>
      </fieldset>
    </Context.Provider>
  );
}

export type OptionProps = {
  value: string;
  children: string;
};

export function Option(props: OptionProps) {
  const state = useContext(Context);
  if (!state) throw new Error("Choice.Option must be inside Choice.Group");
  return (
    <label class={s.option}>
      <input
        type="radio"
        class={s.input}
        name={state.name}
        value={props.value}
        checked={state.value() === props.value}
        onChange={() => state.select(props.value)}
      />
      <span class={s.label}>{props.children}</span>
      <IconCheck class={s.check} />
    </label>
  );
}
