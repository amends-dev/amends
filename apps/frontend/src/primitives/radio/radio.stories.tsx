import { For, createSignal, createUniqueId, onCleanup, onMount, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { Radio, type RadioProps } from "@amends/frontend/primitives/radio";
import { Text } from "@amends/frontend/primitives/text";
import { Button } from "@amends/frontend/primitives/button";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./radio.stories.css.ts";

function Sample(props: RadioProps & { label: string }) {
  const [local, radio] = splitProps(props, ["label"]);
  const name = createUniqueId();
  return (
    <label class={s.label}>
      <Radio name={name} {...radio} />
      <Text as="span">{local.label}</Text>
    </label>
  );
}
function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-radio-theme={theme}>
            <Text as="h2" variant="heading">
              {theme === "cotton" ? "Cotton" : "Soot"}
            </Text>
            <For each={["canvas", "panel"] as const}>
              {(surface) => (
                <section
                  class={`${s.surface} ${s.stack}`}
                  style={{ "background-color": colorVars.surface[surface] }}
                >
                  <Text as="h3">On surface.{surface}</Text>
                  <Sample label="Unselected" />
                  <Sample label="Selected" checked />
                  <Sample label="Disabled, unselected" disabled />
                  <Sample label="Disabled, selected" disabled checked />
                </section>
              )}
            </For>
            <fieldset disabled class={`${s.fieldset} ${s.stack}`}>
              <legend>
                <Text as="span">Disabled fieldset</Text>
              </legend>
              <Sample label="Inherited disabled, unselected" />
              <Sample label="Inherited disabled, selected" checked />
            </fieldset>
          </article>
        )}
      </For>
    </main>
  );
}
function InteractionFixture() {
  const name = createUniqueId();
  const [value, setValue] = createSignal("7");
  const [changes, setChanges] = createSignal(0);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Native selection
      </Text>
      <fieldset class={`${s.fieldset} ${s.stack}`}>
        <legend>
          <Text as="span">Expiration</Text>
        </legend>
        <For each={["7", "14", "30"]}>
          {(option) => (
            <Sample
              label={`${option} days`}
              name={name}
              value={option}
              disabled={option === "14"}
              checked={value() === option}
              onChange={(event) => {
                if (event.currentTarget.checked) {
                  setValue(option);
                  setChanges((count) => count + 1);
                }
              }}
            />
          )}
        </For>
      </fieldset>
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
function FormFixture() {
  const [result, setResult] = createSignal("No submission yet.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Native form value and reset
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget),
            value = data.get("duration");
          setResult(`Duration: ${typeof value === "string" ? value : "none"}`);
        }}
      >
        <fieldset class={`${s.fieldset} ${s.stack}`}>
          <legend>
            <Text as="span">Expiration (required)</Text>
          </legend>
          <Sample
            label="7 days"
            name="duration"
            value="7"
            required
            ref={(input) => {
              input.defaultChecked = true;
            }}
          />
          <Sample label="30 days" name="duration" value="30" required />
        </fieldset>
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
function LongLabels(props: { enlarged?: boolean }) {
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
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <Sample label="Allow this invitation to remain available for thirty days" checked />
            <Sample label="workspace_abcdefghijklmnopqrstuvwxyz_1234567890" />
            <Sample label="This option is unavailable for your current workspace" disabled />
          </section>
        )}
      </For>
    </main>
  );
}

type Args = RadioProps & { theme: ColorTheme; label: string };
const meta = {
  title: "Primitives/Radio",
  component: Radio,
  render: (props) => {
    const [local, radio] = splitProps(props, ["theme", "label"]);
    return (
      <main class={`${colorThemes[local.theme]} ${s.frame}`}>
        <Sample {...radio} label={local.label} />
      </main>
    );
  },
  args: { theme: "cotton", label: "30 days", checked: false, disabled: false },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    label: { control: "text" },
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  parameters: {
    layout: "fullscreen" as const,
    controls: { include: ["theme", "label", "checked", "disabled"] },
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
    const radios = canvasElement.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    await expect(radios).toHaveLength(20);
    if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
    for (const radio of radios) {
      const theme = radio.closest<HTMLElement>("[data-radio-theme]")!.dataset
        .radioTheme as ColorTheme;
      const palette = colors[theme],
        style = getComputedStyle(radio),
        disabled = radio.matches(":disabled");
      const strong =
        !disabled && (radio.checked || radio.matches(":hover") || radio.matches(":active"));
      await expect(
        new Color(style.borderTopColor).deltaEOK(
          strong ? palette.line.strong : palette.line.control,
        ),
      ).toBeLessThan(0.0001);
      await expect(
        new Color(style.color).deltaEOK(disabled ? palette.text.disabled : palette.text.primary),
      ).toBeLessThan(0.0001);
      await expect(style.backgroundImage === "none").toBe(!radio.checked);
      await expect(style.opacity).toBe("1");
      await expect(radio.getBoundingClientRect().width).toBe(24);
      await expect(radio.getBoundingClientRect().height).toBe(24);
    }
  },
} satisfies Story;
export const Playground = {} satisfies Story;
export const Interaction = {
  render: () => <InteractionFixture />,
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
    await expect(last).not.toBeChecked();
  },
} satisfies Story;
export const Forms = {
  render: () => <FormFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      first = canvas.getByRole("radio", { name: "7 days" }),
      last = canvas.getByRole("radio", { name: "30 days" });
    await expect(first).toBeChecked();
    await userEvent.click(last);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Duration: 30");
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(first).toBeChecked();
    await expect(last).not.toBeChecked();
  },
} satisfies Story;
export const LongLabelsStory = {
  name: "Long Labels",
  render: () => <LongLabels />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <LongLabels enlarged />,
  parameters: { controls: { disable: true } },
  tags: ["!autodocs"],
} satisfies Story;
