import { For, Show, createSignal, createUniqueId, onCleanup, onMount, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { Input, type InputProps, type InputType } from "@amends/frontend/primitives/input";
import { Button } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { radius } from "@amends/frontend/foundations/radius";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./input.stories.css.ts";

const themes = ["cotton", "soot"] as const;
const types = [
  "text",
  "email",
  "password",
  "search",
  "tel",
  "url",
] as const satisfies readonly InputType[];
// Workshop association only; production Input renders a single input with caller-owned attributes.
function Sample(props: InputProps & { label: string; help?: string }) {
  const id = createUniqueId();
  const [local, input] = splitProps(props, ["label", "help"]);
  return (
    <div class={s.field}>
      <label class={s.field}>
        <Text as="span">{local.label}</Text>
        <Input {...input} aria-describedby={local.help ? id : undefined} />
      </label>
      <Show when={local.help}>
        <Text id={id} tone="secondary">
          {local.help}
        </Text>
      </Show>
    </div>
  );
}
function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-input-theme={theme}>
            <Text as="h2" variant="heading">
              {theme === "cotton" ? "Cotton" : "Soot"}
            </Text>
            <For each={["canvas", "panel"] as const}>
              {(surface) => (
                <section
                  class={`${s.surface} ${s.stack}`}
                  data-input-surface={surface}
                  style={{ "background-color": colorVars.surface[surface] }}
                >
                  <Text as="h3">On surface.{surface}</Text>
                  <Sample label="Empty" placeholder="Enter a title" />
                  <Sample label="Filled" value="Proposal for the team" />
                  <Sample label="Read-only" value="Workspace reference" readOnly />
                  <Sample label="Disabled" value="Unavailable" disabled />
                  <Sample label="Disabled placeholder" placeholder="Unavailable" disabled />
                  <Sample
                    label="Invalid email"
                    type="email"
                    value="not-an-email"
                    aria-invalid="true"
                    help="Enter a complete email address."
                  />
                </section>
              )}
            </For>
            <form>
              <fieldset disabled class={`${s.fieldset} ${s.stack}`}>
                <legend>
                  <Text as="span">Disabled fieldset</Text>
                </legend>
                <Sample label="Inherited disabled" name="inherited" value="Unavailable" />
              </fieldset>
            </form>
          </article>
        )}
      </For>
    </main>
  );
}
function EditingFixture() {
  const [value, setValue] = createSignal("Proposal");
  const [readonly, setReadonly] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Editing
      </Text>
      <Sample
        label="Title"
        value={value()}
        onInput={(event) => setValue(event.currentTarget.value)}
        readOnly={readonly()}
        disabled={disabled()}
      />
      <Text role="status">Value: {value()}</Text>
      <div class={s.row}>
        <Button onClick={() => setValue("Updated proposal")}>Set value</Button>
        <Button variant="secondary" onClick={() => setValue("")}>
          Clear
        </Button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={readonly()}
          onChange={(event) => setReadonly(event.currentTarget.checked)}
        />{" "}
        Read-only
      </label>
      <label>
        <input
          type="checkbox"
          checked={disabled()}
          onChange={(event) => setDisabled(event.currentTarget.checked)}
        />{" "}
        Disabled
      </label>
    </main>
  );
}
function FormFixture() {
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal(false);
  const [result, setResult] = createSignal("No submission yet.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Native validation and form data
      </Text>
      <Text>
        The form chooses when to show an error. Input forwards native validity and association
        attributes.
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const recipient = data.get("recipient"),
            workspace = data.get("workspace");
          setResult(
            `Recipient: ${typeof recipient === "string" ? recipient : ""} · workspace: ${typeof workspace === "string" ? workspace : ""} · disabled included: ${data.has("disabled")}`,
          );
        }}
        onReset={(event) => {
          event.preventDefault();
          setEmail("");
          setError(false);
          setResult("No submission yet.");
        }}
      >
        <Sample
          label="Recipient email (required)"
          type="email"
          name="recipient"
          autocomplete="email"
          required
          value={email()}
          aria-invalid={error() || undefined}
          help={
            error()
              ? "Enter a complete email address."
              : "We will use this address for the invitation."
          }
          onInvalid={() => setError(true)}
          onInput={(event) => {
            setEmail(event.currentTarget.value);
            setError(false);
          }}
        />
        <Sample label="Workspace" name="workspace" value="Design team" readOnly />
        <Sample label="Unavailable field" name="disabled" value="excluded" disabled />
        <div class={s.row}>
          <Button type="submit">Submit</Button>
          <Button variant="secondary" type="reset">
            Reset
          </Button>
        </div>
      </form>
      <Text role="status">{result()}</Text>
    </main>
  );
}
function TypeSpecimens() {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <For each={types}>
              {(type) => <Sample label={type} type={type} placeholder={`Enter ${type}`} />}
            </For>
          </section>
        )}
      </For>
    </main>
  );
}
function LongContent(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style;
    const before = root.getPropertyValue("font-size"),
      priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (before) root.setProperty("font-size", before, priority);
      else root.removeProperty("font-size");
    });
  });
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <div class={`${s.narrow} ${s.stack}`}>
              <Sample
                label="A longer label that wraps without widening the input"
                value="A very long proposal title that remains editable by scrolling inside the native single-line input"
              />
              <Sample
                label="Long placeholder"
                placeholder="A placeholder does not replace the visible label"
              />
              <Sample
                label="Read-only reference"
                readOnly
                value="workspace_abcdefghijklmnopqrstuvwxyz_1234567890"
              />
            </div>
          </section>
        )}
      </For>
    </main>
  );
}

