import { For, createMemo, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import * as icons from "@amends-dev/icons";
import { iconCatalog } from "@amends-dev/icons/catalog";
import { Button } from "../../components/button/index.ts";
import { SearchField } from "../../components/input/index.ts";
import * as s from "../foundations.stories.css.ts";

const meta = { title: "Foundations/Icons" } satisfies Meta;
export default meta;
type Story = StoryObj;

function GallerySpecimen() {
  const [query, setQuery] = createSignal("");
  const shown = createMemo(() => {
    const terms = query().trim().toLowerCase().split(/\s+/);
    return iconCatalog.filter((icon) =>
      terms.every((term) =>
        [icon.name, icon.title, ...icon.keywords, ...icon.categories]
          .join(" ")
          .toLowerCase()
          .includes(term),
      ),
    );
  });
  return (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Icons</h2>
        <p class={s.note}>
          Every drawing on the shared 24-unit grid, from <code>@amends-dev/icons</code>. Marks
          follow the Lunacy mocks; search by shape, meaning, or category.
        </p>
        <SearchField
          placeholder="Find an icon"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <p class={s.note} role="status">
          {shown().length} {shown().length === 1 ? "icon" : "icons"}
        </p>
        <ul class={s.iconGrid} aria-label="Icons">
          <For each={shown()}>
            {(icon) => (
              <li class={s.iconTile}>
                <Dynamic component={icons[icon.exportName]} />
                <span class={s.name}>{icon.name}</span>
                <code class={s.iconCode}>{icon.exportName}</code>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}

/** Every icon, searchable; review new drawings here in both modes. */
export const Gallery = {
  render: () => <GallerySpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: "Find an icon" });
    await userEvent.type(search, "mark search");
    await expect(canvas.getByRole("status")).toHaveTextContent("1 icon");
    await expect(canvas.getByText("IconMarkSearch")).toBeVisible();
    await userEvent.clear(search);
    await expect(canvas.getByRole("status")).toHaveTextContent(`${iconCatalog.length} icons`);
  },
} satisfies Story;

const samples = ["mark-done", "mark-new", "mark-search", "mark-settings", "mark-forward"];

/** Named sizes scale with root text; numbers are pixels. Each weight at every size. */
export const Sizes = {
  render: () => (
    <div class={s.page}>
      <For each={iconCatalog.filter((icon) => samples.includes(icon.name))}>
        {(icon) => (
          <section class={s.section}>
            <h2 class={s.heading}>{icon.name}</h2>
            <For each={icons.iconWeights}>
              {(weight) => (
                <div class={s.iconRow}>
                  <span class={s.value}>{weight}</span>
                  <For each={["xs", "sm", "md", "lg", 32] as const}>
                    {(size) => (
                      <span class={s.iconSample}>
                        <Dynamic component={icons[icon.exportName]} size={size} weight={weight} />
                        {size}
                      </span>
                    )}
                  </For>
                </div>
              )}
            </For>
          </section>
        )}
      </For>
    </div>
  ),
} satisfies Story;

function AccessibleNamesSpecimen() {
  const [named, setNamed] = createSignal(false);
  return (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Accessible names</h2>
        <p class={s.note}>
          An icon beside text is decorative. Give a standalone status a label, and name an icon-only
          action on its button.
        </p>
        <Button onClick={() => setNamed(!named())}>Toggle icon label</Button>
        <div class={s.iconRow}>
          <icons.IconCircleCheck
            label={named() ? "Completed" : undefined}
            size={named() ? "lg" : "md"}
            weight={named() ? 1.75 : 2}
            data-testid="reactive-icon"
          />
          <span>{named() ? "Named status" : "Decorative glyph"}</span>
        </div>
      </section>
    </div>
  );
}

/** Label, size, and weight update in place. */
export const AccessibleNames = {
  render: () => <AccessibleNamesSpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const svg = canvas.getByTestId("reactive-icon");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle icon label" }));
    await expect(canvas.getByRole("img", { name: "Completed" })).toBe(svg);
    await expect(svg).toHaveAttribute("width", "1.5rem");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle icon label" }));
    await expect(svg).toHaveAttribute("aria-hidden", "true");
  },
} satisfies Story;
