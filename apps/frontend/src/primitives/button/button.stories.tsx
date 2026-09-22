import { For, createSignal, onCleanup, onMount, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { Button, type ButtonProps, type ButtonVariant } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { focus } from "@amends/frontend/foundations/focus";
import { compositeOnSurface } from "../../foundations/color/contrast.ts";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./button.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const variants = ["primary", "secondary"] as const;

function ThemeSpecimen(props: { theme: ColorTheme }) {
  const [count, setCount] = createSignal(0);
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-button-theme={props.theme}
      aria-label={`${labels[props.theme]} buttons`}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      <Text tone="secondary">
        Hover, press, or use Tab to inspect both variants. Click, Enter, and Space activate them.
      </Text>
      <For each={["canvas", "panel"] as const}>
        {(surface) => (
          <section
            class={`${s.surface} ${s.stack}`}
            style={{ "background-color": colorVars.surface[surface] }}
            data-button-surface={surface}
          >
            <Text as="h3">On surface.{surface}</Text>
            <For each={variants}>
              {(variant) => (
                <div class={s.stack} data-button-variant={variant}>
                  <Text as="h4" variant="mono">
                    {variant}
                  </Text>
                  <div class={s.row}>
                    <Button variant={variant} onClick={() => setCount((count) => count + 1)}>
                      {variant === "primary" ? "Publish reply" : "Save draft"}
                    </Button>
                    <Button
                      variant={variant}
                      disabled
                      onClick={() => setCount((count) => count + 1)}
                    >
                      Unavailable
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </section>
        )}
      </For>
      <fieldset disabled class={s.fieldset}>
        <legend class={s.legend}>Inside a disabled fieldset</legend>
        <div class={s.row}>
          <For each={variants}>
            {(variant) => (
              <Button
                variant={variant}
                data-button-variant={variant}
                onClick={() => setCount((count) => count + 1)}
              >
                {variant === "primary" ? "Publish reply" : "Save draft"}
              </Button>
            )}
          </For>
        </div>
      </fieldset>
      <Text role="status">Activations: {count()}</Text>
    </article>
  );
}

function ActivationFixture(props: { variant: ButtonVariant }) {
  const [count, setCount] = createSignal(0);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Activation
      </Text>
      <Text tone="secondary">
        Each click, Enter, or Space activation increments the counter once.
      </Text>
      <div class={s.row}>
        <Button variant={props.variant} onClick={() => setCount((count) => count + 1)}>
          Publish reply
        </Button>
        <Button variant={props.variant} disabled onClick={() => setCount((count) => count + 1)}>
          Unavailable
        </Button>
        <Button variant={props.variant} onClick={() => setCount(0)}>
          Reset counter
        </Button>
      </div>
      <Text role="status">Activations: {count()}</Text>
    </main>
  );
}

function FormFixture(props: { variant: ButtonVariant }) {
  const [drafts, setDrafts] = createSignal(0);
  const [submissions, setSubmissions] = createSignal(0);
  const [submitter, setSubmitter] = createSignal("none");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Form behavior
      </Text>
      <Text tone="secondary">
        Save draft uses the default button type. Publish reply explicitly submits this local
        demonstration form.
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmissions((count) => count + 1);
          setSubmitter(
            `${event.submitter?.getAttribute("name")}=${event.submitter?.getAttribute("value")}`,
          );
        }}
      >
        <label class={s.label}>
          Reply title
          <input class={s.input} name="title" value="Proposal" />
        </label>
        <div class={s.row}>
          <Button variant={props.variant} onClick={() => setDrafts((count) => count + 1)}>
            Save draft
          </Button>
          <Button variant={props.variant} type="submit" name="intent" value="publish">
            Publish reply
          </Button>
          <Button variant={props.variant} type="submit" disabled>
            Unavailable
          </Button>
        </div>
      </form>
      <Text role="status">
        Draft saves: {drafts()} · submissions: {submissions()} · submitter: {submitter()}
      </Text>
    </main>
  );
}

