import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  type JSX,
} from "solid-js";
import { IconCheck, IconChevronDown } from "@amends-dev/icons";
import { useField } from "../field/index.ts";
import * as s from "./combobox.css.ts";

export interface ComboboxSuggestion {
  /** What choosing it enters, such as a model ID. */
  readonly value: string;
  /** Its name, over the value. */
  readonly label: string;
}

export interface ComboboxProps {
  /** The text entered; any text is a value, and a suggestion enters its own. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly suggestions: ReadonlyArray<ComboboxSuggestion>;
  /** Names the suggestions above them, such as "Suggested models". */
  readonly heading?: string;
  /** Under the suggestions, such as how to enter another value. */
  readonly footer?: string;
  /** The option that keeps text matching no suggestion, as `Use “text”` by default. */
  readonly custom?: { readonly label: (text: string) => string; readonly description: string };
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** The accessible name outside a Field. */
  readonly "aria-label"?: string;
  /** Values are typed exactly, such as model IDs: the field and each suggestion's value are set in the monospace. */
  readonly monospace?: boolean;
}

type Entry =
  | { readonly kind: "suggestion"; readonly suggestion: ComboboxSuggestion }
  | {
      readonly kind: "custom";
      readonly text: string;
    };

/**
 * Free text with suggestions, shaped like a Select: typing narrows the suggestions, choosing one
 * enters its value, and text matching none can be kept as entered. Inside a Field it takes the
 * label, help, and error associations.
 */
export function Combobox(props: ComboboxProps): JSX.Element {
  const field = useField();
  const id = createUniqueId();
  const listId = `combobox-${id}-list`;
  const optionId = (index: number) => `combobox-${id}-option-${index}`;
  const [expanded, setExpanded] = createSignal(false);
  // Narrowing follows typing; opening the list shows every suggestion again.
  const [narrowing, setNarrowing] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [control, setControl] = createSignal<HTMLDivElement>();
  const [position, setPosition] = createSignal<JSX.CSSProperties>();
  const text = () => props.value.trim();
  const entries = createMemo((): ReadonlyArray<Entry> => {
    const typed = text().toLowerCase();
    const matching = props.suggestions.filter(
      (suggestion) =>
        !narrowing() ||
        typed === "" ||
        suggestion.value.toLowerCase().includes(typed) ||
        suggestion.label.toLowerCase().includes(typed),
    );
    const known = props.suggestions.some((suggestion) => suggestion.value === text());
    return [
      ...(text() !== "" && !known ? [{ kind: "custom", text: text() } as const] : []),
      ...matching.map((suggestion) => ({ kind: "suggestion", suggestion }) as const),
    ];
  });
  const activeIndex = () =>
    expanded() && entries().length > 0 ? Math.min(active(), entries().length - 1) : undefined;
  // Placed under the field, within the surrounding dialog, opening upward when more fits above.
  const place = () => {
    const box = control();
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const height = window.innerHeight;
    const frame = box.closest("dialog")?.getBoundingClientRect();
    const below = (frame?.bottom ?? height) - rect.bottom - 12;
    const above = rect.top - (frame?.top ?? 0) - 12;
    const up = below < 240 && above > below;
    setPosition({
      position: "fixed",
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      ...(up
        ? { top: "auto", bottom: `${height - rect.top + 4}px` }
        : { top: `${rect.bottom + 4}px`, bottom: "auto" }),
      "max-height": `${Math.max(160, Math.min(320, up ? above : below))}px`,
    });
  };
  createEffect(() => {
    if (!expanded()) return;
    const update = () => place();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    onCleanup(() => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    });
  });
  const open = (narrow: boolean) => {
    if (props.disabled) return;
    if (!expanded()) place();
    setNarrowing(narrow);
    setExpanded(true);
  };
  const close = () => {
    setExpanded(false);
    setActive(0);
  };
  const choose = (entry: Entry) => {
    if (entry.kind === "suggestion") props.onChange(entry.suggestion.value);
    close();
    input()?.focus();
  };
  const move = (step: number) => {
    open(narrowing());
    const count = entries().length;
    if (count > 0) setActive((index) => (Math.min(index, count - 1) + step + count) % count);
  };
  return (
    <div
      class={s.combobox}
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <div
        ref={setControl}
        class={s.control}
        data-open={expanded() ? "" : undefined}
        data-invalid={field?.invalid() ? "" : undefined}
        data-disabled={props.disabled ? "" : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) input()?.focus();
        }}
      >
        <input
          ref={setInput}
          id={field?.id}
          class={s.input}
          data-mono={props.monospace ? "" : undefined}
          role="combobox"
          aria-label={props["aria-label"]}
          aria-labelledby={field?.labelId}
          aria-describedby={field?.describedBy()}
          aria-invalid={field?.invalid() ? true : undefined}
          aria-autocomplete="list"
          aria-expanded={expanded()}
          aria-controls={listId}
          aria-activedescendant={activeIndex() === undefined ? undefined : optionId(activeIndex()!)}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => {
            props.onChange(event.currentTarget.value);
            setActive(0);
            open(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter" && expanded()) {
              const index = activeIndex();
              const entry = index === undefined ? undefined : entries()[index];
              if (entry) {
                event.preventDefault();
                choose(entry);
              }
            } else if (event.key === "Escape" && expanded()) {
              // Close the list, not the dialog around it.
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        />
        <button
          type="button"
          class={s.toggle}
          tabIndex={-1}
          disabled={props.disabled}
          aria-label={expanded() ? "Hide suggestions" : "Show suggestions"}
          onClick={() => {
            if (expanded()) close();
            else open(false);
            input()?.focus();
          }}
        >
          <IconChevronDown class={s.toggleIcon} weight={1.5} />
        </button>
      </div>
      <Show when={expanded() && entries().length > 0}>
        <div class={s.popup} style={position()}>
          <Show when={props.heading && entries().some((entry) => entry.kind === "suggestion")}>
            <p class={s.heading} aria-hidden="true">
              {props.heading}
            </p>
          </Show>
          <ul
            id={listId}
            role="listbox"
            aria-label={props.heading ?? "Suggestions"}
            class={s.listbox}
          >
            <For each={entries()}>
              {(entry, index) => (
                <li
                  id={optionId(index())}
                  role="option"
                  aria-selected={
                    entry.kind === "suggestion" && entry.suggestion.value === text()
                      ? "true"
                      : "false"
                  }
                  class={s.option}
                  data-active={activeIndex() === index() ? "" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index())}
                  onClick={() => choose(entry)}
                >
                  <span class={s.optionText}>
                    <span class={s.optionLabel}>
                      {entry.kind === "suggestion"
                        ? entry.suggestion.label
                        : (props.custom?.label ?? ((typed: string) => `Use “${typed}”`))(
                            entry.text,
                          )}
                    </span>
                    <span
                      class={s.optionDescription}
                      data-mono={props.monospace && entry.kind === "suggestion" ? "" : undefined}
                    >
                      {entry.kind === "suggestion"
                        ? entry.suggestion.value
                        : (props.custom?.description ?? "Use this value as entered.")}
                    </span>
                  </span>
                  <Show when={entry.kind === "suggestion" && entry.suggestion.value === text()}>
                    <IconCheck class={s.indicator} />
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={props.footer && entries().some((entry) => entry.kind === "suggestion")}>
            <p class={s.footer}>{props.footer}</p>
          </Show>
        </div>
      </Show>
    </div>
  );
}
