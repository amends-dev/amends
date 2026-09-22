import { For, createSignal, splitProps } from "solid-js";
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
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./text.stories.css.ts";

const variants = ["body", "heading", "mono"] as const;
const tones = ["inherit", "primary", "secondary"] as const;
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
            <For each={tones}>{(value) => <option value={value}>{value}</option>}</For>
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
    tone: { control: "select", options: tones },
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
