import { Show, createContext, createUniqueId, splitProps, useContext, type JSX } from "solid-js";
import { IconCheck } from "@amends-dev/icons";
import * as fieldStyles from "../field/field.css.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./choice.css.ts";

interface State {
  readonly variant: () => "chip" | "card";
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
  /**
   * "chip" sets short options in a row, such as Public and Private. "card" stacks full-width
   * options with a radio and a description, such as where something runs. Default "chip".
   */
  variant?: "chip" | "card";
};

/** One choice among a few boxed options, such as a group's visibility. */
export function Group(props: GroupProps) {
  const [local, native] = splitProps(props, [
    "label",
    "value",
    "onChange",
    "hint",
    "name",
    "variant",
    "disabled",
    "class",
    "children",
  ]);
  const id = createUniqueId();
  const state: State = {
    variant: () => local.variant ?? "chip",
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
        <div class={s.options} data-variant={local.variant ?? "chip"}>
          {local.children}
        </div>
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
  /** What choosing it means, under its label in a card. */
  description?: string;
};

export function Option(props: OptionProps) {
  const state = useContext(Context);
  if (!state) throw new Error("Choice.Option must be inside Choice.Group");
  return (
    <label class={s.option} data-variant={state.variant()}>
      <input
        type="radio"
        class={s.input}
        name={state.name}
        value={props.value}
        checked={state.value() === props.value}
        onChange={() => state.select(props.value)}
      />
      <Show
        when={state.variant() === "card"}
        fallback={
          <>
            <span class={s.label}>{props.children}</span>
            <IconCheck class={s.check} />
          </>
        }
      >
        <span class={s.radio} aria-hidden="true" />
        <span class={s.cardText}>
          <span class={s.cardLabel}>{props.children}</span>
          <Show when={props.description}>
            <span class={s.description}>{props.description}</span>
          </Show>
        </span>
      </Show>
    </label>
  );
}
