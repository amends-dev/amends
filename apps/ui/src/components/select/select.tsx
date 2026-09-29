import * as Primitive from "@kobalte/core/select";
import { Show, createMemo, createSignal } from "solid-js";
import { IconCheck, IconChevronDown } from "@amends/icons";
import { useField } from "../field/index.ts";
import { StatusMark, type StatusMarkKind } from "../status-mark/index.ts";
import { classes } from "../../internal/props.ts";
import { overlayMount } from "../../internal/overlay.ts";
import * as s from "./select.css.ts";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** A second line in the list, such as whether an account needs setup. */
  readonly description?: string;
  /** A third line, such as why it needs setup. */
  readonly detail?: string;
  /** A state at its end as a status mark, such as whether it works; the detail says why not. */
  readonly status?: { readonly mark: StatusMarkKind; readonly label: string };
  /** Shown, with its reasons, but not chosen. */
  readonly disabled?: boolean;
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
  /** Names the options above them, such as "Model connections". */
  heading?: string;
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
          option.description === next[index]?.description &&
          option.detail === next[index]?.detail &&
          option.status?.label === next[index]?.status?.label &&
          option.status?.mark === next[index]?.status?.mark &&
          option.disabled === next[index]?.disabled,
      ),
  });
  const chosen = () => options().find((option) => option.value === props.value) ?? null;
  return (
    <Primitive.Root<SelectOption>
      options={[...options()]}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
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
                  <Show when={item.item.rawValue.detail}>
                    {(detail) => <span class={s.itemDetail}>{detail()}</span>}
                  </Show>
                </Primitive.ItemDescription>
              </span>
            )}
          </Show>
          <Show when={item.item.rawValue.status}>
            {(status) => (
              <StatusMark mark={status().mark} label={status().label} size={9} class={s.status} />
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
          <Show when={props.heading}>
            {(heading) => (
              <p class={s.heading} aria-hidden="true">
                {heading()}
              </p>
            )}
          </Show>
          <Primitive.Listbox class={s.listbox} aria-label={props.heading} />
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
