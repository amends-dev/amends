import { For, createSignal, onMount, onCleanup, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  Text,
  type TextProps,
  type TextElement,
  type TextTone,
} from "@amends/frontend/primitives/text";
import type { TypographyRole } from "@amends/frontend/foundations/typography";
import { typographyStyles } from "@amends/frontend/foundations/typography/styles";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import Color from "colorjs.io";
import { compositeOnSurface } from "../../foundations/color/contrast.ts";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./text.stories.css.ts";

const variants = ["body", "heading", "mono"] as const;
const tones = ["inherit", "primary", "secondary"] as const;
const semanticTones = ["success", "warning", "danger", "pending"] as const;
const allTones = [...tones, ...semanticTones] as const;
const elements = ["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "code"] as const;
const labels = { cotton: "Cotton", soot: "Soot" } as const;
const samples = {
  body: "Keep the context close.",
  heading: "A place for every conversation",
  mono: "thread_123 · queued",
} as const;

function Variants(props: { theme: ColorTheme }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.scope} ${s.stack}`}
      aria-label={`${labels[props.theme]} Text variants`}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      <For each={variants}>
        {(variant) => (
          <section class={s.group}>
            <Text as="h3" variant="mono">
              {variant}
            </Text>
            <For each={tones}>
              {(tone) => (
                <div class={s.group}>
                  <Text variant="mono" tone="secondary">
                    tone: {tone}
                  </Text>
                  <Text
                    variant={variant}
                    tone={tone}
                    data-text-variant={variant}
                    data-text-tone={tone}
                  >
                    {samples[variant]}
                  </Text>
                </div>
              )}
            </For>
          </section>
        )}
      </For>
    </article>
  );
}

function ReactiveFixture() {
  const [variant, setVariant] = createSignal<TypographyRole>("body");
  const [tone, setTone] = createSignal<TextTone>("inherit");
  const [element, setElement] = createSignal<TextElement>("p");
  return (
    <main class={`${colorThemes.cotton} ${s.scope} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Reactive props
      </Text>
      <div class={s.controls}>
        <label class={s.label}>
          Style
          <select
            value={variant()}
            onChange={(event) => setVariant(event.currentTarget.value as TypographyRole)}
          >
            <For each={variants}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </label>
        <label class={s.label}>
          Tone
          <select
            value={tone()}
            onChange={(event) => setTone(event.currentTarget.value as TextTone)}
          >
            <For each={allTones}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </label>
        <label class={s.label}>
          Element
          <select
            value={element()}
            onChange={(event) => setElement(event.currentTarget.value as TextElement)}
          >
            <For each={elements}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </label>
      </div>
      <Text as={element()} variant={variant()} tone={tone()} data-testid="reactive-text">
        One component, changing props.
      </Text>
    </main>
  );
}