function ReactiveFixture() {
  const [variant, setVariant] = createSignal<ButtonVariant>("primary");
  const [updated, setUpdated] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);
  const [count, setCount] = createSignal(0);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Reactive props
      </Text>
      <label class={s.label}>
        Variant
        <select
          value={variant()}
          onChange={(event) => setVariant(event.currentTarget.value as ButtonVariant)}
        >
          <For each={variants}>{(value) => <option value={value}>{value}</option>}</For>
        </select>
      </label>
      <label class={s.label}>
        <input
          type="checkbox"
          checked={updated()}
          onChange={(event) => setUpdated(event.currentTarget.checked)}
        />
        Use updated label
      </label>
      <label class={s.label}>
        <input
          type="checkbox"
          checked={disabled()}
          onChange={(event) => setDisabled(event.currentTarget.checked)}
        />
        Disable button
      </label>
      <div>
        <Button
          variant={variant()}
          data-testid="reactive-button"
          class={updated() ? "updated-label" : "original-label"}
          classList={{ selected: updated() }}
          disabled={disabled()}
          onClick={() => setCount((count) => count + 1)}
        >
          {updated() ? "Send update" : "Publish reply"}
        </Button>
      </div>
      <Text role="status">Activations: {count()}</Text>
    </main>
  );
}

function LongLabelSpecimens() {
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-button-theme={theme}>
            <Text as="h2" variant="heading">
              {labels[theme]}
            </Text>
            <Text tone="secondary">
              Labels wrap within the available width, including long identifiers.
            </Text>
            <For each={variants}>
              {(variant) => (
                <section class={`${s.stack} ${s.narrow}`} data-button-variant={variant}>
                  <Text as="h3" variant="mono">
                    {variant}
                  </Text>
                  <div>
                    <Button variant={variant}>Publish this proposal and notify the group</Button>
                  </div>
                  <div>
                    <Button variant={variant}>
                      Publish_reply_abcdefghijklmnopqrstuvwxyz_1234567890
                    </Button>
                  </div>
                  <div>
                    <Button variant={variant} disabled>
                      Publish this proposal and notify the group
                    </Button>
                  </div>
                </section>
              )}
            </For>
          </article>
        )}
      </For>
    </main>
  );
}

function EnlargedButtons() {
  onMount(() => {
    const root = document.documentElement.style;
    const previous = root.getPropertyValue("font-size");
    const priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (previous) root.setProperty("font-size", previous, priority);
      else root.removeProperty("font-size");
    });
  });
  return <LongLabelSpecimens />;
}