type Args = InputProps & { theme: ColorTheme; label: string };
const meta = {
  title: "Primitives/Input",
  component: Input,
  render: (props) => {
    const [local, input] = splitProps(props, ["theme", "label"]);
    return (
      <main class={`${colorThemes[local.theme]} ${s.frame}`}>
        <Sample {...input} label={local.label} />
      </main>
    );
  },
  args: {
    theme: "cotton",
    label: "Title",
    type: "text",
    placeholder: "Enter a title",
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    theme: { control: "select", options: themes },
    type: { control: "select", options: types },
    label: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
  },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    controls: { include: ["theme", "type", "label", "placeholder", "disabled", "readOnly"] },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await doc.fonts.ready;
    const inputs = canvasElement.querySelectorAll("input");
    await expect(inputs).toHaveLength(26);
    for (const form of canvasElement.querySelectorAll("form")) {
      await expect(new FormData(form).has("inherited")).toBe(false);
    }
    if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
    for (const input of inputs) {
      const theme = input.closest<HTMLElement>("[data-input-theme]")!.dataset
        .inputTheme as ColorTheme;
      const palette = colors[theme],
        style = getComputedStyle(input);
      const disabled = input.matches(":disabled"),
        invalid = input.getAttribute("aria-invalid") === "true";
      const border = disabled
        ? palette.line.control
        : invalid
          ? palette.line.invalid
          : input.matches(":focus")
            ? palette.line.strong
            : palette.line.control;
      await expect(
        new Color(style.color).deltaEOK(disabled ? palette.text.disabled : palette.text.primary),
      ).toBeLessThan(0.0001);
      await expect(new Color(style.borderTopColor).deltaEOK(border)).toBeLessThan(0.0001);
      await expect(style.borderTopStyle).toBe("dashed");
      await expect(style.borderRadius).toBe(radius.medium);
      const background = new Color(style.backgroundColor),
        expected = new Color(disabled ? palette.action.disabled : "transparent");
      await expect(background.alpha).toBeCloseTo(expected.alpha, 6);
      if (disabled) await expect(background.deltaEOK(expected)).toBeLessThan(0.0001);
      if (input.hasAttribute("placeholder")) {
        const placeholder = getComputedStyle(input, "::placeholder");
        await expect(
          new Color(placeholder.color).deltaEOK(
            disabled ? palette.text.disabled : palette.text.secondary,
          ),
        ).toBeLessThan(0.0001);
        await expect(placeholder.opacity).toBe("1");
      }
      await expect(style.opacity).toBe("1");
      await expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
} satisfies Story;
export const Playground = {} satisfies Story;
export const Types = {
  render: () => <TypeSpecimens />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const Editing = {
  render: () => <EditingFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Title" });
    await userEvent.clear(input);
    await userEvent.type(input, "Team proposal");
    await expect(canvas.getByRole("status")).toHaveTextContent("Value: Team proposal");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Read-only" }));
    await userEvent.type(input, " ignored");
    await expect(input).toHaveValue("Team proposal");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Read-only" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disabled" }));
    await expect(input).toBeDisabled();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disabled" }));
    await userEvent.click(canvas.getByRole("button", { name: "Set value" }));
    await expect(input).toHaveValue("Updated proposal");
    await expect(canvas.getByRole("textbox", { name: "Title" })).toBe(input);
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(input).toHaveValue("");
  },
} satisfies Story;
export const Forms = {
  render: () => <FormFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Recipient email (required)" });
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("Enter a complete email address.");
    await userEvent.type(input, "member@example.com");
    await expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Recipient: member@example.com · workspace: Design team · disabled included: false",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(input).toHaveValue("");
    await expect(canvas.getByRole("status")).toHaveTextContent("No submission yet.");
  },
} satisfies Story;
export const LongContentStory = {
  name: "Long Content",
  render: () => <LongContent />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <LongContent enlarged />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
} satisfies Story;
