import { For, Show, createEffect, createMemo, createSignal, createUniqueId, on } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconMarkClose, IconMarkSearch } from "@amends-dev/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { IconButton } from "../../components/icon-button/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import type { IconComponent } from "../../internal/props.ts";
import { Modal } from "../../patterns/modal/index.ts";
import * as s from "./jump-to.css.ts";

/** Somewhere the reader can go, such as a group, a person, or a page. */
export interface JumpToItem {
  readonly id: string;
  /** Its name, which what is typed is matched against. */
  readonly label: string;
  /** The section it lists under, such as "Groups"; sections keep the order they first appear in. */
  readonly section: string;
  /** A quiet note after the name, such as "Direct message". */
  readonly detail?: string;
  readonly icon?: IconComponent;
  /** A person or agent, shown by their avatar in place of an icon. */
  readonly person?: {
    readonly name: string;
    readonly initials?: string;
    readonly tone?: AvatarToneName;
  };
}

export interface JumpToProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly JumpToItem[];
  /** Goes to an item; the caller closes the dialog. */
  readonly onOpen: (id: string) => void;
  /** Some of the items are still loading. */
  readonly loading?: boolean;
}

/** How many of a section's items show before typing, and while typing. */
const shown = { browsing: 5, searching: 8 } as const;

/** Case and accents aside, and a leading "#" or "@" as people write names. */
const normalize = (text: string) =>
  text.normalize("NFKD").replaceAll(/\p{M}/gu, "").toLocaleLowerCase().trim();

/** How well a name matches what is typed: its start, a word's start, anywhere, or not at all. */
function score(label: string, query: string) {
  if (query === "") return 1;
  const name = normalize(label);
  if (name.startsWith(query)) return 3;
  if (name.split(/[\s\-_·./]+/u).some((word) => word.startsWith(query))) return 2;
  return name.includes(query) ? 1 : 0;
}

interface Section {
  readonly name: string;
  readonly items: readonly JumpToItem[];
}

/** The items matching what is typed, best first within each section. */
function sectionsOf(items: readonly JumpToItem[], typed: string): readonly Section[] {
  const query = normalize(typed).replace(/^[#@]/u, "");
  const limit = query === "" ? shown.browsing : shown.searching;
  const sections = new Map<string, Array<{ item: JumpToItem; score: number }>>();
  for (const item of items) {
    const matched = score(item.label, query);
    if (!sections.has(item.section)) sections.set(item.section, []);
    if (matched > 0) sections.get(item.section)!.push({ item, score: matched });
  }
  return [...sections]
    .map(([name, found]) => ({
      name,
      items: found
        .toSorted((left, right) => right.score - left.score)
        .slice(0, limit)
        .map((entry) => entry.item),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Jumps anywhere in the workspace: typing narrows its items by name across sections, arrows move,
 * Enter goes, and Escape closes. It opens as a search dialog near the top of the screen.
 */
export function JumpTo(props: JumpToProps) {
  return (
    <Modal.Root open={props.open} onClose={props.onClose} aria-label="Jump to" size="palette">
      <Search
        items={props.items}
        loading={props.loading}
        onOpen={props.onOpen}
        onClose={props.onClose}
      />
    </Modal.Root>
  );
}

function Search(props: Pick<JumpToProps, "items" | "loading" | "onOpen" | "onClose">) {
  const id = createUniqueId();
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  const [field, setField] = createSignal<HTMLInputElement>();
  const sections = createMemo(() => sectionsOf(props.items, query()));
  const results = createMemo(() => sections().flatMap((section) => section.items));
  const optionId = (index: number) => `${id}-option-${index}`;
  createEffect(on(query, () => setActive(0), { defer: true }));
  createEffect(() => {
    const index = active();
    if (results().length > 0)
      document.getElementById(optionId(index))?.scrollIntoView?.({ block: "nearest" });
  });
  // The dialog opens with the field ready to type in.
  createEffect(() => field()?.focus());
  const go = (item: JumpToItem | undefined) => {
    if (item) props.onOpen(item.id);
  };
  return (
    <div class={s.jump}>
      <div class={s.search}>
        <IconMarkSearch class={s.searchIcon} />
        <input
          ref={setField}
          class={s.input}
          type="text"
          role="combobox"
          aria-label="Jump to"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={`${id}-results`}
          aria-activedescendant={results().length > 0 ? optionId(active()) : undefined}
          placeholder="Jump to a group, person, or page…"
          autocomplete="off"
          spellcheck={false}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.isComposing) return;
            const count = results().length;
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && count > 0) {
              event.preventDefault();
              setActive((active() + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
            } else if (event.key === "Enter") {
              event.preventDefault();
              go(results()[active()]);
            }
          }}
        />
        <IconButton
          icon={IconMarkClose}
          label="Close"
          size="compact"
          class={s.close}
          onClick={() => props.onClose()}
        />
      </div>
      <div class={s.results} id={`${id}-results`} role="listbox" aria-label="Places">
        <Show
          when={results().length > 0}
          fallback={
            <p class={s.empty}>
              {props.loading && query() === ""
                ? "Loading…"
                : `Nothing matches “${query().trim()}”.`}
            </p>
          }
        >
          <For each={sections()}>
            {(section, sectionIndex) => (
              <div role="group" aria-labelledby={`${id}-section-${sectionIndex()}`}>
                <p class={s.sectionTitle} id={`${id}-section-${sectionIndex()}`}>
                  {section.name}
                </p>
                <For each={section.items}>
                  {(item) => {
                    const index = () => results().indexOf(item);
                    return (
                      <div
                        id={optionId(index())}
                        role="option"
                        aria-selected={active() === index()}
                        class={s.item}
                        // Keep typing in the field while choosing with the pointer.
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setActive(index())}
                        onClick={() => go(item)}
                      >
                        <Show
                          when={item.person}
                          fallback={
                            <Show when={item.icon}>
                              {(icon) => <Dynamic component={icon()} class={s.itemIcon} />}
                            </Show>
                          }
                        >
                          {(person) => (
                            <Avatar
                              name={person().name}
                              initials={person().initials}
                              tone={person().tone}
                              size={22}
                              decorative
                            />
                          )}
                        </Show>
                        <span class={s.itemLabel}>{item.label}</span>
                        <Show when={item.detail}>
                          <span class={s.itemDetail}>{item.detail}</span>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
      <p class={s.hints} aria-hidden="true">
        <span>
          <kbd class={s.key}>↑</kbd>
          <kbd class={s.key}>↓</kbd> to move
        </span>
        <span>
          <kbd class={s.key}>↵</kbd> to open
        </span>
        <span>
          <kbd class={s.key}>esc</kbd> to close
        </span>
      </p>
    </div>
  );
}
