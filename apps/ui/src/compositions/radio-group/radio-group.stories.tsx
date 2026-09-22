import { For, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { colors } from "@amends/ui/foundations/color";
import { compositeOnSurface } from "../../foundations/color/contrast.ts";
import { RadioGroup, type RadioOption } from "@amends/ui/compositions/radio-group";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import type { ColorTheme } from "@amends/ui/foundations/color";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./radio-group.stories.css.ts";

const choices: readonly RadioOption[] = [
  { value: "7", label: "7 days", description: "A short review window." },
  { value: "14", label: "14 days", description: "Unavailable in this workspace.", disabled: true },
  { value: "30", label: "30 days", description: "More time to respond." },
];
function Example(props: {
  variant: "plain" | "card";
  label?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  empty?: boolean;
}) {
  const [value, setValue] = createSignal<string | undefined>(props.empty ? undefined : "7");
  return (
    <RadioGroup
      data-group-variant={props.variant}
      label={props.label ?? "Expiration"}
      description="Choose how long the invitation remains available."
      variant={props.variant}
      options={choices}
      value={value()}
      onValueChange={setValue}
      disabled={props.disabled}
      required={props.required}
      error={props.error}
    />
  );
}
function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-group-theme={theme}>
            <Text as="h2" variant="heading">
              {theme === "cotton" ? "Cotton" : "Soot"}
            </Text>
            <For each={["canvas", "panel"] as const}>
              {(surface) => (
                <section
                  class={`${s.surface} ${s.stack}`}
                  data-group-surface={surface}
                  style={{ "background-color": colorVars.surface[surface] }}
                >
                  <Text as="h3">On surface.{surface}</Text>
                  <Example label="Plain choices" variant="plain" />
                  <Example label="Card choices" variant="card" />
                </section>
              )}
            </For>
          </article>
        )}
      </For>
    </main>
  );
}
function StateSpecimens() {
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-group-theme={theme}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <Example
              label="Required selection"
              variant="card"
              required
              empty
              error="Choose a duration before continuing."
            />
            <Example label="Disabled group" variant="card" disabled />
            <RadioGroup
              label="No options"
              description="No roles are available to assign."
              variant="card"
              value={undefined}
              onValueChange={() => {}}
              options={[]}
            />
          </section>
        )}
      </For>
    </main>
  );
}
function InteractionFixture(props: { variant: "plain" | "card" }) {
  const [value, setValue] = createSignal<string | undefined>("7"),
    [changes, setChanges] = createSignal(0);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Selection
      </Text>
      <RadioGroup
        label="Expires"
        variant={props.variant}
        value={value()}
        options={choices}
        onValueChange={(next) => {
          setValue(next);
          setChanges((count) => count + 1);
        }}
      />
      <Text role="status">
        Selected: {value()} · changes: {changes()}
      </Text>
      <Button
        variant="secondary"
        onClick={() => {
          setValue("7");
          setChanges(0);
        }}
      >
        Reset selection
      </Button>
    </main>
  );
}
function FormFixture(props: { variant: "plain" | "card" }) {
  const [value, setValue] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [result, setResult] = createSignal("Ready.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Caller-owned form validation and reset
      </Text>
      <form
        noValidate
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          if (!event.currentTarget.checkValidity()) {
            setError("Choose a duration.");
            event.currentTarget.querySelector<HTMLInputElement>("input:invalid")?.focus();
            return;
          }
          const selected = new FormData(event.currentTarget).get("duration");
          setResult(`Submitted: ${typeof selected === "string" ? selected : "none"}`);
        }}
        onReset={(event) => {
          event.preventDefault();
          setValue(undefined);
          setError(undefined);
          setResult("Ready.");
        }}
      >
        <RadioGroup
          label="Expires"
          name="duration"
          variant={props.variant}
          required
          description="Choose one duration."
          error={error()}
          value={value()}
          options={choices}
          onValueChange={(next) => {
            setValue(next);
            setError(undefined);
          }}
        />
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
function RefreshedOptionsFixture() {
  const [options, setOptions] = createSignal(choices),
    [value, setValue] = createSignal<string | undefined>("7");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Refreshed options
      </Text>
      <RadioGroup
        label="Expires"
        variant="card"
        value={value()}
        onValueChange={setValue}
        options={options()}
      />
      <Button
        onClick={() =>
          setOptions(
            choices.map((option) => ({
              ...option,
              description: "Updated availability information.",
            })),
          )
        }
      >
        Refresh options
      </Button>
    </main>
  );
}
function ExternalFormFixture() {
  const formId = createUniqueId();
  const [value, setValue] = createSignal<string | undefined>("7");
  const [disabled, setDisabled] = createSignal(false);
  const [result, setResult] = createSignal("Ready.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        External form ownership
      </Text>
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          const selected = new FormData(event.currentTarget).get("duration");
          setResult(`Submitted: ${typeof selected === "string" ? selected : "none"}`);
        }}
      />
      <fieldset disabled={disabled()} class={s.nativeFieldset}>
        <legend>
          <Text as="span">Container availability</Text>
        </legend>
        <RadioGroup
          label="Expires"
          name="duration"
          form={formId}
          variant="card"
          value={value()}
          onValueChange={setValue}
          options={choices}
        />
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={disabled()}
          onChange={(event) => setDisabled(event.currentTarget.checked)}
        />{" "}
        Disable container
      </label>
      <Button type="submit" form={formId}>
        Submit externally
      </Button>
      <Text role="status">{result()}</Text>
    </main>
  );
}

