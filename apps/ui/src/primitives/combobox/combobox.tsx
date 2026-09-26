/* @refresh reload */
import * as Primitive from "@kobalte/core/combobox";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  splitProps,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { createOverlayScope } from "../overlay/scope.ts";
import { callHandler, classes } from "../internal/props.ts";
import * as popup from "../select/select.css.ts";
import * as s from "./combobox.css.ts";

export interface Option {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}
export type ItemComponentProps<T extends Option> = Primitive.ComboboxRootItemComponentProps<T>;
export type RootProps<T extends Option> = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "onChange" | "onInvalid"
> & {
  options: ReadonlyArray<T>;
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string | null) => void;
  onInvalid?: (event: Event) => void;
  /** Kobalte's list renderer; compose Item's named parts inside it. */
  itemComponent?: (props: ItemComponentProps<T>) => JSX.Element;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Search/assignment pickers can show the selection outside the input, as in the reference. */
  clearOnSelect?: boolean;
};
interface State {
  readonly form: Accessor<string | undefined>;
  readonly clear: () => void;
  readonly clearOnSelect: Accessor<boolean>;
  readonly readOnly: Accessor<boolean>;
  readonly scope: ReturnType<typeof createOverlayScope>;
  readonly input: Accessor<HTMLInputElement | undefined>;
  readonly setInput: (input: HTMLInputElement) => void;
  /** Kobalte's own input text, which Lifecycle connects once the primitive exists. */
  readonly connectInputText: (clear: () => void) => void;
}
const Context = createContext<State>();
function context() {
  const value = useContext(Context);
  if (!value) throw new Error("Combobox parts require Combobox.Root");
  return value;
}
function Lifecycle() {
  const state = context(),
    primitive = Primitive.useComboboxContext();
  state.connectInputText(() => primitive.setInputValue(""));
  createEffect(on(state.scope.mount, () => primitive.close(), { defer: true }));
  createEffect(() => {
    if (primitive.isDisabled() || state.readOnly()) primitive.close();
  });
  return null;
}
/** Single selected key; typing filters labels and never commits free text as a value. */
export function Root<T extends Option>(props: RootProps<T>) {
  const [local, native] = splitProps(props, [
    "options",
    "value",
    "defaultValue",
    "onChange",
    "onInvalid",
    "itemComponent",
    "name",
    "form",
    "required",
    "disabled",
    "readOnly",
    "clearOnSelect",
    "children",
    "class",
    "classList",
  ]);
  const [internal, setInternal] = createSignal<string | null>(
    untrack(() => local.defaultValue ?? null),
  );
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [select, setSelect] = createSignal<HTMLSelectElement>();
  const [inheritedDisabled, setInheritedDisabled] = createSignal(false);
  const scope = createOverlayScope(input);
  const options = createMemo(() => {
    const keys = new Set<string>();
    for (const option of local.options) {
      if (!option.value || keys.has(option.value))
        throw new Error("Combobox option values must be non-empty and unique");
      keys.add(option.value);
    }
    return [...local.options];
  });
  const key = () => (local.value === undefined ? internal() : local.value);
  const selected = createMemo(() => options().find((option) => option.value === key()) ?? null);
  let clearInputText = () => {};
  const change = (option: T | null) => {
    const value = option?.value ?? null;
    if (local.value === undefined) setInternal(value);
    local.onChange?.(value);
    // A caller that keeps nothing selected, such as one adding each choice to a list, still gets
    // an empty input back once Kobalte has finished selecting.
    if (option !== null && local.clearOnSelect) queueMicrotask(() => clearInputText());
  };
  createEffect(() => {
    scope.mount();
    const element = select();
    const ownDisabled = local.disabled;
    if (!element) return;
    const update = () => setInheritedDisabled(element.matches(":disabled") && !ownDisabled);
    update();
    const observer = new MutationObserver(update);
    for (let node = element.parentElement; node; node = node.parentElement)
      observer.observe(node, { attributes: true, attributeFilter: ["disabled"] });
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    options();
    const element = select();
    if (!element) return;
    for (const option of element.options)
      option.defaultSelected = option.value === (local.defaultValue ?? "");
    element.value = selected()?.value ?? "";
  });
  createEffect(() => {
    const element = select(),
      form = element?.form;
    if (!element || !form) return;
    const reset = () =>
      queueMicrotask(() => {
        if (element.isConnected) element.value = selected()?.value ?? "";
      });
    form.addEventListener("reset", reset);
    onCleanup(() => form.removeEventListener("reset", reset));
  });
  return (
    <Context.Provider
      value={{
        scope,
        input,
        setInput,
        connectInputText: (clear) => {
          clearInputText = clear;
        },
        form: () => local.form,
        clear: () => change(null),
        clearOnSelect: () => local.clearOnSelect ?? false,
        readOnly: () => local.readOnly ?? false,
      }}
    >
      <Primitive.Root<T>
        {...native}
        class={classes(s.root, local.class, local.classList)}
        options={options()}
        optionValue="value"
        optionTextValue="label"
        optionDisabled="disabled"
        optionLabel={(option) => (local.clearOnSelect ? "" : option.label)}
        value={selected()}
        defaultValue={options().find((option) => option.value === local.defaultValue)}
        onChange={change}
        name={local.name}
        required={local.required}
        disabled={local.disabled || inheritedDisabled()}
        readOnly={local.readOnly}
        triggerMode="focus"
        defaultFilter="contains"
        allowsEmptyCollection
        closeOnSelection
        modal={false}
        placement="bottom-start"
        gutter={6}
        sameWidth
        fitViewport
        overflowPadding={8}
        itemComponent={(item) =>
          local.itemComponent ? (
            local.itemComponent(item)
          ) : (
            <Item item={item.item}>
              <ItemLabel>{item.item.rawValue.label}</ItemLabel>
            </Item>
          )
        }
      >
        <Lifecycle />
        {local.children}
        <select
          ref={setSelect}
          class={popup.native}
          aria-hidden="true"
          tabIndex={-1}
          name={local.name}
          form={local.form}
          required={local.required}
          disabled={local.disabled}
          onFocus={() => input()?.focus()}
          onInvalid={(event) => {
            event.preventDefault();
            input()?.focus();
            local.onInvalid?.(event);
          }}
          onChange={(event) =>
            change(options().find((option) => option.value === event.currentTarget.value) ?? null)
          }
        >
          <option value="" selected={!selected()} />
          <For each={options()}>
            {(option) => (
              <option
                value={option.value}
                disabled={option.disabled}
                selected={selected()?.value === option.value}
              >
                {option.label}
              </option>
            )}
          </For>
        </select>
      </Primitive.Root>
    </Context.Provider>
  );
}
export function Control(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <Primitive.Control {...native} class={classes(s.control, local.class, local.classList)} />;
}
export type InputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  | "value"
  | "type"
  | "name"
  | "children"
  | keyof Primitive.ComboboxInputCommonProps<HTMLInputElement>
