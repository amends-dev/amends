import {
  createContext,
  createUniqueId,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type JSX,
} from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./segmented-control.css.ts";
export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  value: string | undefined;
  onValueChange: (value: string) => void;
  name?: string;
  form?: string;
  disabled?: boolean;
  required?: boolean;
};
const Context =
  createContext<
    Pick<RootProps, "value" | "onValueChange" | "name" | "form" | "disabled" | "required">
  >();
/** One native radio group, presented as the reference's stitched segmented pill. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "value",
    "onValueChange",
    "name",
    "form",
    "disabled",
    "required",
    "children",
    "class",
    "classList",
  ]);
  const name = createUniqueId();
  return (
    <Context.Provider
      value={{
        get value() {
          return local.value;
        },
        onValueChange: (value) => local.onValueChange(value),
        get name() {
          return local.name ?? name;
        },
        get form() {
          return local.form;
        },
        get disabled() {
          return local.disabled;
        },
        get required() {
          return local.required;
        },
      }}
    >
      <div
        {...native}
        role="radiogroup"
        aria-disabled={local.disabled || undefined}
        aria-required={local.required || undefined}
        class={classes(s.root, local.class, local.classList)}
      >
        {local.children}
      </div>
    </Context.Provider>
  );
}
export type ItemProps = JSX.LabelHTMLAttributes<HTMLLabelElement> & {
  value: string;
  disabled?: boolean;
};
export function Item(props: ItemProps) {
  const group = useContext(Context);
  if (!group) throw new Error("SegmentedControl.Item requires SegmentedControl.Root");
  const [local, native] = splitProps(props, [
    "value",
    "disabled",
    "children",
    "class",
    "classList",
  ]);
  let input!: HTMLInputElement;
  onMount(() => {
    const form = input.form;
    const reset = () =>
      queueMicrotask(() => {
        if (input.isConnected) input.checked = group.value === local.value;
      });
    form?.addEventListener("reset", reset);
    onCleanup(() => form?.removeEventListener("reset", reset));
  });
  return (
    <label {...native} class={classes(s.item, local.class, local.classList)}>
      <input
        ref={(element) => {
          input = element;
        }}
        type="radio"
        class={s.input}
        name={group.name}
        form={group.form}
        value={local.value}
        checked={group.value === local.value}
        disabled={local.disabled || group.disabled}
        required={group.required}
        onChange={(event) => {
          if (event.currentTarget.checked) group.onValueChange(local.value);
        }}
      />
      <span class={s.label}>{local.children}</span>
    </label>
  );
}