type Args = ButtonProps & { theme: ColorTheme };
const meta = {
  title: "Primitives/Button",
  component: Button,
  render: (props) => {
    const [local, button] = splitProps(props, ["theme"]);
    return (
      <main class={`${colorThemes[local.theme]} ${s.frame}`}>
        <Button {...button} />
      </main>
    );
  },
  args: {
    theme: "cotton",
    variant: "primary",
    children: "Publish reply",
    disabled: false,
    type: "button",
  },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    variant: { control: "select", options: variants },
    children: { control: "text" },
    disabled: { control: "boolean" },
    type: { control: "select", options: ["button", "submit", "reset"] },
  },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    controls: { include: ["theme", "variant", "children", "disabled", "type"] },
    docs: {
      description: {
        component:
          "Primary and secondary Buttons, composed from the reviewed foundations. One regular size, native semantics, primary appearance and type=button by default. Try real hover, press, Tab, Enter, and Space in the browser.",
      },
    },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => (
    <main class={s.comparison}>
      <ThemeSpecimen theme="cotton" />
      <ThemeSpecimen theme="soot" />
    </main>
  ),
  parameters: { controls: { disable: true } },
  // A shared token edit can leave a stale dependent stylesheet during development.
  // Check the consumer's computed colors, not only that the new token specimens render.
  play: async ({ canvasElement, step }) => {
    const doc = canvasElement.ownerDocument;
    await doc.fonts.ready;
    if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
    const buttons = canvasElement.querySelectorAll<HTMLButtonElement>("button");
    await expect(buttons).toHaveLength(20);
    await step("Verify Button colors resolve from the current theme", async () => {
      for (const button of buttons) {
        const theme = button.closest<HTMLElement>("[data-button-theme]")!.dataset
          .buttonTheme as ColorTheme;
        const palette = colors[theme];
        const variant = button.closest<HTMLElement>("[data-button-variant]")!.dataset
          .buttonVariant as ButtonVariant;
        const disabled = button.matches(":disabled");
        const active = button.matches(":active");
        const hover = button.matches(":hover");
        const rendered = getComputedStyle(button);
        const background = new Color(rendered.backgroundColor);
        const text = new Color(rendered.color);
        const expectedBackground = new Color(
          disabled
            ? palette.action.disabled
            : variant === "primary"
              ? palette.action[active ? "fillPressed" : hover ? "fillHover" : "fill"]
              : active
                ? palette.action.pressed
                : hover
                  ? palette.action.hover
                  : "transparent",
        );
        await expect(background.alpha).toBeCloseTo(expectedBackground.alpha, 6);
        if (expectedBackground.alpha > 0)
          await expect(background.deltaEOK(expectedBackground)).toBeLessThan(0.0001);
        await expect(text.alpha).toBe(1);
        await expect(
          text.deltaEOK(
            disabled
              ? palette.text.disabled
              : variant === "primary"
                ? palette.action.onFill
                : palette.text.primary,
          ),
        ).toBeLessThan(0.0001);
        const expectedBorder = new Color(
          disabled || variant === "primary"
            ? "transparent"
            : active || hover
              ? palette.line.strong
              : palette.line.control,
        );
        for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
          const border = new Color(rendered[`border${side}Color`]);
          await expect(border.alpha).toBeCloseTo(expectedBorder.alpha, 6);
          if (expectedBorder.alpha > 0)
            await expect(border.deltaEOK(expectedBorder)).toBeLessThan(0.0001);
          await expect(rendered[`border${side}Style`]).toBe(
            variant === "secondary" ? "dashed" : "solid",
          );
          await expect(rendered[`border${side}Width`]).toBe("1px");
        }
        if (!disabled) {
          const surface = button.closest<HTMLElement>("[data-button-surface]")!;
          const backdrop = getComputedStyle(surface).backgroundColor;
          const effective = compositeOnSurface(rendered.backgroundColor, backdrop);
          await expect(text.contrastWCAG21(effective)).toBeGreaterThanOrEqual(4.5);
          if (variant === "secondary") {
            await expect(expectedBorder.contrastWCAG21(backdrop)).toBeGreaterThanOrEqual(3);
            await expect(expectedBorder.contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
          }
        }
        if (button.matches(":focus-visible")) {
          await expect(rendered.outlineStyle).toBe("solid");
          await expect(rendered.outlineWidth).toBe(focus.width);
          await expect(rendered.outlineOffset).toBe(focus.offset);
          await expect(new Color(rendered.outlineColor).deltaEOK(palette.focus.ring)).toBeLessThan(
            0.0001,
          );
        }
      }
    });
  },
} satisfies Story;
export const Playground = {} satisfies Story;
export const Activation = {
  render: (props) => <ActivationFixture variant={props.variant ?? "primary"} />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Publish reply" });
    const status = canvas.getByRole("status");
    await userEvent.click(button);
    await expect(status).toHaveTextContent("Activations: 1");
    await userEvent.keyboard("{Enter}");
    await expect(status).toHaveTextContent("Activations: 2");
    await userEvent.keyboard(" ");
    await expect(status).toHaveTextContent("Activations: 3");
    await userEvent.click(canvas.getByRole("button", { name: "Unavailable" }));
    await expect(status).toHaveTextContent("Activations: 3");
    button.focus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Reset counter" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Reset counter" }));
    await expect(status).toHaveTextContent("Activations: 0");
  },
} satisfies Story;
export const Forms = {
  render: (props) => <FormFixture variant={props.variant ?? "primary"} />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole("status");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(status).toHaveTextContent("Draft saves: 1 · submissions: 0 · submitter: none");
    await userEvent.click(canvas.getByRole("button", { name: "Publish reply" }));
    await expect(status).toHaveTextContent("submissions: 1 · submitter: intent=publish");
    await userEvent.click(canvas.getByRole("button", { name: "Unavailable" }));
    await expect(status).toHaveTextContent("submissions: 1");
  },
} satisfies Story;
export const ReactiveProps = {
  render: () => <ReactiveFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByTestId("reactive-button");
    const originalClass = button.className;
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Variant" }), "secondary");
    await expect(canvas.getByTestId("reactive-button")).toBe(button);
    await expect(button.className).not.toBe(originalClass);
    await expect(button).not.toHaveAttribute("variant");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Use updated label" }));
    await expect(canvas.getByRole("button", { name: "Send update" })).toBe(button);
    await expect(button).toHaveClass("updated-label", "selected");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable button" }));
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(canvas.getByRole("status")).toHaveTextContent("Activations: 0");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable button" }));
    await userEvent.click(button);
    await expect(canvas.getByRole("status")).toHaveTextContent("Activations: 1");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Use updated label" }));
    await expect(canvas.getByRole("button", { name: "Publish reply" })).toBe(button);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Variant" }), "primary");
    await expect(button.className).toBe(originalClass);
  },
} satisfies Story;
export const SecondaryActivation = {
  ...Activation,
  args: { variant: "secondary" },
} satisfies Story;
export const SecondaryForms = { ...Forms, args: { variant: "secondary" } } satisfies Story;
export const LongLabels = {
  render: () => <LongLabelSpecimens />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedButtons />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
} satisfies Story;