type Args = TextProps<TextElement> & { theme: ColorTheme };
const meta = {
  title: "Primitives/Text",
  component: Text,
  render: (props) => {
    const [local, text] = splitProps(props, ["theme"]);
    return (
      <main class={`${colorThemes[local.theme]} ${s.scope}`}>
        <Text {...text} />
      </main>
    );
  },
  args: {
    theme: "cotton",
    as: "p",
    variant: "body",
    tone: "inherit",
    children: "Keep the context close.",
  },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    as: { control: "select", options: elements },
    variant: { control: "select", options: variants },
    tone: { control: "select", options: allTones },
    children: { control: "text" },
  },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    controls: { include: ["theme", "as", "variant", "tone", "children"] },
    docs: {
      description: {
        component:
          "A native text element composed from the reviewed typography and colors. Defaults to a body paragraph with inherited color and zero margins. The as prop selects semantics independently of variant. Native attributes, refs, class, and enabled classList entries are preserved.",
      },
    },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => (
    <main class={s.comparison}>
      <Variants theme="cotton" />
      <Variants theme="soot" />
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;
export const Playground = {} satisfies Story;
export const InlineAndHeadings = {
  render: () => (
    <main class={`${colorThemes.cotton} ${s.scope} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Semantics and appearance
      </Text>
      <Text as="h2" variant="body">
        This is an h2 using the body style.
      </Text>
      <Text variant="heading">This is a paragraph using the heading style.</Text>
      <Text>
        Read{" "}
        <Text as="span" tone="secondary">
          the notes
        </Text>{" "}
        for{" "}
        <Text as="code" variant="mono">
          thread_123
        </Text>
        .
      </Text>
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;
export const Inheritance = {
  render: () => (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article
            class={`${colorThemes[theme]} ${s.scope} ${s.stack}`}
            aria-label={`${labels[theme]} color inheritance`}
          >
            <Text as="h2" variant="heading">
              {labels[theme]}
            </Text>
            <div class={`${s.secondary} ${s.panel} ${s.group}`}>
              <Text data-testid={`${theme}-inherited`}>
                Default tone inherits this container's secondary color.
              </Text>
              <Text tone="primary" data-testid={`${theme}-primary`}>
                An explicit primary tone overrides the inherited color.
              </Text>
              <Text as="span" tone="inherit">
                Inline text can inherit the same color.
              </Text>
            </div>
          </article>
        )}
      </For>
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;
export const Narrow = {
  render: () => (
    <main class={`${colorThemes.cotton} ${s.scope} ${s.stack} ${s.narrow}`}>
      <Text as="h1" variant="heading">
        Text in a narrow container
      </Text>
      <Text>
        Keep the discussion readable as the available space changes. Text wraps naturally without
        truncation.
      </Text>
      <Text as="code" variant="mono" tone="secondary">
        thread_1234567890_abcdefghijklmnopqrstuvwxyz_1234567890
      </Text>
      <Text>The container allows long identifiers to wrap anywhere.</Text>
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;
export const ReactiveProps = {
  render: () => <ReactiveFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const original = canvas.getByTestId("reactive-text");
    const initialClasses = original.className;
    await expect(original.tagName).toBe("P");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Style" }), "heading");
    await expect(canvas.getByTestId("reactive-text")).toBe(original);
    await expect(original).toHaveClass(typographyStyles.heading);
    const headingClasses = original.className;
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tone" }), "secondary");
    await expect(original.className).not.toBe(headingClasses);
    for (const tone of semanticTones) {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tone" }), tone);
      await expect(canvas.getByTestId("reactive-text")).toBe(original);
      await expect(original).not.toHaveAttribute("tone");
      await expect(original).not.toHaveAttribute("role");
    }
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Element" }), "h2");
    const heading = canvas.getByRole("heading", {
      level: 2,
      name: "One component, changing props.",
    });
    await expect(heading).not.toBe(original);
    await expect(original.isConnected).toBe(false);
    for (const prop of ["as", "variant", "tone"]) await expect(heading).not.toHaveAttribute(prop);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Style" }), "body");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tone" }), "inherit");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Element" }), "p");
    await expect(canvas.getByTestId("reactive-text").className).toBe(initialClasses);
  },
} satisfies Story;

const statusMessages = {
  success: "Success: invitation sent.",
  warning: "Warning: review the selected permissions.",
  danger: "Error: this invitation could not be sent.",
  pending: "Pending: awaiting a response.",
} as const;
function SemanticSpecimens(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("font-size"),
      priority = style.getPropertyPriority("font-size");
    style.setProperty("font-size", "200%");
    onCleanup(() =>
      previous
        ? style.setProperty("font-size", previous, priority)
        : style.removeProperty("font-size"),
    );
  });
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.scope} ${s.stack}`} data-text-theme={theme}>
            <Text as="h2" variant="heading">
              {labels[theme]} semantic text
            </Text>
            <Text tone="secondary">
              Tone supplies color. The message supplies meaning; live announcements are
              caller-owned.
            </Text>
            <For each={["canvas", "panel"] as const}>
              {(surface) => (
                <section
                  class={`${s.panel} ${s.stack}`}
                  style={{ "background-color": colorVars.surface[surface] }}
                  data-text-surface={surface}
                >
                  <Text as="h3">On surface.{surface}</Text>
                  <For each={semanticTones}>
                    {(tone) => (
                      <div class={s.group}>
                        <Text variant="mono" tone="secondary">
                          tone="{tone}"
                        </Text>
                        <For each={[false, true]}>
                          {(soft) => (
                            <div
                              style={{
                                padding: "0.75rem",
                                "background-color": soft
                                  ? colorVars.status[tone].soft
                                  : "transparent",
                              }}
                              data-text-soft={soft}
                            >
                              <Text tone={tone} data-semantic-text={tone}>
                                {statusMessages[tone]}{" "}
                                <Text as="span">Details inherit the same tone.</Text>
                              </Text>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </section>
              )}
            </For>
          </article>
        )}
      </For>
    </main>
  );
}
export const SemanticTones = {
  render: () => <SemanticSpecimens />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const samples = canvasElement.querySelectorAll<HTMLElement>("[data-semantic-text]");
    await expect(samples).toHaveLength(32);
    if (window.matchMedia("(forced-colors: active)").matches) return;
    for (const sample of samples) {
      const theme = sample.closest<HTMLElement>("[data-text-theme]")!.dataset
        .textTheme as ColorTheme;
      const tone = sample.dataset.semanticText as (typeof semanticTones)[number];
      const surface = sample.closest<HTMLElement>("[data-text-surface]")!;
      const computed = getComputedStyle(sample);
      const text = new Color(computed.color);
      await expect(text.deltaEOK(colors[theme].status[tone].text)).toBeLessThan(0.0001);
      const ground = compositeOnSurface(
        getComputedStyle(sample.parentElement!).backgroundColor,
        getComputedStyle(surface).backgroundColor,
      );
      await expect(text.contrastWCAG21(ground)).toBeGreaterThanOrEqual(4.5);
      await expect(getComputedStyle(sample.firstElementChild!).color).toBe(computed.color);
      await expect(sample).not.toHaveAttribute("role");
      await expect(sample).not.toHaveAttribute("aria-live");
    }
  },
} satisfies Story;
export const SemanticEnlargedText = {
  ...SemanticTones,
  render: () => <SemanticSpecimens enlarged />,
  tags: ["!autodocs"],
} satisfies Story;
