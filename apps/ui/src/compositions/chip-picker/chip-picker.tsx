import { For, Show, splitProps, type JSX } from "solid-js";
import { Combobox } from "../../primitives/combobox/index.ts";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./chip-picker.css.ts";

export interface Option {
  readonly value: string;
  readonly label: string;
  /** Short secondary text in the list, such as whether this is a person or an agent. */
  readonly description?: string;
  /** The decorative initial in the option's and chip's ring. */
  readonly mark: string;
  /** Solid for people, dashed for agents, as the picker reference draws them. */
  readonly ring?: "solid" | "dashed";
}
export type RootProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  readonly options: ReadonlyArray<Option>;
  /** The chosen values, in the order they show as chips. */
  readonly value: ReadonlyArray<string>;
  readonly onChange: (value: ReadonlyArray<string>) => void;
  /** Chosen values that cannot be removed, each with a note such as "you". */
  readonly fixed?: Readonly<Record<string, string>>;
  /** Names the list of chips, such as "Members". */
  readonly chipsLabel: string;
  /** The input's attributes, such as a Field's control associations and a placeholder. */
  readonly input?: Omit<Combobox.InputProps, "onKeyDown">;
  /** What the list says when nothing matches the typed text. */
  readonly empty: string;
  readonly disabled?: boolean;
};
/**
 * Several choices as removable chips above a type-to-filter input. Choosing an option adds its
 * chip; each chip's button removes it, and Backspace in the empty input removes the last. Chosen
 * options leave the list. Fixed chips cannot be removed.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "options",
    "value",
    "onChange",
    "fixed",
    "chipsLabel",
    "input",
    "empty",
    "disabled",
    "class",
    "classList",
  ]);
  let list: HTMLUListElement | undefined, field: HTMLInputElement | undefined;
  const byValue = () => new Map(local.options.map((option) => [option.value, option]));
  const chosen = () =>
    local.value.flatMap((value) => {
      const option = byValue().get(value);
      return option ? [option] : [];
    });
  const available = () => local.options.filter((option) => !local.value.includes(option.value));
  const removable = (value: string) => local.fixed?.[value] === undefined;
  const remove = (value: string) => {
    // Focus moves to the next chip's button, else the previous one's, else the input.
    const buttons = [...(list?.querySelectorAll("button") ?? [])];
    const index = buttons.findIndex((button) => button.dataset.value === value);
    const next = buttons[index + 1] ?? buttons[index - 1] ?? field;
    local.onChange(local.value.filter((entry) => entry !== value));
    queueMicrotask(() => (next?.isConnected ? next : field)?.focus());
  };
  return (
    <div {...native} class={classes(s.root, local.class, local.classList)}>
      <Show when={chosen().length > 0}>
        <ul
          ref={(element) => {
            list = element;
          }}
          class={s.chips}
          aria-label={local.chipsLabel}
        >
          <For each={chosen()}>
            {(option) => (
              <li class={s.chip} data-removable={removable(option.value) ? "true" : undefined}>
                <span class={s.mark} aria-hidden="true" data-ring={option.ring ?? "solid"}>
                  {option.mark}
                </span>
                <span class={s.label}>{option.label}</span>
                <Show
                  when={removable(option.value)}
                  fallback={<span class={s.note}>{local.fixed?.[option.value]}</span>}
                >
                  <button
                    type="button"
                    class={s.remove}
                    data-value={option.value}
                    aria-label={`Remove ${option.label}`}
                    disabled={local.disabled}
                    onClick={() => remove(option.value)}
                  >
                    ✕
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Combobox.Root
        options={available()}
        value={null}
        onChange={(value) => {
          if (value !== null && !local.value.includes(value))
            local.onChange([...local.value, value]);
        }}
        clearOnSelect
        disabled={local.disabled}
        itemComponent={(entry) => (
          <Combobox.Item item={entry.item}>
            <Combobox.ItemMark ring={entry.item.rawValue.ring}>
              {entry.item.rawValue.mark}
            </Combobox.ItemMark>
            <Combobox.ItemLabel>{entry.item.rawValue.label}</Combobox.ItemLabel>
            <Show when={entry.item.rawValue.description}>
              <Combobox.ItemDescription>{entry.item.rawValue.description}</Combobox.ItemDescription>
            </Show>
          </Combobox.Item>
        )}
      >
        <Combobox.Control>
          <Combobox.Input
            {...local.input}
            ref={(element: HTMLInputElement) => {
              field = element;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Backspace" || event.currentTarget.value !== "") return;
              const last = [...local.value].reverse().find(removable);
              if (last !== undefined) local.onChange(local.value.filter((entry) => entry !== last));
            }}
          />
        </Combobox.Control>
        <Combobox.Content>
          <Combobox.Listbox />
          <Combobox.Empty>{local.empty}</Combobox.Empty>
        </Combobox.Content>
      </Combobox.Root>
    </div>
  );
}
