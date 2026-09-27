import { For, Show, createMemo, createSignal, createUniqueId, type JSX } from "solid-js";
import { IconChevronDown, IconMarkClose, IconMarkNew, IconMarkSearch } from "@amends/icons";
import { Avatar } from "../avatar/index.ts";
import { useField } from "../field/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import * as s from "./member-picker.css.ts";

export interface PickerPerson {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
  readonly kind: "Person" | "Agent";
}

export interface MemberPickerProps {
  /** Workspace members who can be added. */
  readonly candidates: readonly PickerPerson[];
  /** Ids of the people chosen so far, shown as chips. */
  readonly selected: readonly string[];
  readonly onSelectedChange: (ids: string[]) => void;
  /** A dropdown under the field on wider layouts, or a list that is always shown on phones. */
  readonly presentation?: "dropdown" | "list";
  /** Default "Search workspace members…". */
  readonly placeholder?: string;
}

/**
 * Chooses several workspace members by name. Chosen people become removable chips and leave the
 * list; Backspace in an empty field removes the last one. Place it in a Field for its label.
 */
export function MemberPicker(props: MemberPickerProps): JSX.Element {
  const field = useField();
  const id = createUniqueId();
  const listId = `picker-${id}-list`;
  const optionId = (person: PickerPerson) => `picker-${id}-${person.id}`;
  const presentation = () => props.presentation ?? "dropdown";
  const [query, setQuery] = createSignal("");
  const [expanded, setExpanded] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [input, setInput] = createSignal<HTMLInputElement>();
  const chosen = createMemo(() =>
    props.selected
      .map((selectedId) => props.candidates.find((person) => person.id === selectedId))
      .filter((person): person is PickerPerson => person !== undefined),
  );
  const options = createMemo(() => {
    const text = query().trim().toLowerCase();
    return props.candidates.filter(
      (person) => !props.selected.includes(person.id) && person.name.toLowerCase().includes(text),
    );
  });
  const open = () => presentation() === "list" || expanded();
  // Highlight only while the field has focus, so a resting list shows no choice in progress.
  const activeOption = () =>
    expanded() ? options()[Math.min(active(), options().length - 1)] : undefined;
  const add = (person: PickerPerson) => {
    props.onSelectedChange([...props.selected, person.id]);
    setQuery("");
    setActive(0);
    input()?.focus();
  };
  const remove = (person: PickerPerson) => {
    props.onSelectedChange(props.selected.filter((selectedId) => selectedId !== person.id));
    input()?.focus();
  };
  const move = (step: number) => {
    setExpanded(true);
    const count = options().length;
    if (count > 0) setActive((index) => (Math.min(index, count - 1) + step + count) % count);
  };
  return (
    <div
      class={s.picker}
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <div
        class={s.control}
        data-open={expanded() ? "" : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) input()?.focus();
        }}
      >
        <Show when={chosen().length === 0}>
          <IconMarkSearch class={s.searchIcon} />
        </Show>
        <For each={chosen()}>
          {(person) => (
            <span class={s.chip}>
              <Avatar
                name={person.name}
                initials={person.initials}
                tone={person.tone}
                size={22}
                decorative
              />
              {person.name}
              <button
                type="button"
                class={s.chipRemove}
                aria-label={`Remove ${person.name}`}
                onClick={() => remove(person)}
              >
                <IconMarkClose class={s.chipRemoveIcon} />
              </button>
            </span>
          )}
        </For>
        <input
          ref={setInput}
          id={field?.id}
          aria-describedby={field?.describedBy()}
          class={s.input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open()}
          aria-controls={listId}
          aria-activedescendant={activeOption() ? optionId(activeOption()!) : undefined}
          placeholder={
            chosen().length > 0 ? "Add more…" : (props.placeholder ?? "Search workspace members…")
          }
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
            setExpanded(true);
          }}
          onFocus={() => setExpanded(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter") {
              const person = activeOption();
              if (person) {
                event.preventDefault();
                add(person);
              }
            } else if (event.key === "Escape" && expanded()) {
              // Close the list, not the dialog around it.
              event.preventDefault();
              event.stopPropagation();
              setExpanded(false);
            } else if (event.key === "Backspace" && query() === "") {
              const last = chosen().at(-1);
              if (last) remove(last);
            }
          }}
        />
        <Show when={presentation() === "dropdown"}>
          <button
            type="button"
            class={s.toggle}
            tabIndex={-1}
            aria-label={expanded() ? "Hide members" : "Show members"}
            onClick={() => {
              setExpanded(!expanded());
              input()?.focus();
            }}
          >
            <IconChevronDown class={s.toggleIcon} />
          </button>
        </Show>
      </div>
      <Show when={open()}>
        <div class={s.popup} data-presentation={presentation()}>
          <div class={s.popupHeader}>
            <span>Workspace members</span>
            <span class={s.available}>{options().length} available</span>
          </div>
          <ul id={listId} role="listbox" aria-label="Workspace members" class={s.listbox}>
            <For each={options()}>
              {(person, index) => (
                <li
                  id={optionId(person)}
                  role="option"
                  aria-selected="false"
                  class={s.option}
                  data-active={activeOption()?.id === person.id ? "" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index())}
                  onClick={() => add(person)}
                >
                  <Avatar
                    name={person.name}
                    initials={person.initials}
                    tone={person.tone}
                    size={28}
                    decorative
                  />
                  <span class={s.optionText}>
                    <span class={s.optionName}>{person.name}</span>
                    <span class={s.optionKind}>{person.kind}</span>
                  </span>
                  <IconMarkNew class={s.plus} />
                </li>
              )}
            </For>
          </ul>
          <p class={s.popupFooter}>
            {options().length > 0
              ? "Select one or more members."
              : query()
                ? "No workspace members match."
                : "Everyone in the workspace is here."}
          </p>
        </div>
      </Show>
    </div>
  );
}
