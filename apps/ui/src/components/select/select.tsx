import * as Primitive from "@kobalte/core/select";
import { createSignal } from "solid-js";
import { IconCheck, IconChevronDown } from "@amends/icons";
import { useField } from "../field/index.ts";
import { classes } from "../../internal/props.ts";
import { overlayMount } from "../../internal/overlay.ts";
import * as s from "./select.css.ts";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
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
};

/**
 * One choice from a short list, shaped like an Input: the choice and a chevron, opening a list as
 * wide as the field. Inside a Field it takes the label, help, and error associations.
 */
export function Select(props: SelectProps) {
  const field = useField();
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const chosen = () => props.options.find((option) => option.value === props.value) ?? null;
  return (
    <Primitive.Root<SelectOption>
      options={[...props.options]}
      optionValue="value"
      optionTextValue="label"
      value={chosen()}
      onChange={(option) => {
        if (option) props.onChange(option.value);
      }}
      placeholder={props.placeholder}
      disabled={props.disabled}
      sameWidth
      gutter={4}
      placement="bottom-start"
      itemComponent={(item) => (
        <Primitive.Item item={item.item} class={s.item}>
          <Primitive.ItemLabel class={s.itemLabel}>{item.item.rawValue.label}</Primitive.ItemLabel>
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
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