> &
  Primitive.ComboboxInputProps<"input">;
export function Input(props: InputProps) {
  const state = context();
  const [local, native] = splitProps(props, ["ref", "class", "classList", "onInput"]);
  return (
    <Primitive.Input<"input">
      {...native}
      required={false}
      form={native.form ?? state.form()}
      onInput={(event) => {
        callHandler(local.onInput, event);
        if (!event.defaultPrevented && !state.clearOnSelect() && !event.currentTarget.value)
          state.clear();
      }}
      class={classes(s.input, local.class, local.classList)}
      ref={(element) => {
        state.setInput(element);
        if (typeof local.ref === "function") local.ref(element);
      }}
    />
  );
}
export function Content(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const state = context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Primitive.Portal mount={state.scope.mount()}>
      <div style={state.scope.style()} dir={state.scope.direction()}>
        <Primitive.Content
          {...native}
          class={classes(popup.content, local.class, local.classList)}
          onCloseAutoFocus={(event) => event.preventDefault()}
        />
      </div>
    </Primitive.Portal>
  );
}
export function Listbox(props: Omit<JSX.HTMLAttributes<HTMLUListElement>, "children">) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <Primitive.Listbox {...native} class={classes(s.listbox, local.class, local.classList)} />;
}
export function Empty(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const primitive = Primitive.useComboboxContext();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Show when={primitive.listState().collection().getSize() === 0}>
      <div {...native} role="status" class={classes(s.empty, local.class, local.classList)} />
    </Show>
  );
}
export function Item(props: Primitive.ComboboxItemProps & JSX.LiHTMLAttributes<HTMLLIElement>) {
  const [local, native] = splitProps(props, ["class", "classList", "onMouseDown"]);
  return (
    <Primitive.Item
      {...native}
      class={classes(s.item, local.class, local.classList)}
      onMouseDown={(event) => {
        callHandler(local.onMouseDown, event);
        // Options use virtual focus. Native dialogs otherwise take focus on mouse-down
        // and dismiss the popup before Kobalte can select on pointer-up.
        if (event.button === 0) event.preventDefault();
      }}
    />
  );
}
export function ItemLabel(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Primitive.ItemLabel
      as="span"
      {...native}
      class={classes(popup.optionLabel, local.class, local.classList)}
    />
  );
}
export function ItemDescription(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Primitive.ItemDescription
      as="span"
      {...native}
      class={classes(s.description, local.class, local.classList)}
    />
  );
}
/** Decorative 22px initial/ring marker from the picker reference. The item label carries identity. */
export function ItemMark(
  props: JSX.HTMLAttributes<HTMLSpanElement> & { ring?: "solid" | "dashed" },
) {
  const [local, native] = splitProps(props, ["ring", "class", "classList"]);
  return (
    <span
      {...native}
      aria-hidden="true"
      data-ring={local.ring ?? "solid"}
      class={classes(s.mark, local.class, local.classList)}
    />
  );
}
