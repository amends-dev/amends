import { For, createSignal, onCleanup, onMount, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonTone,
} from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { focus } from "@amends/frontend/foundations/focus";
import { compositeOnSurface } from "../../foundations/color/contrast.ts";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./button.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const variants = ["primary", "secondary", "ghost"] as const;
const actionLabels = { primary: "Publish reply", secondary: "Save draft", ghost: "Change email" };

function ThemeSpecimen(props: { theme: ColorTheme; pending?: boolean; tone?: ButtonTone }) {
  const [count, setCount] = createSignal(0);
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-button-theme={props.theme}
      data-button-tone={props.tone ?? "neutral"}
      aria-label={`${labels[props.theme]} buttons`}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      <Text tone="secondary">
        {props.pending
          ? "Publishing… These controlled pending examples keep their labels and remain focusable. Activation is blocked."
          : "Hover, press, or use Tab to inspect all three variants. Click, Enter, and Space activate them."}
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
                    <Button
                      variant={variant}
                      tone={props.tone}
                      pending={props.pending}
                      onClick={() => setCount((count) => count + 1)}
                    >
                      {props.tone === "danger" ? "Delete thread" : actionLabels[variant]}
                    </Button>
                    <Button
                      variant={variant}
                      tone={props.tone}
                      pending={props.pending}
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
                tone={props.tone}
                pending={props.pending}
                data-button-variant={variant}
                onClick={() => setCount((count) => count + 1)}
              >
                {props.tone === "danger" ? "Delete thread" : actionLabels[variant]}
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

const pendingCopy = {
  neutral: {
    label: "Publish reply",
    ready: "Ready to publish.",
    busy: "Publishing…",
    success: "Reply published.",
    failure: "Could not publish. Try again.",
  },
  danger: {
    label: "Delete thread",
    ready: "Ready to delete.",
    busy: "Deleting…",
    success: "Thread deleted.",
    failure: "Could not delete. Try again.",
  },
} as const;
function PendingFixture(props: { variant: ButtonVariant; tone?: ButtonTone }) {
  const copy = () => pendingCopy[props.tone ?? "neutral"];
  const [pending, setPending] = createSignal(false);
  const [attempts, setAttempts] = createSignal(0);
  const [outcome, setOutcome] = createSignal<"ready" | "success" | "failure">("ready");
  const finish = (message: "success" | "failure") => {
    setPending(false);
    setOutcome(message);
  };
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Pending and recovery
      </Text>
      <Text tone="secondary">
        Start and resolve the simulated operation. The form owns the work and the status message.
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          // The form also guards direct submissions that bypass a button click.
          if (pending()) return;
          setAttempts((count) => count + 1);
          setPending(true);
        }}
      >
        <label class={s.label}>
          Item title
          <input class={s.input} name="title" value="Proposal" />
        </label>
        <div>
          <Button
            variant={props.variant}
            tone={props.tone}
            type="submit"
            pending={pending()}
            aria-describedby="publication-status"
          >
            {copy().label}
          </Button>
        </div>
      </form>
      <Text
        id="publication-status"
        role="status"
        tone={
          pending()
            ? "inherit"
            : outcome() === "failure"
              ? "danger"
              : outcome() === "success"
                ? "success"
                : "secondary"
        }
      >
        {pending() ? copy().busy : copy()[outcome()]}
      </Text>
      <Text>Attempts: {attempts()}</Text>
      <div class={s.row}>
        <Button variant="secondary" disabled={!pending()} onClick={() => finish("success")}>
          Complete successfully
        </Button>
        <Button variant="secondary" disabled={!pending()} onClick={() => finish("failure")}>
          Simulate failure
        </Button>
      </div>
    </main>
  );
}

