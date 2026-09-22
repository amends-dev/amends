import { For, createSignal, onMount, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { Avatar, type AvatarKind } from "@amends/frontend/primitives/avatar";
import { Button } from "@amends/frontend/primitives/button";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { Tooltip } from "@amends/frontend/primitives/tooltip";
import { Text } from "@amends/frontend/primitives/text";
import { Column, Row } from "@amends/frontend/primitives/layout";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";

const identities = [
  { kind: "human", name: "Jo Mercer", fallback: "JM", description: "human · solid circle" },
  { kind: "agent", name: "Ada", fallback: "a", description: "agent · dashed ring" },
  { kind: "contact", name: "Ravi Kaur", fallback: "RK", description: "contact · rounded square" },
  { kind: "system", name: "Amends", fallback: "▣", description: "system · ink" },
] as const;
function Specimen(props: { theme: ColorTheme; enlarged?: boolean; long?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
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
  return (
    <section
      class={colorThemes[props.theme]}
      aria-label={`${props.theme} avatars`}
      style={{ padding: "min(1.5rem, 5vw)", "min-width": 0 }}
    >
      <Column gap={5}>
        <Text as="h2" variant="heading">
          {props.theme === "cotton" ? "Cotton" : "Soot"}
        </Text>
        <For each={["canvas", "panel"] as const}>
          {(surface) => (
            <div
              style={{ padding: "min(1rem, 4vw)", "background-color": colorVars.surface[surface] }}
              data-avatar-surface={surface}
            >
              <Column gap={4}>
                <Text as="h3" variant="mono">
                  {surface}
                </Text>
                <For each={identities}>
                  {(identity) => (
                    <Row align="start" gap={3}>
                      <Avatar.Root kind={identity.kind} decorative>
                        <Avatar.Fallback>{identity.fallback}</Avatar.Fallback>
                      </Avatar.Root>
                      <Column gap={1} style={{ flex: "1 1 12rem", "max-width": "100%" }}>
                        <Text as="span" style={{ "overflow-wrap": "anywhere" }}>
                          {props.long
                            ? `${identity.name} — International workspace collaboration and customer support`
                            : identity.name}
                        </Text>
                        <Text
                          as="span"
                          variant="mono"
                          tone="secondary"
                          style={{ "overflow-wrap": "anywhere" }}
                        >
                          {identity.description}
                        </Text>
                      </Column>
                    </Row>
                  )}
                </For>
              </Column>
            </div>
          )}
        </For>
      </Column>
    </section>
  );
}
type Args = { theme: ColorTheme; kind: AvatarKind; name: string; fallback: string };
const meta = {
  title: "Primitives/Avatar",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" as const },
  args: { theme: "cotton", kind: "human", name: "Jo Mercer, human", fallback: "JM" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    kind: { control: "select", options: ["human", "agent", "contact", "system"] },
    name: { control: "text" },
    fallback: { control: "text" },
  },
  render: (args) => (
    <main class={colorThemes[args.theme]} style={{ padding: "1.5rem" }}>
      <Avatar.Root kind={args.kind} aria-label={args.name}>
        <Avatar.Fallback>{args.fallback}</Avatar.Fallback>
      </Avatar.Root>
    </main>
  ),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const Comparison = {
  render: () => (
    <main
      style={{
        display: "grid",
        "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
      }}
    >
      <Specimen theme="cotton" />
      <Specimen theme="soot" />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const win = canvasElement.ownerDocument.defaultView!;
    for (const element of canvasElement.querySelectorAll<HTMLElement>("[data-avatar-kind]")) {
      const css = win.getComputedStyle(element),
        rect = element.getBoundingClientRect(),
        kind = element.dataset.avatarKind;
      await expect(rect.width).toBeGreaterThan(0);
      await expect(rect.width).toBeCloseTo(rect.height, 1);
      if (kind === "agent") await expect(css.borderTopStyle).toBe("dashed");
      if (kind === "contact") {
        await expect(Number.parseFloat(css.borderRadius)).toBeGreaterThan(0);
        await expect(Number.parseFloat(css.borderRadius)).toBeLessThan(rect.width / 2);
      }
      const background =
        kind === "agent"
          ? win.getComputedStyle(element.closest("[data-avatar-surface]")!).backgroundColor
          : css.backgroundColor;
      await expect(new Color(css.color).contrastWCAG21(background)).toBeGreaterThanOrEqual(4.5);
    }
  },
} satisfies Story;
export const LongNames = {
  render: (args) => (
    <main style={{ "max-width": "24rem" }}>
      <Specimen theme={args.theme} long />
    </main>
  ),
} satisfies Story;
export const EnlargedText = {
  render: (args) => (
    <main>
      <Specimen theme={args.theme} enlarged long />
    </main>
  ),
  tags: ["!autodocs"],
} satisfies Story;
export const Rtl = {
  render: (args) => (
    <main dir="rtl">
      <Specimen theme={args.theme} />
    </main>
  ),
} satisfies Story;
export const Fallbacks = {
  render: (args) => (
    <main class={colorThemes[args.theme]} style={{ padding: "1.5rem" }}>
      <Row gap={4}>
        <Avatar.Root kind="human" aria-label="Unknown human">
          <Avatar.Fallback />
        </Avatar.Root>
        <Avatar.Root kind="agent" aria-label="Unknown agent">
          <Avatar.Fallback> </Avatar.Fallback>
        </Avatar.Root>
        <Avatar.Root kind="human" aria-label="李明, human">
          <Avatar.Fallback>李</Avatar.Fallback>
        </Avatar.Root>
        <Avatar.Root kind="contact" aria-label="Ravi Kaur, external contact">
          <Avatar.Fallback>RK</Avatar.Fallback>
        </Avatar.Root>
      </Row>
    </main>
  ),
} satisfies Story;
function ReactiveExample() {
  const [agent, setAgent] = createSignal(false);
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Column align="start" gap={4}>
        <Avatar.Root
          kind={agent() ? "agent" : "human"}
          aria-label={agent() ? "Ada, agent" : "Jo Mercer, human"}
          classList={{ selected: agent() }}
        >
          <Avatar.Fallback>{agent() ? "a" : "JM"}</Avatar.Fallback>
        </Avatar.Root>
        <Button onClick={() => setAgent((value) => !value)}>Change identity</Button>
      </Column>
    </main>
  );
}
export const ReactiveProps = {
  render: ReactiveExample,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      avatar = canvas.getByRole("img", { name: "Jo Mercer, human" });
    await expect(avatar).not.toHaveAttribute("tabindex");
    await userEvent.click(canvas.getByRole("button", { name: "Change identity" }));
    await expect(canvas.getByRole("img", { name: "Ada, agent" })).toBe(avatar);
    await expect(avatar).toHaveClass("selected");
    await expect(avatar).toHaveTextContent("a");
  },
} satisfies Story;
function ActionExample() {
  const [opened, setOpened] = createSignal(false);
  return (
    <main class={colorThemes.cotton} style={{ padding: "2rem" }}>
      <Column align="start" gap={4}>
        <Tooltip.Root>
          <Tooltip.Trigger
            as={IconButton}
            aria-label="Open Ada's profile"
            variant="ghost"
            onClick={() => setOpened(true)}
          >
            <Avatar.Root kind="agent" decorative>
              <Avatar.Fallback>a</Avatar.Fallback>
            </Avatar.Root>
          </Tooltip.Trigger>
          <Tooltip.Content>Ada · agent</Tooltip.Content>
        </Tooltip.Root>
        {opened() && (
          <Text as="p" role="status">
            Ada's profile requested.
          </Text>
        )}
      </Column>
    </main>
  );
}
export const InButton = {
  render: ActionExample,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      button = canvas.getByRole("button", { name: "Open Ada's profile" });
    await expect(canvas.queryByRole("img")).toBeNull();
    button.focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("status")).toHaveTextContent("Ada's profile requested.");
    await expect(button).toHaveFocus();
  },
} satisfies Story;
