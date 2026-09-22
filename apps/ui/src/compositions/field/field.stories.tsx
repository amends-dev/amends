import { For, createSignal, createUniqueId, onCleanup, onMount, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { Field, type FieldProps } from "@amends/ui/compositions/field";
import { Input } from "@amends/ui/primitives/input";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { colors, type ColorTheme } from "@amends/ui/foundations/color";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./field.stories.css.ts";

const themes = ["cotton", "soot"] as const;
function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-field-theme={theme}>
            <Text as="h2" variant="heading">
              {theme === "cotton" ? "Cotton" : "Soot"}
            </Text>
            <For each={["canvas", "panel"] as const}>
              {(surface) => (
                <section
                  class={`${s.surface} ${s.stack}`}
                  style={{ "background-color": colorVars.surface[surface] }}
                  data-field-surface={surface}
                >
                  <Text as="h3">On surface.{surface}</Text>
                  <Field label="Name">
                    {(control) => <Input placeholder="Display name" {...control} />}
                  </Field>
                  <Field label="Address" description="Use the address you sign in with.">
                    {(control) => <Input type="email" {...control} />}
                  </Field>
                  <Field
                    label="Recipient"
                    description="We will send an invitation to this address."
                    required
                  >
                    {(control) => <Input type="email" {...control} />}
                  </Field>
                  <Field
                    label="Invitation email"
                    description="One address is one identity."
                    error="Enter a complete email address."
                    required
                  >
                    {(control) => <Input type="email" value="incomplete" {...control} />}
                  </Field>
                  <Field
                    label="Disabled"
                    description="You do not have permission to edit this value."
                    disabled
                  >
                    {(control) => <Input value="member@example.com" {...control} />}
                  </Field>
                  <Field
                    label="Disabled with error"
                    description="Resolve the workspace restriction before retrying."
                    error="This address could not be invited."
                    disabled
                  >
                    {(control) => <Input value="member@example.com" {...control} />}
                  </Field>
                </section>
              )}
            </For>
          </article>
        )}
      </For>
    </main>
  );
}
function ReactiveFixture() {
  const [error, setError] = createSignal(false),
    [help, setHelp] = createSignal(true);
  const [required, setRequired] = createSignal(false),
    [disabled, setDisabled] = createSignal(false);
  const external = createUniqueId();
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Reactive associations
      </Text>
      <Text id={external}>External workspace context.</Text>
      <Field
        label="Email"
        controlDescribedBy={external}
        description={help() ? "Use a work address." : undefined}
        error={error() ? "This address is already invited." : undefined}
        required={required()}
        disabled={disabled()}
      >
        {(control) => <Input {...control} />}
      </Field>
      <label>
        <input
          type="checkbox"
          checked={help()}
          onChange={(event) => setHelp(event.currentTarget.checked)}
        />{" "}
        Show help
      </label>
      <label>
        <input
          type="checkbox"
          checked={error()}
          onChange={(event) => setError(event.currentTarget.checked)}
        />{" "}
        Show error
      </label>
      <label>
        <input
          type="checkbox"
          checked={required()}
          onChange={(event) => setRequired(event.currentTarget.checked)}
        />{" "}
        Required
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
  const [value, setValue] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [result, setResult] = createSignal("Ready.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Caller-owned validation
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          if (value() === "existing@example.com") {
            setError("This address is already invited.");
            setResult("Resolve the field error and retry.");
          } else {
            setError(undefined);
            setResult(`Submitted ${value()}.`);
          }
        }}
        onReset={(event) => {
          event.preventDefault();
          setValue("");
          setError(undefined);
          setResult("Ready.");
        }}
      >
        <Field
          label="Recipient email"
          description="Use the person's work address."
          required
          error={error()}
        >
          {(control) => (
            <Input
              type="email"
              name="recipient"
              autocomplete="email"
              value={value()}
              onInput={(event) => {
                setValue(event.currentTarget.value);
                setError(undefined);
              }}
              onInvalid={() => setError("Enter a complete email address.")}
              {...control}
            />
          )}
        </Field>
        <div class={s.row}>
          <Button type="submit">Submit</Button>
          <Button type="reset" variant="secondary">
            Reset
          </Button>
        </div>
      </form>
      <Text role="status">{result()}</Text>
    </main>
  );
}
function LongContent(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style,
      before = root.getPropertyValue("font-size"),
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
            <Field
              label="The email address associated with your workspace account"
              description="An invitation is sent to this address. Verify the address before trying again."
              error="We could not invite workspace_abcdefghijklmnopqrstuvwxyz_1234567890. Check the address and retry."
              required
            >
              {(control) => <Input type="email" value="member@example.com" {...control} />}
            </Field>
          </section>
        )}
      </For>
    </main>
  );
}

