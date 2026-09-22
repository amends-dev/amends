import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import Color from "colorjs.io";
import { colors, type ColorTheme, type StatusTone } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import { Button } from "@amends/frontend/primitives/button";
import { Tooltip } from "@amends/frontend/primitives/tooltip";
import "@amends/frontend/foundations/typography/fonts";
import { compositeOnSurface } from "./contrast.ts";
import * as s from "./status.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const tones = ["idle", "running", "success", "warning", "pending", "danger"] as const;
const specimens = {
  idle: {
    label: "Idle",
    message: "Idle — no work scheduled",
    description: "Inactive state, not a disabled control.",
    path: "M5 12h14",
  },
  running: {
    label: "Running",
    message: "Running — processing replies",
    description: "Work is underway; neutral ink retains the reference direction.",
    path: "M8 5v14l11-7Z",
  },
  success: {
    label: "Success",
    message: "Success — invitation sent",
    description: "An operation completed successfully.",
    path: "m5 12 4 4L19 6",
  },
  warning: {
    label: "Warning",
    message: "Warning — review permissions",
    description: "Caution or a potential problem; not a waiting state.",
    path: "M12 3 2 21h20ZM12 9v5m0 3v.5",
  },
  pending: {
    label: "Pending",
    message: "Pending — awaiting a reply",
    description: "Waiting for a decision or an external event.",
    path: "M12 7v5l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  },
  danger: {
    label: "Danger",
    message: "Error — invitation not sent",
    description: "Failure, invalid data, or destructive intent.",
    path: "m6 6 12 12M18 6 6 18",
  },
} satisfies Record<
  StatusTone,
  { label: string; message: string; description: string; path: string }
>;
type Surface = "canvas" | "panel";

function Sample(props: { tone: StatusTone; soft: boolean }) {
  const variables = () => colorVars.status[props.tone];
  const background = () => {
    const status = variables();
    return props.soft && "soft" in status ? status.soft : "transparent";
  };
  return (
    <div
      class={s.sample}
      data-status-tone={props.tone}
      data-status-soft={props.soft}
      style={{ "background-color": background() }}
    >
      <svg
        class={s.indicator}
        style={{ color: variables().indicator }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={specimens[props.tone].path} />
      </svg>
      <Text style={{ color: variables().text }}>{specimens[props.tone].message}</Text>
    </div>
  );
}
function Pairings(props: { theme: ColorTheme; surface: Surface }) {
  const palette = () => colors[props.theme];
  return (
    <section
      class={`${s.surface} ${s.stack}`}
      style={{ "background-color": colorVars.surface[props.surface] }}
      data-status-surface={props.surface}
    >
      <Text as="h3">On surface.{props.surface}</Text>
      <div class={s.cases}>
        <For each={tones}>
          {(tone) => {
            const status = () => palette().status[tone];
            const soft = () => {
              const value = status();
              return "soft" in value ? value.soft : undefined;
            };
            const ratio = (role: "text" | "indicator", tint?: string) =>
              new Color(status()[role])
                .contrastWCAG21(
                  compositeOnSurface(tint ?? "transparent", palette().surface[props.surface]),
                )
                .toFixed(2);
            return (
              <figure class={`${s.figure} ${s.stack}`}>
                <Text as="h4" variant="mono">
                  status.{tone}
                </Text>
                <Sample tone={tone} soft={false} />
                <Show when={soft()}>
                  <Sample tone={tone} soft />
                </Show>
                <figcaption class={s.caption}>
                  <Text tone="secondary">{specimens[tone].description}</Text>
                  <Text variant="mono" tone="secondary">
                    Text {ratio("text")}:1 · indicator {ratio("indicator")}:1
                  </Text>
                  <Show when={soft()}>
                    {(tint) => (
                      <Text variant="mono" tone="secondary">
                        On tint: text {ratio("text", tint())}:1 · indicator{" "}
                        {ratio("indicator", tint())}:1
                      </Text>
                    )}
                  </Show>
                  <Text variant="mono" tone="secondary">
                    text · {status().text}
                  </Text>
                  <Text variant="mono" tone="secondary">
                    indicator · {status().indicator}
                  </Text>
                  <Show when={soft()}>
                    {(tint) => (
                      <Text variant="mono" tone="secondary">
                        soft · {tint()}
                      </Text>
                    )}
                  </Show>
                </figcaption>
              </figure>
            );
          }}
        </For>
      </div>
    </section>
  );
}
function StatusSpecimen(props: { theme: ColorTheme; children?: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-status-theme={props.theme}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]} status colors
      </Text>
      <Text tone="secondary">
        Meaning comes from the label and shape as well as color. These are foundation specimens, not
        alert components.
      </Text>
      <Pairings theme={props.theme} surface="canvas" />
      <hr class={s.seam} data-color-seam />
      <Text variant="mono" tone="secondary">
        Decorative divider · line.seam · {colors[props.theme].line.seam}
      </Text>
      <Pairings theme={props.theme} surface="panel" />
      <Text tone="secondary">
        Text ≥ 4.5:1. Indicators ≥ 3:1. Soft fills and dashed seams are decorative; they do not
        identify a control or convey a state on their own.
      </Text>
      {props.children}
    </article>
  );
}
function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <StatusSpecimen theme="cotton" />
      <StatusSpecimen theme="soot" />
    </main>
  );
}
function EnlargedSpecimen() {
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
  return <ComparisonSpecimen />;
}
function PortalSpecimen() {
  const [theme, setTheme] = createSignal<ColorTheme>("cotton");
  return (
    <main class={`${colorThemes.soot} ${s.frame}`}>
      <section class={`${colorThemes[theme()]} ${s.frame} ${s.stack}`} data-status-theme={theme()}>
        <Text as="h1" variant="heading">
          Nested theme and portaled status colors
        </Text>
        <Text>
          This portal test overrides the tooltip's foreground and background as a pair. Hover or
          focus Delivery details, then switch themes to verify the inherited status colors.
        </Text>
        <Button
          variant="secondary"
          onClick={() => setTheme(theme() === "cotton" ? "soot" : "cotton")}
        >
          Switch theme
        </Button>
        <Tooltip.Root>
          <Tooltip.Trigger as={Button} variant="secondary">
            Delivery details
          </Tooltip.Trigger>
          <Tooltip.Content
            data-status-portal
            style={{
              color: colorVars.status.danger.text,
              "background-color": colorVars.surface.panel,
              "border-style": "solid",
              "border-width": "1px",
              "border-color": colorVars.status.danger.indicator,
            }}
          >
            Error: one invitation could not be sent.
          </Tooltip.Content>
        </Tooltip.Root>
        <Text variant="mono">Trigger theme: {labels[theme()]}</Text>
      </section>
    </main>
  );
}