function LongContent(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style,
      previous = root.getPropertyValue("font-size"),
      priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (previous) root.setProperty("font-size", previous, priority);
      else root.removeProperty("font-size");
    });
  });
  const longOptions = [
    {
      value: "viewer",
      label: "View conversations and shared workspace information",
      description: "This member can read existing content but cannot change workspace settings.",
    },
    {
      value: "member",
      label: "workspace_abcdefghijklmnopqrstuvwxyz_1234567890",
      description: "A long option label and description should wrap within the available space.",
    },
  ];
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <For each={["plain", "card"] as const}>
              {(variant) => {
                const [value, setValue] = createSignal<string | undefined>("viewer");
                return (
                  <RadioGroup
                    label="Choose a role for this workspace member"
                    description="The role determines what this member can do."
                    error="Review the available roles before continuing."
                    required
                    variant={variant}
                    options={longOptions}
                    value={value()}
                    onValueChange={setValue}
                  />
                );
              }}
            </For>
          </section>
        )}
      </For>
    </main>
  );
}

type Args = {
  theme: ColorTheme;
  variant: "plain" | "card";
  required: boolean;
  disabled: boolean;
  error: string;
};
const meta = {
  title: "Compositions/RadioGroup",
  render: (props: Args) => (
    <main class={`${colorThemes[props.theme]} ${s.frame}`}>
      <Example {...props} />
    </main>
  ),
  args: { theme: "cotton", variant: "card", required: false, disabled: false, error: "" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    variant: { control: "select", options: ["plain", "card"] },
    required: { control: "boolean" },
    disabled: { control: "boolean" },
    error: { control: "text" },
  },
  parameters: { layout: "fullscreen" as const },
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
    const groups = canvasElement.querySelectorAll("fieldset");
    const radios = canvasElement.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    await expect(groups).toHaveLength(8);
    await expect(radios).toHaveLength(24);
    await expect(new Set([...radios].map((radio) => radio.id)).size).toBe(24);
    const rootSize = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize);
    for (const group of groups) {
      const legend = group.querySelector("legend")!;
      const help = doc.getElementById(`${group.id}-description`)!;
      await expect(getComputedStyle(legend).fontFamily).toContain("IBM Plex Mono");
      await expect(Number.parseFloat(getComputedStyle(legend).fontSize)).toBeCloseTo(
        (rootSize * 10.5) / 16,
        2,
      );
      await expect(getComputedStyle(legend).textTransform).toBe("uppercase");
      await expect(Number.parseFloat(getComputedStyle(help).fontSize)).toBeCloseTo(
        (rootSize * 12.5) / 16,
        2,
      );
      if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) continue;
      const theme = group.closest<HTMLElement>("[data-group-theme]")!.dataset
        .groupTheme as ColorTheme;
      const surface = getComputedStyle(group.closest("[data-group-surface]")!).backgroundColor;
      for (const text of [legend, help]) {
        const color = new Color(getComputedStyle(text).color);
        await expect(color.deltaEOK(colors[theme].text.secondary)).toBeLessThan(0.0001);
        await expect(color.contrastWCAG21(surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const radio of radios) {
      const labelText = doc.getElementById(radio.getAttribute("aria-labelledby")!)!;
      await expect(radio).toHaveAccessibleName(labelText.textContent!);
      for (const id of radio.getAttribute("aria-describedby")?.split(" ") ?? [])
        await expect(doc.getElementById(id)).not.toBeNull();
      if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) continue;
      const group = radio.closest("fieldset")!;
      const theme = group.closest<HTMLElement>("[data-group-theme]")!.dataset
        .groupTheme as ColorTheme;
      const palette = colors[theme];
      const card = group.dataset.groupVariant === "card";
      const label = radio.parentElement!;
      const rendered = getComputedStyle(label);
      await expect(Number.parseFloat(getComputedStyle(labelText).fontSize)).toBeCloseTo(
        (rootSize * 14) / 16,
        2,
      );
      const optionDescription = doc.getElementById(`${radio.id}-description`);
      if (optionDescription)
        await expect(Number.parseFloat(getComputedStyle(optionDescription).fontSize)).toBeCloseTo(
          (rootSize * 12.5) / 16,
          2,
        );
      const disabled = radio.matches(":disabled");
      const hover = label.matches(":hover"),
        active = label.matches(":active");
      const strong =
        !disabled && (radio.checked || hover || active || radio.matches(":focus-visible"));
      const expectedBorder = new Color(
        card ? (strong ? palette.line.strong : palette.line.control) : "transparent",
      );
      const border = new Color(rendered.borderTopColor);
      await expect(border.alpha).toBe(expectedBorder.alpha);
      if (card) await expect(border.deltaEOK(expectedBorder)).toBeLessThan(0.0001);
      const expectedFill = new Color(
        !card
          ? "transparent"
          : disabled
            ? palette.action.disabled
            : active
              ? palette.action.pressed
              : radio.checked || hover
                ? palette.action.hover
                : "transparent",
      );
      const fill = new Color(rendered.backgroundColor);
      await expect(fill.alpha).toBeCloseTo(expectedFill.alpha, 6);
      if (expectedFill.alpha > 0) await expect(fill.deltaEOK(expectedFill)).toBeLessThan(0.0001);
      if (!disabled) {
        const backdrop = getComputedStyle(label.closest("[data-group-surface]")!).backgroundColor;
        const effective = compositeOnSurface(rendered.backgroundColor, backdrop);
        await expect(
          new Color(getComputedStyle(labelText).color).contrastWCAG21(effective),
        ).toBeGreaterThanOrEqual(4.5);
        const description = doc.getElementById(`${radio.id}-description`);
        if (description)
          await expect(
            new Color(getComputedStyle(description).color).contrastWCAG21(effective),
          ).toBeGreaterThanOrEqual(4.5);
        if (card) await expect(border.contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
      }
    }
  },
} satisfies Story;
export const States = {
  render: () => <StateSpecimens />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await doc.fonts.ready;
    const rootSize = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize);
    for (const group of canvasElement.querySelectorAll('fieldset[aria-invalid="true"]')) {
      const error = doc.getElementById(`${group.id}-error`)!;
      const indicator = error.firstElementChild!;
      const prefix = error.lastElementChild!.firstElementChild!;
      await expect(Number.parseFloat(getComputedStyle(error).fontSize)).toBeCloseTo(
        (rootSize * 12.5) / 16,
        2,
      );
      await expect(indicator).toHaveAttribute("aria-hidden", "true");
      await expect(getComputedStyle(prefix).clipPath).toBe("inset(50%)");
      for (const radio of group.querySelectorAll('input[type="radio"]'))
        await expect(radio).toHaveAccessibleDescription(expect.stringContaining("Error: "));
      if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) continue;
      const theme = group.closest<HTMLElement>("[data-group-theme]")!.dataset
        .groupTheme as ColorTheme;
      const surface = getComputedStyle(group.closest("section")!).backgroundColor;
      const errorColor = new Color(getComputedStyle(error).color);
      const dotColor = new Color(getComputedStyle(indicator).backgroundColor);
      await expect(errorColor.deltaEOK(colors[theme].text.invalid)).toBeLessThan(0.0001);
      await expect(errorColor.contrastWCAG21(surface)).toBeGreaterThanOrEqual(4.5);
      await expect(dotColor.deltaEOK(colors[theme].status.danger.indicator)).toBeLessThan(0.0001);
    }
  },
} satisfies Story;
export const Playground = {} satisfies Story;
export const Interaction = {
  args: { variant: "plain" },
  render: (props) => <InteractionFixture variant={props.variant} />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      first = canvas.getByRole("radio", { name: "7 days" }),
      last = canvas.getByRole("radio", { name: "30 days" });
    await userEvent.click(last);
    await expect(last).toBeChecked();
    await expect(first).not.toBeChecked();
    await expect(canvas.getByRole("status")).toHaveTextContent("Selected: 30 · changes: 1");
    await userEvent.click(last);
    await expect(canvas.getByRole("status")).toHaveTextContent("changes: 1");
    await userEvent.click(canvas.getByRole("radio", { name: "14 days" }));
    await expect(last).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Reset selection" }));
    await expect(first).toBeChecked();
  },
} satisfies Story;
export const CardInteraction = { ...Interaction, args: { variant: "card" } } satisfies Story;
export const Forms = {
  args: { variant: "plain" },
  render: (props) => <FormFixture variant={props.variant} />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      first = canvas.getByRole("radio", { name: "7 days" });
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(first).toHaveAttribute("aria-invalid", "true");
    await expect(first).toHaveAccessibleDescription(
      "Choose one duration. Error: Choose a duration. A short review window.",
    );
    await userEvent.click(canvas.getByRole("radio", { name: "30 days" }));
    await expect(first).not.toHaveAttribute("aria-invalid");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: 30");
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(canvas.queryByRole("radio", { checked: true })).toBeNull();
  },
} satisfies Story;
export const CardForms = { ...Forms, args: { variant: "card" } } satisfies Story;
export const RefreshedOptions = {
  render: () => <RefreshedOptionsFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      first = canvas.getByRole("radio", { name: "7 days" }),
      id = first.id;
    await userEvent.click(canvas.getByRole("button", { name: "Refresh options" }));
    await expect(canvas.getByRole("radio", { name: "7 days" })).toBe(first);
    await expect(first.id).toBe(id);
    await expect(first).toBeChecked();
    await expect(first).toHaveAccessibleDescription("Updated availability information.");
  },
} satisfies Story;
export const LongContentStory = {
  name: "Long Content",
  render: () => <LongContent />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <LongContent enlarged />,
  parameters: { controls: { disable: true } },
  tags: ["!autodocs"],
} satisfies Story;

export const ExternalForm = {
  render: () => <ExternalFormFixture />,
  parameters: { controls: { disable: true } },
  // Real-browser only: Happy DOM does not omit inherited-disabled values from FormData.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selected = canvas.getByRole("radio", { name: "30 days" });
    await userEvent.click(selected);
    await userEvent.click(canvas.getByRole("button", { name: "Submit externally" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: 30");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable container" }));
    await expect(selected).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Submit externally" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: none");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable container" }));
    await expect(selected).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Submit externally" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: 30");
  },
} satisfies Story;
