import * as Primitive from "@kobalte/core/select";
import { Show, createMemo, createSignal } from "solid-js";
import { IconCheck, IconChevronDown } from "@amends/icons";
import { useField } from "../field/index.ts";
import { classes } from "../../internal/props.ts";
import { overlayMount } from "../../internal/overlay.ts";
import * as s from "./select.css.ts";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** A second line in the list, such as whether an account needs setup. */
  readonly description?: string;
}

export type SelectProps = {
  options: readonly SelectOption[];
  /** The chosen option's value; nothing chosen shows the placeholder. */
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** The accessible name outside a Field. */
  "aria-label"?: string;
  class?: string;
  /** An action after the options, such as creating a missing one; choosing it closes the list. */
  action?: { readonly label: string; readonly onSelect: () => void };
};

/**
 * One choice from a short list, shaped like an Input: the choice and a chevron, opening a list as
 * wide as the field. Inside a Field it takes the label, help, and error associations.
 */
export function Select(props: SelectProps) {
  const field = useField();
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [open, setOpen] = createSignal(false);
  // Options rebuilt with the same content keep their objects, so the chosen one stays the same
  // value to Kobalte rather than a new selection on every render.
  const options = createMemo<readonly SelectOption[]>(() => props.options, [], {
    equals: (previous, next) =>
      previous.length === next.length &&
      previous.every(
        (option, index) =>
          option.value === next[index]?.value &&
          option.label === next[index]?.label &&
          option.description === next[index]?.description,
      ),
  });
  const chosen = () => options().find((option) => option.value === props.value) ?? null;
  return (
    <Primitive.Root<SelectOption>
      options={[...options()]}
      optionValue="value"
      optionTextValue="label"
      value={chosen()}
      onChange={(option) => {
        if (option) props.onChange(option.value);
      }}
      placeholder={props.placeholder}
      disabled={props.disabled}
      open={open()}
      onOpenChange={setOpen}
      sameWidth
      gutter={4}
      placement="bottom-start"
      itemComponent={(item) => (
        <Primitive.Item item={item.item} class={s.item}>
          <Show
            when={item.item.rawValue.description}
            fallback={
              <Primitive.ItemLabel class={s.itemLabel}>
                {item.item.rawValue.label}
              </Primitive.ItemLabel>
            }
          >
            {(description) => (
              <span class={s.itemText}>
                <Primitive.ItemLabel class={s.itemLabel}>
                  {item.item.rawValue.label}
                </Primitive.ItemLabel>
                <Primitive.ItemDescription class={s.itemDescription}>
                  {description()}
                </Primitive.ItemDescription>
              </span>
            )}
          </Show>
          <Primitive.ItemIndicator>
            <IconCheck class={s.indicator} />
          </Primitive.ItemIndicator>
        </Primitive.Item>
      )}
    >
      <Primitive.Trigger
        ref={setTrigger}
        id={field?.id}
        aria-label={props["aria-label"]}
        aria-labelledby={field?.labelId}
        aria-describedby={field?.describedBy()}
        aria-invalid={field?.invalid() ? true : undefined}
        class={classes(s.trigger, props.class)}
      >
        <Primitive.Value<SelectOption> class={s.value}>
          {(state) => state.selectedOption().label}
        </Primitive.Value>
        <Primitive.Icon class={s.icon}>
          <IconChevronDown class={s.chevron} weight={1.5} />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal mount={overlayMount(trigger())}>
        <Primitive.Content class={s.content}>
          <Primitive.Listbox class={s.listbox} />
          <Show when={props.action}>
            {(action) => (
              <button
                type="button"
                class={s.action}
                onClick={() => {
                  setOpen(false);
                  action().onSelect();
                }}
              >
                {action().label}
              </button>
            )}
          </Show>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
