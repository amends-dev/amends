import { For, createSignal, createUniqueId, onMount, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  Container,
  Row,
  Column,
  Grid,
  GridItem,
  type GridColumns,
  type LayoutLength,
} from "@amends/frontend/primitives/layout";
import { Field } from "@amends/frontend/compositions/field";
import { Input } from "@amends/frontend/primitives/input";
import { Button } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { type SpaceStep } from "@amends/frontend/foundations/spacing";
import { type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { Themes, Cell, Frame } from "./layout.stories-support.tsx";
import * as s from "./layout.stories.css.ts";

function ContactFields(props: { readOnly?: boolean }) {
  return (
    <>
      <Field label="Given name">
        {(control) => <Input name="given" value="Ada" readOnly={props.readOnly} {...control} />}
      </Field>
      <Field label="Family name">
        {(control) => (
          <Input name="family" value="Lovelace" readOnly={props.readOnly} {...control} />
        )}
      </Field>
      <Field label="Email address" description="Use an address for this workspace.">
        {(control) => (
          <Input
            type="email"
            name="email"
            value="ada@example.com"
            readOnly={props.readOnly}
            {...control}
          />
        )}
      </Field>
    </>
  );
}
function ComparisonSpecimen() {
  return (
    <Themes title="Grid">
      {() => (
        <>
          <Text tone="secondary">
            The same three fields at different container widths. The grid fits up to three columns,
            each ideally at least 14rem wide.
          </Text>
          <For
            each={[
              { label: "Wide", width: "58rem" },
              { label: "Medium", width: "36rem" },
              { label: "Compact", width: "18rem" },
            ]}
          >
            {(example) => (
              <Column gap={2}>
                <Text variant="mono">{example.label} container</Text>
                <div style={{ width: example.width, "max-width": "100%" }}>
                  <Grid gap={4} minColumnWidth="14rem" maxColumns={3} data-grid-measure>
                    <ContactFields readOnly />
                  </Grid>
                </div>
              </Column>
            )}
          </For>
        </>
      )}
    </Themes>
  );
}
export function ResponsiveFormFixture(props: {
  theme: ColorTheme;
  enlarged?: boolean;
  rtl?: boolean;
}) {
  const widthId = createUniqueId();
  const [width, setWidth] = createSignal(1000),
    [result, setResult] = createSignal("Nothing submitted yet.");
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style,
      before = root.getPropertyValue("font-size"),
      priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (before) root.setProperty("font-size", before, priority);
      else root.removeProperty("font-size");
    });
  });
  return (
    <main class={`${colorThemes[props.theme]} ${s.frame}`} dir={props.rtl ? "rtl" : undefined}>
      <Container>
        <Column gap={6}>
          <Column gap={2}>
            <Text as="h1" variant="heading">
              A form that fits its space
            </Text>
            <Text tone="secondary">
              Resize this container or the preview window. The fields keep their values and reading
              order as the columns change.
            </Text>
          </Column>
          <Column gap={2}>
            <Row gap={2}>
              <Button variant="secondary" onClick={() => setWidth(320)}>
                Compact
              </Button>
              <Button variant="secondary" onClick={() => setWidth(640)}>
                Medium
              </Button>
              <Button variant="secondary" onClick={() => setWidth(1000)}>
                Wide
              </Button>
            </Row>
            <Row gap={3}>
              <label for={widthId}>
                <Text as="span">Preview width</Text>
              </label>
              <input
                id={widthId}
                class={s.range}
                type="range"
                min="240"
                max="1120"
                step="20"
                value={width()}
                onInput={(event) => setWidth(Number(event.currentTarget.value))}
              />
              <Text as="span" variant="mono">
                {width()}px maximum
              </Text>
            </Row>
          </Column>
          <div class={s.preview} style={{ width: `${width()}px` }} data-resize-preview>
            <Container maxWidth="none" gutter={4}>
              <Column
                as="form"
                aria-label="Example contact form"
                gap={6}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const given = data.get("given"),
                    family = data.get("family"),
                    email = data.get("email");
                  if (
                    typeof given === "string" &&
                    typeof family === "string" &&
                    typeof email === "string"
                  )
                    setResult(`${given} ${family} · ${email}`);
                }}
              >
                <Grid minColumnWidth="14rem" maxColumns={3} gap={4} data-form-grid>
                  <ContactFields />
                  <GridItem span="full" data-full-row>
                    <Field label="Note" description="This item spans the full grid at every width.">
                      {(control) => (
                        <Input name="note" placeholder="Optional context" {...control} />
                      )}
                    </Field>
                  </GridItem>
                </Grid>
                <Row gap={3}>
                  <Button type="submit">Preview values</Button>
                  <Text role="status">{result()}</Text>
                </Row>
              </Column>
            </Container>
          </div>
        </Column>
      </Container>
    </main>
  );
}
function Nested() {
  return (
    <Themes title="Nested layouts">
      {() => (
        <Grid maxColumns={2} minColumnWidth="24rem" gap={6}>
          <Column class={s.cell} gap={4}>
            <Row justify="between">
              <Text as="h3">A narrower panel</Text>
              <Text tone="secondary">4 items</Text>
            </Row>
            <Grid minColumnWidth="12rem" maxColumns={3} gap={3} data-nested-grid>
              <Cell>One</Cell>
              <Cell>Two</Cell>
              <Cell>Three</Cell>
              <Cell>Four</Cell>
            </Grid>
          </Column>
          <Column class={s.cell} gap={3}>
            <Text as="h3">An independent column</Text>
            <Text>Its spacing and alignment are independent of the grid next to it.</Text>
            <Row gap={2}>
              <Button>Continue</Button>
              <Button variant="secondary">Cancel</Button>
            </Row>
          </Column>
          <GridItem span="full">
            <Text tone="secondary">
              This full-width item stays after both panels in document and keyboard order.
            </Text>
          </GridItem>
        </Grid>
      )}
    </Themes>
  );
}
function FullRow() {
  return (
    <Themes title="Grid item · full row">
      {() => (
        <Grid minColumnWidth="14rem" maxColumns={3} gap={4} data-full-grid>
          <Cell>One column</Cell>
          <Cell>One column</Cell>
          <Cell>One column</Cell>
          <GridItem span="full" data-full-row>
            <Cell>
              Full row: a longer description, validation summary, or another nested layout.
            </Cell>
          </GridItem>
          <Cell>Next row</Cell>
        </Grid>
      )}
    </Themes>
  );
}
type Args = {
  theme: ColorTheme;
  gap: SpaceStep;
  minColumnWidth: LayoutLength;
  maxColumns: GridColumns;
};
const meta = {
  title: "Primitives/Layout/Grid",
  render: (props: Args) => (
    <main>
      <Frame theme={props.theme} title="Grid playground">
        <Grid gap={props.gap} minColumnWidth={props.minColumnWidth} maxColumns={props.maxColumns}>
          <For each={[1, 2, 3, 4, 5, 6]}>{(number) => <Cell>Item {number}</Cell>}</For>
        </Grid>
      </Frame>
    </main>
  ),
  args: { theme: "cotton", gap: 4, minColumnWidth: "14rem", maxColumns: 3 },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    gap: { control: "select", options: [0, 1, 2, 3, 4, 5, 6] },
    minColumnWidth: { control: "select", options: ["12rem", "14rem", "18rem"] },
    maxColumns: { control: "select", options: [1, 2, 3, 4, 6] },
  },
  parameters: { layout: "fullscreen" as const },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const Comparison = {
  name: "Comparison",
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const grid of canvasElement.querySelectorAll<HTMLElement>("[data-grid-measure]")) {
      const bounds = grid.getBoundingClientRect(),
        gap = Number.parseFloat(getComputedStyle(grid).gap);
      const expected = Math.min(
        3,
        Math.max(1, Math.floor((bounds.width + gap + 0.1) / (14 * root + gap))),
      );
      const cells = [...grid.children].map((child) => child.getBoundingClientRect());
      await expect(cells.filter((cell) => Math.abs(cell.top - cells[0]!.top) < 1)).toHaveLength(
        expected,
      );
      for (const cell of cells) {
        await expect(cell.width).toBeCloseTo((bounds.width - gap * (expected - 1)) / expected, 1);
        await expect(cell.right).toBeLessThanOrEqual(bounds.right + 1);
      }
    }
  },
} satisfies Story;
export const ResponsiveForm = {
  render: (props) => <ResponsiveFormFixture theme={props.theme} />,
  parameters: { controls: { include: ["theme"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      given = canvas.getByRole("textbox", { name: "Given name" });
    await userEvent.clear(given);
    await userEvent.type(given, "Grace");
    for (const size of ["Compact", "Medium", "Wide"]) {
      await userEvent.click(canvas.getByRole("button", { name: size }));
      await expect(canvas.getByRole("textbox", { name: "Given name" })).toBe(given);
      await expect(given).toHaveValue("Grace");
    }
    await userEvent.click(canvas.getByRole("button", { name: "Preview values" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Grace Lovelace · ada@example.com");
  },
} satisfies Story;
export const FullWidthItem = {
  render: () => <FullRow />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    for (const grid of canvasElement.querySelectorAll<HTMLElement>("[data-full-grid]")) {
      const full = grid.querySelector<HTMLElement>("[data-full-row]")!;
      await expect(full.getBoundingClientRect().width).toBeCloseTo(
        grid.getBoundingClientRect().width,
        1,
      );
      await expect(grid.lastElementChild!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        full.getBoundingClientRect().bottom,
      );
    }
  },
} satisfies Story;
export const NestedLayouts = {
  render: () => <Nested />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: (props) => <ResponsiveFormFixture theme={props.theme} enlarged />,
  parameters: { controls: { include: ["theme"] } },
  tags: ["!autodocs"],
} satisfies Story;
export const RightToLeft = {
  render: (props) => <ResponsiveFormFixture theme={props.theme} rtl />,
  parameters: { controls: { include: ["theme"] } },
} satisfies Story;
