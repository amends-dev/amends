import { For, createSignal, onMount, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { Status } from "@amends/frontend/primitives/status";
import { Button } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { Column, Row } from "@amends/frontend/primitives/layout";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme, StatusTone } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";

// Reference examples only. Product features own their domain-to-presentation mapping.
const examples: { label: string; tone: StatusTone; hollow?: boolean; muted?: boolean }[] = [
  { label: "open", tone: "idle" },
  { label: "triage", tone: "idle" },
  { label: "ready", tone: "idle" },
  { label: "working", tone: "running" },
  { label: "review", tone: "pending" },
  { label: "held", tone: "pending" },
  { label: "succeeded", tone: "success" },
  { label: "failed", tone: "danger" },
  { label: "cancelled", tone: "idle", hollow: true, muted: true },
];
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
      aria-label={`${props.theme} status labels`}
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
              data-status-surface={surface}
            >
              <Column gap={4}>
                <Text as="h3" variant="mono">
                  {surface}
                </Text>
                <Row gap={3}>
                  <For each={examples}>
                    {(example) => (
                      <Status.Root tone={example.tone}>
                        <Status.Indicator appearance={example.hollow ? "hollow" : "solid"} />
                        <Status.Label muted={example.muted}>
                          {props.long
                            ? `${example.label} — Workspace synchronization for the international support team`
                            : example.label}
                        </Status.Label>
                      </Status.Root>
                    )}
                  </For>
                </Row>
              </Column>
            </div>
          )}
        </For>
        <Status.Root tone="warning">
          <Status.Indicator />
          <Status.Label>warning — check the connection</Status.Label>
        </Status.Root>
      </Column>
    </section>
  );
}
type Args = {
  theme: ColorTheme;
  tone: StatusTone;
  appearance: "solid" | "hollow";
  label: string;
  muted: boolean;
};
const meta = {
  title: "Primitives/Status",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" as const },
  args: { theme: "cotton", tone: "pending", appearance: "solid", label: "review", muted: false },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    tone: {
      control: "select",
      options: ["idle", "running", "pending", "warning", "success", "danger"],
    },
    appearance: { control: "select", options: ["solid", "hollow"] },
    label: { control: "text" },
    muted: { control: "boolean" },
  },
  render: (args) => (
    <main class={colorThemes[args.theme]} style={{ padding: "1.5rem" }}>
      <Status.Root tone={args.tone}>
        <Status.Indicator appearance={args.appearance} />
        <Status.Label muted={args.muted}>{args.label}</Status.Label>
      </Status.Root>
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
        "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
      }}
    >
      <Specimen theme="cotton" />
      <Specimen theme="soot" />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const win = canvasElement.ownerDocument.defaultView!;
    for (const surface of canvasElement.querySelectorAll("[data-status-surface]")) {
      const background = win.getComputedStyle(surface).backgroundColor;
      for (const root of surface.querySelectorAll("[data-status-tone]")) {
        const indicator = root.querySelector("[data-status-indicator]")!,
          label = indicator.nextElementSibling!;
        const css = win.getComputedStyle(indicator);
        await expect(indicator).toHaveAttribute("aria-hidden", "true");
        if (indicator.getAttribute("data-status-indicator") === "hollow")
          await expect(css.borderTopStyle).toBe("dashed");
        await expect(new Color(css.color).contrastWCAG21(background)).toBeGreaterThanOrEqual(3);
        await expect(
          new Color(win.getComputedStyle(label).color).contrastWCAG21(background),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  },
} satisfies Story;
export const LongLabels = {
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
function ReactiveExample() {
  const [cancelled, setCancelled] = createSignal(false);
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Column align="start" gap={4}>
        <Status.Root tone={cancelled() ? "idle" : "running"} data-testid="state">
          <Status.Indicator appearance={cancelled() ? "hollow" : "solid"} />
          <Status.Label muted={cancelled()}>{cancelled() ? "cancelled" : "working"}</Status.Label>
        </Status.Root>
        <Button onClick={() => setCancelled((value) => !value)}>Change presentation</Button>
      </Column>
    </main>
  );
}
export const ReactiveProps = {
  render: ReactiveExample,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      state = canvas.getByTestId("state"),
      button = canvas.getByRole("button", { name: "Change presentation" });
    const indicator = state.querySelector("[data-status-indicator]");
    await expect(state).not.toHaveAttribute("role");
    await expect(state).not.toHaveAttribute("aria-live");
    await userEvent.click(button);
    await expect(canvas.getByText("cancelled")).toBeVisible();
    await expect(canvas.getByTestId("state")).toBe(state);
    await expect(indicator).toHaveAttribute("data-status-indicator", "hollow");
    await expect(button).toHaveFocus();
  },
} satisfies Story;
export const ExplicitAnnouncement = {
  render: () => {
    const [saved, setSaved] = createSignal(false);
    return (
      <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
        <Column align="start" gap={4}>
          <Status.Root
            tone={saved() ? "success" : "pending"}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Status.Indicator />
            <Status.Label>
              {saved() ? "Changes saved" : "Changes awaiting confirmation"}
            </Status.Label>
          </Status.Root>
          <Button onClick={() => setSaved(true)}>Confirm changes</Button>
        </Column>
      </main>
    );
  },
} satisfies Story;