type Args = Omit<FieldProps, "children"> & { theme: ColorTheme; value: string };
const meta = {
  title: "Compositions/Field",
  render: (props) => {
    const [local, field] = splitProps(props, ["theme", "value"]);
    return (
      <main class={`${colorThemes[local.theme]} ${s.frame}`}>
        <Field {...field}>{(control) => <Input value={local.value} {...control} />}</Field>
      </main>
    );
  },
  args: {
    theme: "cotton",
    label: "Email",
    description: "Use your work address.",
    error: "",
    required: false,
    disabled: false,
    value: "",
  },
  argTypes: {
    theme: { control: "select", options: themes },
    label: { control: "text" },
    description: { control: "text" },
    error: { control: "text" },
    value: { control: "text" },
    required: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  parameters: {
    layout: "fullscreen" as const,
    controls: {
      include: ["theme", "label", "description", "error", "required", "disabled", "value"],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await doc.fonts.ready;
    const inputs = [...canvasElement.querySelectorAll("input")];
    await expect(inputs).toHaveLength(24);
    await expect(new Set(inputs.map((input) => input.id)).size).toBe(inputs.length);
    for (const input of inputs) {
      const field = input.parentElement!,
        label = field.querySelector("label")!;
      await expect(label.htmlFor).toBe(input.id);
      await expect(input.labels?.length).toBe(1);
      const rootSize = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize);
      const description = doc.getElementById(`${input.id}-description`);
      const error = doc.getElementById(`${input.id}-error`);
      await expect(getComputedStyle(label).fontFamily).toContain("IBM Plex Mono");
      await expect(Number.parseFloat(getComputedStyle(label).fontSize)).toBeCloseTo(
        (rootSize * 10.5) / 16,
        2,
      );
      await expect(getComputedStyle(label).textTransform).toBe("uppercase");
      if (description) {
        await expect(getComputedStyle(description).fontFamily).toContain("IBM Plex Mono");
        await expect(Number.parseFloat(getComputedStyle(description).fontSize)).toBeCloseTo(
          (rootSize * 11) / 16,
          2,
        );
      }
      if (error) {
        await expect(getComputedStyle(error).fontFamily).toContain("IBM Plex Sans");
        await expect(Number.parseFloat(getComputedStyle(error).fontSize)).toBeCloseTo(
          (rootSize * 12.5) / 16,
          2,
        );
        await expect(error.firstElementChild).toHaveAttribute("aria-hidden", "true");
      }
      for (const id of input.getAttribute("aria-describedby")?.split(" ") ?? [])
        await expect(doc.getElementById(id)).not.toBeNull();
      if (!doc.defaultView!.matchMedia("(forced-colors: active)").matches) {
        const theme = input.closest<HTMLElement>("[data-field-theme]")!.dataset
          .fieldTheme as ColorTheme;
        const surface = getComputedStyle(input.closest("[data-field-surface]")!).backgroundColor;
        for (const text of [label, description].filter((node) => node !== null)) {
          const color = new Color(getComputedStyle(text).color);
          await expect(color.deltaEOK(colors[theme].text.secondary)).toBeLessThan(0.0001);
          await expect(color.contrastWCAG21(surface)).toBeGreaterThanOrEqual(4.5);
        }
        if (error) {
          const color = new Color(getComputedStyle(error).color);
          await expect(color.deltaEOK(colors[theme].text.invalid)).toBeLessThan(0.0001);
          await expect(color.contrastWCAG21(surface)).toBeGreaterThanOrEqual(4.5);
          const dotColor = new Color(getComputedStyle(error.firstElementChild!).backgroundColor);
          await expect(dotColor.deltaEOK(colors[theme].status.danger.indicator)).toBeLessThan(
            0.0001,
          );
        }
        await expect(getComputedStyle(field).rowGap).toBe("8px");
      }
    }
  },
} satisfies Story;
export const Playground = {} satisfies Story;
export const Reference = {
  parameters: { controls: { include: ["theme"] } },
  render: (args) => (
    <main class={`${colorThemes[args.theme]} ${s.frame}`}>
      <section
        class={`${s.surface} ${s.stack}`}
        style={{ "max-width": "28rem", "background-color": colorVars.surface.panel }}
      >
        <Field label="Task title">
          {(control) => <Input placeholder="What needs doing?" {...control} />}
        </Field>
        <Field label="Vault secret" description="last used 3h ago · never echoed">
          {(control) => <Input type="password" value="example-token" readOnly {...control} />}
        </Field>
        <Field
          label="Error · type anything but a date"
          error="Not a date the workspace understands."
        >
          {(control) => <Input value="friday" {...control} />}
        </Field>
      </section>
    </main>
  ),
} satisfies Story;
export const ReactiveAssociations = {
  render: () => <ReactiveFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Email" });
    await userEvent.click(canvas.getByText("Email", { selector: "label" }));
    await expect(input).toHaveFocus();
    await userEvent.type(input, "member@example.com");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show error" }));
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      "External workspace context. Use a work address. Error: This address is already invited.",
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: "Required" }));
    await expect(input).toBeRequired();
    await expect(input).toHaveAccessibleName("Email");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show help" }));
    await expect(input).toHaveAccessibleDescription(
      "External workspace context. Error: This address is already invited.",
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disabled" }));
    await expect(input).toBeDisabled();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disabled" }));
    await expect(input).not.toBeDisabled();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show error" }));
    await expect(input).not.toHaveAttribute("aria-invalid");
    await expect(input).toHaveAccessibleDescription("External workspace context.");
    await expect(canvas.getByRole("textbox", { name: "Email" })).toBe(input);
    await expect(input).toHaveValue("member@example.com");
  },
} satisfies Story;
export const Forms = {
  render: () => <FormFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Recipient email" });
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      "Use the person's work address. Error: Enter a complete email address.",
    );
    await userEvent.type(input, "existing@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(input).toHaveAccessibleDescription(
      "Use the person's work address. Error: This address is already invited.",
    );
    await userEvent.clear(input);
    await userEvent.type(input, "new@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(input).not.toHaveAttribute("aria-invalid");
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted new@example.com.");
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(input).toHaveValue("");
    await expect(canvas.getByRole("status")).toHaveTextContent("Ready.");
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
