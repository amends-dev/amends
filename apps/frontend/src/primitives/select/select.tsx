import * as Primitive from "@kobalte/core/select";
import {
  For,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  on,
  splitProps,
  untrack,
  type JSX,
} from "solid-js";
import { createOverlayScope } from "../overlay/scope.ts";
import * as s from "./select.css.ts";

export interface SelectOption {
  /** Unique, non-empty form value. */
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}
export type SelectProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type" | "value" | "onChange" | "onInvalid" | "name"
> & {
  options: readonly SelectOption[];
  /** null clears the selection; undefined uses internal state. */
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  name?: string;
  required?: boolean;
  onInvalid?: (event: Event) => void;
};

/** Single-choice popup. Kobalte owns keyboard/focus behavior; the caller owns options and validation. */
export function Select(props: SelectProps): JSX.Element {
  const [local, triggerProps] = splitProps(props, [
    "options",
    "value",
    "defaultValue",
    "onChange",
    "placeholder",
    "name",
    "required",
    "disabled",
    "onInvalid",
    "ref",
    "class",
    "classList",
    "form",
  ]);
  const [internalValue, setInternalValue] = createSignal<string | null>(
    untrack(() => local.defaultValue ?? null),
  );
  const [trigger, setTrigger] = createSignal<HTMLButtonElement>();
  const [nativeSelect, setNativeSelect] = createSignal<HTMLSelectElement>();
  const [open, setOpen] = createSignal(false);
  let restoreFocus = true;
  const [inheritedDisabled, setInheritedDisabled] = createSignal(false);
  const scope = createOverlayScope(trigger);
  createEffect(
    on(
      scope.mount,
      () => {
        restoreFocus = false;
        setOpen(false);
      },
      { defer: true },
    ),
  );
  const currentValue = () => (local.value === undefined ? internalValue() : local.value);
  const options = createMemo(() => {
    const seen = new Set<string>();
    for (const option of local.options) {
      if (!option.value || seen.has(option.value))
        throw new Error("Select option values must be non-empty and unique");
      seen.add(option.value);
    }
    return [...local.options];
  });
  const selected = createMemo(
    () => options().find((option) => option.value === currentValue()) ?? null,
  );
  const disabled = () => local.disabled || inheritedDisabled();
  const change = (option: SelectOption | null) => {
    const value = option?.value ?? null;
    if (local.value === undefined) setInternalValue(value);
    local.onChange?.(value);
  };

  // Recheck fieldset inheritance when the same control moves into another host.
  createEffect(() => {
    scope.mount();
    const anchor = trigger(),
      native = nativeSelect(),
      ownDisabled = local.disabled;
    if (!anchor || !native) return;
    const update = () => {
      setInheritedDisabled(native.matches(":disabled") && !ownDisabled);
    };
    update();
    const observer = new MutationObserver(update);
    for (let node = anchor.parentElement; node; node = node.parentElement)
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    if (disabled()) setOpen(false);
  });
  createEffect(() => {
    options();
    const native = nativeSelect();
    if (!native) return;
    for (const option of native.options)
      option.defaultSelected = option.value === (local.defaultValue ?? "");
    native.value = selected()?.value ?? "";
  });
  createEffect(() => {
    const native = nativeSelect();
    const form = native?.form;
    if (!native || !form) return;
    // The browser resets native values after reset listeners run. Resynchronize
    // after that default action, including a caller's controlled reset state.
    const reset = () =>
      queueMicrotask(() => {
        if (native.isConnected) native.value = selected()?.value ?? "";
      });
    form.addEventListener("reset", reset);
    onCleanup(() => form.removeEventListener("reset", reset));
  });
  const classes = () =>
    [
      s.trigger,
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <Primitive.Root<SelectOption>
      class={s.root}
      options={options()}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      value={selected()}
      defaultValue={local.options.find((option) => option.value === local.defaultValue)}
      onChange={change}
      open={open()}
      onOpenChange={(next) => {
        if (next) restoreFocus = true;
        setOpen(next && !disabled());
      }}
      disabled={disabled()}
      required={local.required}
      placeholder={local.placeholder ?? "Choose an option"}
      modal={false}
      placement="bottom-start"
      gutter={6}
      sameWidth
      fitViewport
      overflowPadding={8}
      itemComponent={(itemProps) => (
        <Primitive.Item item={itemProps.item} class={s.item}>
          <span class={s.indicatorSlot} aria-hidden="true">
            <Primitive.ItemIndicator>✓</Primitive.ItemIndicator>
          </span>
          <Primitive.ItemLabel class={s.optionLabel}>
            {itemProps.item.rawValue.label}
          </Primitive.ItemLabel>
        </Primitive.Item>
      )}
    >
      <Primitive.Trigger
        {...triggerProps}
        form={local.form}
        class={classes()}
        ref={(element) => {
          setTrigger(element);
          if (typeof local.ref === "function") local.ref(element);
        }}
      >
        <Primitive.Value<SelectOption> class={s.value}>
          {(state) => state.selectedOption().label}
        </Primitive.Value>
        <Primitive.Icon class={s.icon}>▾</Primitive.Icon>
      </Primitive.Trigger>
      <select
        ref={setNativeSelect}
        class={s.native}
        aria-hidden="true"
        tabIndex={-1}
        name={local.name}
        form={local.form}
        required={local.required}
        disabled={local.disabled}
        onFocus={() => trigger()?.focus()}
        onInvalid={(event) => {
          event.preventDefault();
          trigger()?.focus();
          local.onInvalid?.(event);
        }}
        onChange={(event) =>
          change(local.options.find((option) => option.value === event.currentTarget.value) ?? null)
        }
      >
        <option value="" selected={!selected()} />
        <For each={local.options}>
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
      <Primitive.Portal mount={scope.mount()}>
        <div style={scope.style()} dir={scope.direction()}>
          <Primitive.Content
            class={s.content}
            onInteractOutside={() => {
              restoreFocus = false;
            }}
            onCloseAutoFocus={(event) => {
              if (!restoreFocus || disabled()) event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              // Continue native Tab navigation from the trigger's place in the
              // form, rather than from the portal at the end of the document.
              restoreFocus = false;
              setOpen(false);
              trigger()?.focus();
            }}
          >
            <Primitive.Listbox class={s.listbox} />
          </Primitive.Content>
        </div>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