const verifyStatuses: NonNullable<StoryObj["play"]> = async ({
  canvasElement,
  parameters,
  step,
}) => {
  const doc = canvasElement.ownerDocument;
  await doc.fonts.ready;
  const samples = canvasElement.querySelectorAll<HTMLElement>("[data-status-tone]");
  await expect(samples).toHaveLength(parameters.statusSampleCount);
  if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
  for (const seam of canvasElement.querySelectorAll<HTMLElement>("[data-color-seam]")) {
    const theme = seam.closest<HTMLElement>("[data-status-theme]")!.dataset
      .statusTheme as ColorTheme;
    await expect(
      new Color(getComputedStyle(seam).borderTopColor).deltaEOK(colors[theme].line.seam),
    ).toBeLessThan(0.0001);
  }
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!;
  await step("Verify scoped text, indicator and blended background colors", async () => {
    for (const sample of samples) {
      const theme = sample.closest<HTMLElement>("[data-status-theme]")!.dataset
        .statusTheme as ColorTheme;
      const surface = sample.closest<HTMLElement>("[data-status-surface]")!;
      const palette = colors[theme],
        status = palette.status[sample.dataset.statusTone as StatusTone];
      const background = getComputedStyle(surface).backgroundColor;
      const rendered = getComputedStyle(sample),
        fill = new Color(rendered.backgroundColor);
      const expectedFill = new Color(
        sample.dataset.statusSoft === "true" && "soft" in status ? status.soft : "transparent",
      );
      await expect(
        new Color(background).deltaEOK(palette.surface[surface.dataset.statusSurface as Surface]),
      ).toBeLessThan(0.0001);
      await expect(fill.alpha).toBeCloseTo(expectedFill.alpha, 6);
      if (expectedFill.alpha) await expect(fill.deltaEOK(expectedFill)).toBeLessThan(0.0001);
      const effective = compositeOnSurface(rendered.backgroundColor, background);
      const indicator = new Color(getComputedStyle(sample.firstElementChild!).color);
      const text = new Color(getComputedStyle(sample.lastElementChild!).color);
      for (const [actual, expected, minimum] of [
        [text, status.text, 4.5],
        [indicator, status.indicator, 3],
      ] as const) {
        await expect(actual.deltaEOK(expected)).toBeLessThan(0.0001);
        await expect(actual.alpha).toBe(1);
        await expect(actual.contrastWCAG21(effective)).toBeGreaterThanOrEqual(minimum);
      }
      // Independently check alpha blending against the browser's sRGB canvas, allowing pixel quantization.
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = background;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = rendered.backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      for (const index of [0, 1, 2] as const)
        await expect(Math.abs(pixel[index]! / 255 - effective.coords[index]!)).toBeLessThanOrEqual(
          2 / 255,
        );
      await expect(pixel[3]).toBe(255);
    }
  });
};
const meta = {
  title: "Foundations/Color/Status",
  component: StatusSpecimen,
  render: (props) => (
    <main>
      <StatusSpecimen {...props} />
    </main>
  ),
  args: { theme: "cotton" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    children: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" as const, statusSampleCount: 20 },
  tags: ["autodocs"],
  play: verifyStatuses,
} satisfies Meta<typeof StatusSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => <ComparisonSpecimen />,
  parameters: { statusSampleCount: 40, controls: { disable: true } },
} satisfies Story;
export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const NestedThemes = {
  render: () => (
    <main>
      <StatusSpecimen theme="cotton">
        <StatusSpecimen theme="soot" />
      </StatusSpecimen>
      <StatusSpecimen theme="soot">
        <StatusSpecimen theme="cotton" />
      </StatusSpecimen>
    </main>
  ),
  parameters: { statusSampleCount: 80, controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedSpecimen />,
  parameters: Comparison.parameters,
  tags: ["!autodocs"],
} satisfies Story;
export const PortalThemes = {
  render: () => <PortalSpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Delivery details" });
    for (const theme of ["cotton", "soot"] as const) {
      trigger.focus();
      await waitFor(() => expect(page.getByRole("tooltip")).toBeVisible());
      const popup = page.getByRole("tooltip");
      if (!window.matchMedia("(forced-colors: active)").matches) {
        await waitFor(async () => {
          const computed = getComputedStyle(popup);
          await expect(
            new Color(computed.color).deltaEOK(colors[theme].status.danger.text),
          ).toBeLessThan(0.0001);
          await expect(
            new Color(computed.borderTopColor).deltaEOK(colors[theme].status.danger.indicator),
          ).toBeLessThan(0.0001);
          await expect(
            new Color(computed.backgroundColor).deltaEOK(colors[theme].surface.panel),
          ).toBeLessThan(0.0001);
        });
      }
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
      if (theme === "cotton")
        await userEvent.click(canvas.getByRole("button", { name: "Switch theme" }));
    }
  },
  parameters: {
    controls: { disable: true },
    a11y: {
      config: {
        checks: [
          {
            id: "region",
            options: {
              regionMatcher: "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip]",
            },
          },
        ],
      },
    },
  },
} satisfies Story;