function LongLabelSpecimens(props: { pending?: boolean; tone?: ButtonTone }) {
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
                    <Button variant={variant} tone={props.tone} pending={props.pending}>
                      {props.tone === "danger"
                        ? "Delete this thread and all of its messages"
                        : "Publish this proposal and notify the group"}
                    </Button>
                  </div>
                  <div>
                    <Button variant={variant} tone={props.tone} pending={props.pending}>
                      {props.tone === "danger"
                        ? "Delete_thread_abcdefghijklmnopqrstuvwxyz_1234567890"
                        : "Publish_reply_abcdefghijklmnopqrstuvwxyz_1234567890"}
                    </Button>
                  </div>
                  <div>
                    <Button variant={variant} tone={props.tone} pending={props.pending} disabled>
                      {props.tone === "danger"
                        ? "Delete this thread and all of its messages"
                        : "Publish this proposal and notify the group"}
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

function EnlargedButtons(props: { pending?: boolean; tone?: ButtonTone }) {
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
  return <LongLabelSpecimens pending={props.pending} tone={props.tone} />;
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
    tone: "neutral",
    children: "Publish reply",
    disabled: false,
    pending: false,
    type: "button",
  },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    variant: { control: "select", options: variants },
    tone: { control: "select", options: ["neutral", "danger"] },
    children: { control: "text" },
    disabled: { control: "boolean" },
    pending: { control: "boolean" },
    type: { control: "select", options: ["button", "submit", "reset"] },
  },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    controls: { include: ["theme", "variant", "tone", "children", "disabled", "pending", "type"] },
    docs: {
      description: {
        component:
          "Primary, secondary, and ghost Buttons, composed from the reviewed foundations. One regular size, native semantics, primary appearance and type=button by default. Try real hover, press, Tab, Enter, and Space in the browser.",
      },
    },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: (props) => (
    <main class={s.comparison}>
      <ThemeSpecimen theme="cotton" tone={props.tone} />
      <ThemeSpecimen theme="soot" tone={props.tone} />
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
    await expect(buttons).toHaveLength(30);
    await step("Verify Button colors resolve from the current theme", async () => {
      for (const button of buttons) {
        const theme = button.closest<HTMLElement>("[data-button-theme]")!.dataset
          .buttonTheme as ColorTheme;
        const palette = colors[theme];
        const tone = button.closest<HTMLElement>("[data-button-tone]")!.dataset.buttonTone;
        const action =
          tone === "danger"
            ? palette.action.danger
            : {
                ...palette.action,
                text: palette.text.primary,
                border: palette.line.control,
                borderStrong: palette.line.strong,
              };
        const variant = button.closest<HTMLElement>("[data-button-variant]")!.dataset
          .buttonVariant as ButtonVariant;
        const disabled = button.matches(":disabled");
        const pending = button.dataset.pending === "true";
        const active = !pending && button.matches(":active");
        const hover = !pending && button.matches(":hover");
        const rendered = getComputedStyle(button);
        if (pending) {
          await expect(button).toHaveAttribute("aria-busy", "true");
          await expect(button).toHaveAttribute("aria-disabled", "true");
          const indicator = button.querySelector("svg")!;
          await expect(indicator).toHaveAttribute("aria-hidden", "true");
          const path = getComputedStyle(indicator.querySelector("rect")!);
          await expect(new Color(path.stroke).deltaEOK(rendered.color)).toBeLessThan(0.0001);
          const reduced = doc.defaultView!.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduced) await expect(path.animationName).toBe("none");
          else {
            await expect(path.animationName).not.toBe("none");
            await expect(path.animationDuration).toBe("2.6s");
          }
          await expect(rendered.cursor).toBe(disabled ? "not-allowed" : "progress");
        }
        const background = new Color(rendered.backgroundColor);
        const text = new Color(rendered.color);
        const expectedBackground = new Color(
          disabled
            ? palette.action.disabled
            : variant === "primary"
              ? action[active ? "fillPressed" : hover ? "fillHover" : "fill"]
              : active
                ? action.pressed
                : hover
                  ? action.hover
                  : "transparent",
        );
        await expect(background.alpha).toBeCloseTo(expectedBackground.alpha, 6);
        if (expectedBackground.alpha > 0)
          await expect(background.deltaEOK(expectedBackground)).toBeLessThan(0.0001);
        await expect(text.alpha).toBe(1);
        await expect(
          text.deltaEOK(
            disabled ? palette.text.disabled : variant === "primary" ? action.onFill : action.text,
          ),
        ).toBeLessThan(0.0001);
        const expectedBorder = new Color(
          disabled || variant !== "secondary"
            ? "transparent"
            : active || hover
              ? action.borderStrong
              : action.border,
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
    const secondaryClass = button.className;
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Variant" }), "ghost");
    await expect(canvas.getByTestId("reactive-button")).toBe(button);
    await expect(button.className).not.toBe(originalClass);
    await expect(button.className).not.toBe(secondaryClass);
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
export const GhostActivation = { ...Activation, args: { variant: "ghost" } } satisfies Story;
export const GhostForms = { ...Forms, args: { variant: "ghost" } } satisfies Story;
export const LongLabels = {
  render: () => <LongLabelSpecimens />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedButtons />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
} satisfies Story;

export const PendingComparison = {
  ...Comparison,
  render: (props) => (
    <main class={s.comparison}>
      <ThemeSpecimen theme="cotton" tone={props.tone} pending />
      <ThemeSpecimen theme="soot" tone={props.tone} pending />
    </main>
  ),
} satisfies Story;
// Keep the stitch circular at its ends when labels make the button taller than it is wide.
async function verifyPendingLayout(canvasElement: HTMLElement) {
  const doc = canvasElement.ownerDocument;
  await doc.fonts.ready;
  await new Promise<void>((resolve) =>
    doc.defaultView!.requestAnimationFrame(() =>
      doc.defaultView!.requestAnimationFrame(() => resolve()),
    ),
  );
  for (const button of canvasElement.querySelectorAll<HTMLButtonElement>("button")) {
    const indicator = button.querySelector("svg")!;
    const path = indicator.querySelector("rect")!;
    const radius = Math.min(indicator.clientWidth, indicator.clientHeight) / 2;
    await expect(radius).toBeGreaterThan(0);
    await expect(Number(path.getAttribute("rx"))).toBe(radius);
    await expect(Number(path.getAttribute("ry"))).toBe(radius);
    await expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth);
    await expect(button.scrollHeight).toBeLessThanOrEqual(button.clientHeight);
    const bounds = button.getBoundingClientRect();
    const strokeBounds = indicator.getBoundingClientRect();
    await expect(strokeBounds.left).toBeGreaterThan(bounds.left);
    await expect(strokeBounds.right).toBeLessThan(bounds.right);
    await expect(strokeBounds.top).toBeGreaterThan(bounds.top);
    await expect(strokeBounds.bottom).toBeLessThan(bounds.bottom);
  }
}

export const PendingLongLabels = {
  ...LongLabels,
  render: () => <LongLabelSpecimens pending />,
  play: ({ canvasElement }) => verifyPendingLayout(canvasElement),
} satisfies Story;
export const PendingEnlargedText = {
  ...EnlargedText,
  render: () => <EnlargedButtons pending />,
  play: ({ canvasElement }) => verifyPendingLayout(canvasElement),
} satisfies Story;

export const Pending = {
  render: (props) => <PendingFixture variant={props.variant ?? "primary"} tone={props.tone} />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement, args }) => {
    const copy = pendingCopy[args.tone ?? "neutral"];
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: copy.label });
    const status = canvas.getByRole("status");
    await userEvent.click(button);
    await expect(button).toHaveFocus();
    await expect(button).not.toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(status).toHaveTextContent(copy.busy);
    await userEvent.click(button);
    await userEvent.keyboard("{Enter} ");
    await expect(canvas.getByText("Attempts: 1")).toBeInTheDocument();
    await expect(button).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Complete successfully" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(button).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Complete successfully" }));
    await expect(status).toHaveTextContent(copy.success);
    await expect(button).not.toHaveAttribute("aria-busy");
    await expect(button).not.toHaveAttribute("aria-disabled");
    await expect(canvas.getByRole("button", { name: copy.label })).toBe(button);
    await userEvent.click(button);
    await expect(canvas.getByText("Attempts: 2")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Simulate failure" }));
    await expect(status).toHaveTextContent(copy.failure);
    await userEvent.click(button);
    await expect(canvas.getByText("Attempts: 3")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Complete successfully" }));
    await expect(status).toHaveTextContent(copy.success);
  },
} satisfies Story;
export const SecondaryPending = { ...Pending, args: { variant: "secondary" } } satisfies Story;
export const GhostPending = { ...Pending, args: { variant: "ghost" } } satisfies Story;
export const DangerPending = { ...Pending, args: { tone: "danger" } } satisfies Story;
export const DangerSecondaryPending = {
  ...Pending,
  args: { tone: "danger", variant: "secondary" },
} satisfies Story;
export const DangerGhostPending = {
  ...Pending,
  args: { tone: "danger", variant: "ghost" },
} satisfies Story;

export const DangerComparison = { ...Comparison, args: { tone: "danger" } } satisfies Story;
export const DangerPendingComparison = {
  ...PendingComparison,
  args: { tone: "danger" },
} satisfies Story;
export const DangerLongLabels = {
  ...LongLabels,
  render: () => <LongLabelSpecimens tone="danger" />,
} satisfies Story;
export const DangerEnlargedText = {
  ...EnlargedText,
  render: () => <EnlargedButtons tone="danger" pending />,
  play: ({ canvasElement }) => verifyPendingLayout(canvasElement),
} satisfies Story;
