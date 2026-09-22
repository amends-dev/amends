import { For, createSignal, onMount, onCleanup, type ParentProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Divider } from "@amends/frontend/primitives/divider";
import { Button } from "@amends/frontend/primitives/button";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { IconMarkNew } from "@amends/icons";
import { Text } from "@amends/frontend/primitives/text";
import { Column } from "@amends/frontend/primitives/layout";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";

function Specimen(props: { theme: ColorTheme }) {
  const [created, setCreated] = createSignal(0);
  return (
    <section
      class={colorThemes[props.theme]}
      aria-label={`${props.theme} dividers`}
      style={{ padding: "1.5rem", "min-width": 0 }}
    >
      <Column gap={6}>
        <Text as="h2" variant="heading">
          {props.theme === "cotton" ? "Cotton" : "Soot"}
        </Text>
        <Column gap={3}>
          <Text as="p" tone="secondary">
            Plain separation
          </Text>
          <Divider.Line data-testid="plain-line" />
        </Column>
        <Divider.Root data-testid="start-label">
          <Divider.Label as="h3">Channels</Divider.Label>
          <Divider.Line />
        </Divider.Root>
        <Divider.Root data-testid="center-label">
          <Divider.Line />
          <Divider.Label>Today</Divider.Label>
          <Divider.Line />
        </Divider.Root>
        <Divider.Root>
          <Divider.Line />
          <Divider.Label>End of results</Divider.Label>
        </Divider.Root>
        <Divider.Root>
          <Divider.Label as="h3">Groups</Divider.Label>
          <Divider.Line />
          <IconButton
            variant="ghost"
            aria-label="Create group"
            onClick={() => setCreated((n) => n + 1)}
          >
            <IconMarkNew />
          </IconButton>
        </Divider.Root>
        <Divider.Root>
          <Divider.Label as="h3">Members</Divider.Label>
          <Divider.Line />
          <Button variant="ghost" onClick={() => setCreated((n) => n + 1)}>
            Invite member
          </Button>
        </Divider.Root>
        <div style={{ padding: "1rem", "background-color": colorVars.surface.panel }}>
          <Column gap={4}>
            <Text as="p">Inside a panel</Text>
            <Divider.Root>
              <Divider.Label>Recent activity</Divider.Label>
              <Divider.Line />
            </Divider.Root>
          </Column>
        </div>
        <Text as="p" role="status">
          Actions: {created()}
        </Text>
      </Column>
    </section>
  );
}
const meta = {
  title: "Primitives/Divider",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" as const },
  args: { theme: "cotton" as ColorTheme },
  argTypes: { theme: { control: "select", options: ["cotton", "soot"] } },
  render: (args) => (
    <main>
      <Specimen {...args} />
    </main>
  ),
} satisfies Meta<typeof Specimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const Comparison = {
  render: () => (
    <main
      style={{
        display: "grid",
        "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
      }}
    >
      <For each={["cotton", "soot"] as const}>{(theme) => <Specimen theme={theme} />}</For>
    </main>
  ),
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Groups" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Create group" }));
    await userEvent.click(canvas.getByRole("button", { name: "Invite member" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Actions: 2");
    await expect(canvas.queryByRole("separator")).toBeNull();
  },
} satisfies Story;
function LongSpecimen() {
  return (
    <Column gap={6} style={{ width: "20rem", "max-width": "100%", "min-width": 0 }}>
      <Divider.Root>
        <Divider.Label as="h2">Participants from across the whole workspace</Divider.Label>
        <Divider.Line />
        <IconButton aria-label="Add participant" variant="ghost">
          <IconMarkNew />
        </IconButton>
      </Divider.Root>
      <Divider.Root>
        <Divider.Line />
        <Divider.Label>Wednesday, September 23 · Earlier conversations</Divider.Label>
        <Divider.Line />
      </Divider.Root>
      <Divider.Root>
        <Divider.Label>thread_abcdefghijklmnopqrstuvwxyz_1234567890</Divider.Label>
        <Divider.Line />
      </Divider.Root>
      <Divider.Root>
        <Divider.Label>Workspace members</Divider.Label>
        <Divider.Line />
        <Button variant="secondary">Invite another member</Button>
      </Divider.Root>
    </Column>
  );
}
export const LongLabels = {
  render: (args) => (
    <main class={colorThemes[args.theme]} style={{ padding: "1rem", "min-height": "100vh" }}>
      <LongSpecimen />
    </main>
  ),
} satisfies Story;
function Enlarged(props: ParentProps) {
  onMount(() => {
    const style = document.documentElement.style,
      previous = style.getPropertyValue("font-size"),
      priority = style.getPropertyPriority("font-size");
    style.setProperty("font-size", "200%");
    onCleanup(() =>
      previous
        ? style.setProperty("font-size", previous, priority)
        : style.removeProperty("font-size"),
    );
  });
  return <>{props.children}</>;
}
export const EnlargedText = {
  render: (args) => (
    <Enlarged>
      <main class={colorThemes[args.theme]} style={{ padding: "1rem", "min-height": "100vh" }}>
        <LongSpecimen />
      </main>
    </Enlarged>
  ),
  tags: ["!autodocs"],
} satisfies Story;
export const Rtl = {
  render: (args) => (
    <main dir="rtl">
      <Specimen {...args} />
    </main>
  ),
} satisfies Story;
/** Geometry/paint checks require the browser; kept separate from the portable interaction story. */
export const Layout = {
  ...Comparison,
  play: async ({ canvasElement }) => {
    const win = canvasElement.ownerDocument.defaultView!;
    for (const root of canvasElement.querySelectorAll('[data-testid="center-label"]')) {
      const [start, label, end] = [...root.children] as HTMLElement[];
      const left = start!.getBoundingClientRect(),
        right = end!.getBoundingClientRect(),
        text = label!.getBoundingClientRect(),
        row = root.getBoundingClientRect();
      await expect(Math.abs(left.width - right.width)).toBeLessThan(1);
      await expect(Math.abs(text.x + text.width / 2 - row.x - row.width / 2)).toBeLessThan(1);
      await expect(win.getComputedStyle(start!).borderTopStyle).toBe("dashed");
      await expect(win.getComputedStyle(start!).borderTopWidth).toBe("1px");
      await expect(start).toHaveAttribute("aria-hidden", "true");
    }
    for (const line of canvasElement.querySelectorAll('[data-testid="plain-line"]')) {
      await expect(
        Math.abs(
          line.getBoundingClientRect().width - line.parentElement!.getBoundingClientRect().width,
        ),
      ).toBeLessThan(1);
    }
  },
} satisfies Story;
