import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import type { ButtonTone } from "@amends/ui/primitives/button";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { Row, Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import { EnlargedText as Enlarge } from "../overlay/overlay.stories-support.tsx";
import "@amends/ui/foundations/typography/fonts";
import { DemoIcon } from "./icon-button.stories-support.tsx";
import { IconMarkMore, IconMarkRetry } from "@amends/icons";
const meta = {
  title: "Primitives/IconButton",
  parameters: { layout: "fullscreen" as const },
  tags: ["autodocs"],
} satisfies Meta;
export default meta;
type Story = StoryObj;
function ComparisonSpecimen(props: { tone?: ButtonTone }) {
  return (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Column gap={4} class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <For each={["primary", "secondary", "ghost"] as const}>
              {(variant) => (
                <Row gap={4}>
                  <Text>{variant}</Text>
                  <IconButton
                    variant={variant}
                    tone={props.tone}
                    aria-label={props.tone === "danger" ? "Delete thread" : "Add member"}
                  >
                    <DemoIcon name={props.tone === "danger" ? "trash" : "plus"} />
                  </IconButton>
                  <IconButton
                    variant={variant}
                    tone={props.tone}
                    aria-label={props.tone === "danger" ? "Delete draft" : "Search"}
                  >
                    <DemoIcon name={props.tone === "danger" ? "trash" : "search"} />
                  </IconButton>
                  <IconButton
                    variant={variant}
                    tone={props.tone}
                    aria-label="Unavailable action"
                    disabled
                  >
                    <DemoIcon name={props.tone === "danger" ? "trash" : "bell"} />
                  </IconButton>
                </Row>
              )}
            </For>
          </Column>
        )}
      </For>
    </main>
  );
}
export const Comparison = { render: () => <ComparisonSpecimen /> } satisfies Story;
export const DangerComparison = {
  render: () => <ComparisonSpecimen tone="danger" />,
} satisfies Story;
function CircularTextSpecimen() {
  return (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Column gap={4} class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <Row gap={4} align="center">
              <IconButton shape="circle" size="compact" variant="secondary" aria-label="More">
                ⋯
              </IconButton>
              <IconButton shape="circle" size="compact" variant="soft" aria-label="Retry">
                ↻
              </IconButton>
              <IconButton shape="circle" variant="secondary" aria-label="Search">
                <DemoIcon name="search" />
              </IconButton>
              <IconButton
                shape="circle"
                size="compact"
                variant="secondary"
                aria-label="Unavailable"
                disabled
              >
                ⋯
              </IconButton>
            </Row>
          </Column>
        )}
      </For>
    </main>
  );
}
export const CircularText = {
  render: CircularTextSpecimen,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      rootSize = Number.parseFloat(
        getComputedStyle(canvasElement.ownerDocument.documentElement).fontSize,
      ),
      expectedSize =
        (rootSize *
          (canvasElement.ownerDocument.defaultView!.matchMedia("(any-pointer: coarse)").matches
            ? 44
            : 34)) /
        16;
    await expect(canvas.getAllByRole("button", { name: "More" })).toHaveLength(2);
    for (const button of canvas.getAllByRole("button", { name: "More" })) {
      await expect(button).toHaveAttribute("data-icon-button-shape", "circle");
      await expect(button).toHaveAttribute("data-icon-button-size", "compact");
      await expect(button.firstElementChild).toHaveAttribute("aria-hidden", "true");
      await expect(button.getBoundingClientRect().width).toBeCloseTo(expectedSize, 2);
      await expect(button.getBoundingClientRect().height).toBeCloseTo(expectedSize, 2);
      await expect(getComputedStyle(button).borderRadius).toBe("9999px");
      await expect(getComputedStyle(button.firstElementChild!).fontSize).toBe(
        `${(rootSize * 13) / 16}px`,
      );
    }
    for (const button of canvas.getAllByRole("button", { name: "Retry" })) {
      await expect(getComputedStyle(button).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    }
  },
} satisfies Story;
export const CircularEnlargedText = {
  render: () => (
    <Enlarge>
      <CircularTextSpecimen />
    </Enlarge>
  ),
  tags: ["!autodocs"],
} satisfies Story;
export const CircularMarks = {
  render: () => (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Column gap={4} class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="heading">
              {theme} · SVG marks
            </Text>
            <Row gap={4}>
              <IconButton shape="circle" size="compact" variant="secondary" aria-label="More">
                <IconMarkMore size="sm" />
              </IconButton>
              <IconButton shape="circle" size="compact" variant="soft" aria-label="Retry">
                <IconMarkRetry size="sm" />
              </IconButton>
            </Row>
          </Column>
        )}
      </For>
    </main>
  ),
} satisfies Story;
function Counter(props: { tone?: ButtonTone }) {
  const [count, setCount] = createSignal(0);
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Row>
        <IconButton
          tone={props.tone}
          aria-label={props.tone === "danger" ? "Delete draft" : "Add one"}
          onClick={() => setCount((n) => n + 1)}
        >
          <DemoIcon name={props.tone === "danger" ? "trash" : "plus"} />
        </IconButton>
        <Text role="status">Count: {count()}</Text>
      </Row>
    </main>
  );
}
export const Interaction = {
  render: () => <Counter />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      button = canvas.getByRole("button", { name: "Add one" });
    await userEvent.click(button);
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("status")).toHaveTextContent("Count: 3");
  },
} satisfies Story;

export const DangerInteraction = {
  render: () => <Counter tone="danger" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Delete draft" }));
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("status")).toHaveTextContent("Count: 3");
  },
} satisfies Story;

export const CircularInteraction = {
  render: () => {
    const [count, setCount] = createSignal(0);
    return (
      <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
        <Row>
          <IconButton
            shape="circle"
            size="compact"
            variant="secondary"
            aria-label="More"
            onClick={() => setCount((n) => n + 1)}
          >
            ⋯
          </IconButton>
          <Text role="status">Count: {count()}</Text>
        </Row>
      </main>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      button = canvas.getByRole("button", { name: "More" });
    await userEvent.click(button);
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("status")).toHaveTextContent("Count: 3");
  },
} satisfies Story;
