import { For, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import * as icons from "@amends/icons";
import { iconCatalog } from "@amends/icons/catalog";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import { Input } from "@amends/frontend/primitives/input";
import { Button } from "@amends/frontend/primitives/button";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { Row, Column } from "@amends/frontend/primitives/layout";
import "@amends/frontend/foundations/typography/fonts";

const meta = {
  title: "Foundations/Icons",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function GallerySpecimen() {
  const [query, setQuery] = createSignal("");
  const filtered = createMemo(() => {
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
    <main>
      <Column class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
        <Text as="h1" variant="heading">
          Icons
        </Text>
        <Text>
          Shared Solid icons drawn on a 24-unit grid. Search by shape, meaning, or category.
        </Text>
        <label for="icon-search">
          <Text as="span">Find an icon</Text>
        </label>
        <Input
          id="icon-search"
          type="search"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <Text role="status">
          {filtered().length} {filtered().length === 1 ? "icon" : "icons"}
        </Text>
      </Column>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Column class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="heading">
              {theme === "cotton" ? "Cotton" : "Soot"}
            </Text>
            <div
              style={{
                display: "grid",
                "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))",
                gap: "1rem",
              }}
            >
              <For each={filtered()}>
                {(icon) => (
                  <Column
                    gap={2}
                    style={{ padding: "1rem", border: `1px solid ${colorVars.line.seam}` }}
                  >
                    <Dynamic component={icons[icon.exportName]} />
                    <Text>{icon.name}</Text>
                    <Text as="code" variant="mono" style={{ "overflow-wrap": "anywhere" }}>
                      {icon.exportName}
                    </Text>
                  </Column>
                )}
              </For>
            </div>
          </Column>
        )}
      </For>
    </main>
  );
}

export const Gallery = {
  render: () => <GallerySpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: "Find an icon" });
    await userEvent.type(search, "magnifier");
    await expect(canvas.getByRole("status")).toHaveTextContent("1 icon");
    await expect(canvas.getAllByText("IconSearch")).toHaveLength(2);
    await userEvent.clear(search);
    await expect(canvas.getByRole("status")).toHaveTextContent(`${iconCatalog.length} icons`);
  },
} satisfies Story;

function MatrixSpecimen(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement;
    const value = root.style.getPropertyValue("font-size");
    const priority = root.style.getPropertyPriority("font-size");
    root.style.setProperty("font-size", "24px");
    onCleanup(() =>
      value
        ? root.style.setProperty("font-size", value, priority)
        : root.style.removeProperty("font-size"),
    );
  });
  const specimens = iconCatalog.filter((icon) =>
    ["check", "circle-check", "search", "settings", "sidebar-left-open"].includes(icon.name),
  );
  return (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Column class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="heading">
              {theme} · sizes and weights
            </Text>
            <Text>Named sizes scale with root text. The last sample stays at 32 pixels.</Text>
            <For each={specimens}>
              {(icon) => (
                <Column
                  style={{ padding: "1rem 0", "border-bottom": `1px solid ${colorVars.line.seam}` }}
                >
                  <Text>{icon.name}</Text>
                  <For each={icons.iconWeights}>
                    {(weight) => (
                      <Row gap={4}>
                        <Text as="span">{weight}</Text>
                        <For each={["xs", "sm", "md", "lg", 32] as const}>
                          {(size) => (
                            <Column gap={1} style={{ "align-items": "center" }}>
                              <Dynamic
                                component={icons[icon.exportName]}
                                size={size}
                                weight={weight}
                                data-icon-size={size}
                              />
                              <Text as="span">{size}</Text>
                            </Column>
                          )}
                        </For>
                      </Row>
                    )}
                  </For>
                </Column>
              )}
            </For>
            <Row>
              <IconButton aria-label="Search workspace">
                <icons.IconSearch />
              </IconButton>
              <IconButton aria-label="Delete draft" tone="danger">
                <icons.IconTrash />
              </IconButton>
              <IconButton aria-label="Unavailable action" disabled>
                <icons.IconPlus />
              </IconButton>
              <Text as="span">
                <icons.IconCheck size="sm" /> Saved
              </Text>
            </Row>
            <div dir="rtl">
              <Row>
                <icons.IconSidebarLeftOpen style={{ transform: "scaleX(-1)" }} />
                <Text>Directional glyph mirrored by its consumer</Text>
              </Row>
            </div>
          </Column>
        )}
      </For>
    </main>
  );
}
export const Matrix = { render: () => <MatrixSpecimen /> } satisfies Story;
export const EnlargedText = { render: () => <MatrixSpecimen enlarged /> } satisfies Story;

function ReactiveSpecimen() {
  const [named, setNamed] = createSignal(false);
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Column>
        <Text as="h1" variant="heading">
          Accessible icon names
        </Text>
        <Text>
          A glyph beside text is decorative. Give a standalone status a label; name an icon-only
          action on its button.
        </Text>
        <Button onClick={() => setNamed((value) => !value)}>Toggle icon label</Button>
        <icons.IconCircleCheck
          label={named() ? "Completed" : undefined}
          size={named() ? "lg" : "md"}
          weight={named() ? 1.75 : 2}
          data-testid="reactive-icon"
        />
        <Text>{named() ? "Named status" : "Decorative glyph"}</Text>
      </Column>
    </main>
  );
}
export const ReactiveProps = {
  render: () => <ReactiveSpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const svg = canvas.getByTestId("reactive-icon");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle icon label" }));
    await expect(canvas.getByRole("img", { name: "Completed" })).toBe(svg);
    await expect(svg).toHaveAttribute("width", "1.5rem");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle icon label" }));
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    await expect(canvas.queryByRole("img")).toBeNull();
  },
} satisfies Story;
