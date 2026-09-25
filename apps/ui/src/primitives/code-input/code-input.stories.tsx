import { For, createSignal, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Color from "colorjs.io";
import { CodeInput } from "@amends/ui/primitives/code-input";
import { Field } from "@amends/ui/compositions/field";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { Column, Row } from "@amends/ui/primitives/layout";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./code-input.stories.css.ts";

function EditingFixture() {
  const [value, setValue] = createSignal("");
  const [readOnly, setReadOnly] = createSignal(false);
  const [error, setError] = createSignal<string>();
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <Column>
        <Text as="h1" variant="heading">
          Code entry
        </Text>
        <Field label="Six-digit code" description="Paste or type your code." error={error()}>
          {(control) => (
            <CodeInput
              {...control}
              value={value()}
              readOnly={readOnly()}
              onInput={(event) => {
                setValue(event.currentTarget.value);
                setError(undefined);
              }}
            />
          )}
        </Field>
        <Text role="status">Value: {value() || "empty"}</Text>
        <Row>
          <Button onClick={() => setValue("012345")}>Set code</Button>
          <Button variant="secondary" onClick={() => setValue("")}>
            Clear
          </Button>
          <Button variant="secondary" onClick={() => setReadOnly(!readOnly())}>
            Toggle read-only
          </Button>
          <Button variant="secondary" onClick={() => setError("This code has expired.")}>
            Show error
          </Button>
        </Row>
      </Column>
    </main>
  );
}
function FormFixture() {
  const [result, setResult] = createSignal("No submission yet.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <Column
        as="form"
        onSubmit={(event) => {
          event.preventDefault();
          const code = new FormData(event.currentTarget).get("code");
          setResult(`Submitted: ${typeof code === "string" ? code : ""}`);
        }}
      >
        <Text as="h1" variant="heading">
          Native form
        </Text>
        <Field label="Code" description="Enter all six digits." required>
          {(control) => <CodeInput {...control} name="code" />}
        </Field>
        <Row>
          <Button type="submit">Verify</Button>
          <Button type="reset" variant="secondary">
            Reset
          </Button>
        </Row>
        <Text role="status">{result()}</Text>
      </Column>
    </main>
  );
}
function LayoutFixture() {
  const [compact, setCompact] = createSignal(false);
  const [value, setValue] = createSignal("012345");
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <Column>
        <Text as="h1" variant="heading">
          Container resizing
        </Text>
        <div style={{ width: compact() ? "11rem" : "26.25rem", "max-width": "100%" }}>
          <Field label="Code">
            {(control) => (
              <CodeInput
                {...control}
                value={value()}
                onInput={(e) => setValue(e.currentTarget.value)}
              />
            )}
          </Field>
        </div>
        <Button onClick={() => setCompact(!compact())}>Toggle width</Button>
      </Column>
    </main>
  );
}
function ComparisonFixture(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style;
    const previous = root.getPropertyValue("font-size");
    const priority = root.getPropertyPriority("font-size");
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
          <section class={`${colorThemes[theme]} ${s.frame}`}>
            <Column>
              <Text as="h2" variant="heading">
                {theme === "cotton" ? "Cotton" : "Soot"}
              </Text>
              <Field label="Empty">{(control) => <CodeInput {...control} />}</Field>
              <Field label="Partially entered">
                {(control) => <CodeInput {...control} value="012" />}
              </Field>
              <Field label="Complete">
                {(control) => <CodeInput {...control} value="012345" />}
              </Field>
              <Field label="Incorrect code" error="Check the code and try again.">
                {(control) => <CodeInput {...control} value="123456" />}
              </Field>
              <Field label="Read-only">
                {(control) => <CodeInput {...control} readOnly value="012345" />}
              </Field>
              <Field label="Disabled" disabled>
                {(control) => <CodeInput {...control} value="012345" />}
              </Field>
              <fieldset disabled class={s.fieldset}>
                <Field label="Inherited disabled">
                  {(control) => <CodeInput {...control} value="012345" />}
                </Field>
              </fieldset>
              <div class={s.panel}>
                <Field label="On panel">
                  {(control) => <CodeInput {...control} value="012345" />}
                </Field>
              </div>
              <div dir="rtl">
                <Field label="Code within RTL content">
                  {(control) => <CodeInput {...control} value="012345" />}
                </Field>
              </div>
            </Column>
          </section>
        )}
      </For>
    </main>
  );
}
const meta = {
  title: "Primitives/CodeInput",
  component: CodeInput,
  parameters: { layout: "fullscreen" as const, controls: { disable: true } },
} satisfies Meta<typeof CodeInput>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = { render: () => <EditingFixture /> } satisfies Story;
export const Comparison = {
  render: () => <ComparisonFixture />,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await doc.fonts.ready;
    const measure = doc.createElement("canvas").getContext("2d")!;
    for (const input of canvasElement.querySelectorAll("input")) {
      const root = input.parentElement!.parentElement!;
      const cells = Array.from(root.firstElementChild!.children) as HTMLElement[];
      const style = getComputedStyle(input);
      await expect(style.direction).toBe("ltr");
      // Axe cannot resolve the clipped trailing space in some RTL specimens.
      // Check the rendered text against its actual opaque ancestor surface too.
      if (!input.matches(":disabled")) {
        let surface: HTMLElement | null = root;
        while (surface && new Color(getComputedStyle(surface).backgroundColor).alpha === 0)
          surface = surface.parentElement;
        if (!surface) throw new Error("Missing opaque CodeInput surface");
        await expect(
          new Color(style.color).contrast(getComputedStyle(surface).backgroundColor, "WCAG21"),
        ).toBeGreaterThanOrEqual(4.5);
      }
      if (getComputedStyle(cells[1]!).display === "none") continue;
      measure.font = `${style.fontSize} ${style.fontFamily}`;
      const glyph = measure.measureText("0").width;
      const left = input.getBoundingClientRect().left + parseFloat(style.paddingLeft) + glyph / 2;
      const advance = glyph + parseFloat(style.letterSpacing);
      for (const [index, cell] of cells.entries()) {
        const rect = cell.getBoundingClientRect();
        await expect(Math.abs(left + index * advance - rect.left - rect.width / 2)).toBeLessThan(1);
      }
    }
  },
} satisfies Story;
export const Layout = {
  render: () => <LayoutFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Code" });
    await userEvent.click(canvas.getByRole("button", { name: "Toggle width" }));
    await expect(canvas.getByRole("textbox")).toBe(input);
    await expect(input).toHaveValue("012345");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle width" }));
    await expect(canvas.getByRole("textbox")).toBe(input);
  },
} satisfies Story;
export const EnlargedText = {
  render: () => <ComparisonFixture enlarged />,
  tags: ["!autodocs"],
} satisfies Story;
export const Editing = {
  render: () => <EditingFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Six-digit code" }) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "0123456");
    await expect(input).toHaveValue("012345");
    input.setSelectionRange(1, 3);
    await userEvent.keyboard("98");
    await expect(input).toHaveValue("098345");
    await userEvent.click(canvas.getByRole("button", { name: "Show error" }));
    await expect(input).toHaveAccessibleDescription(
      "Paste or type your code. Error: This code has expired.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Toggle read-only" }));
    await userEvent.type(input, "7");
    await expect(input).toHaveValue("098345");
    await userEvent.click(canvas.getByRole("button", { name: "Set code" }));
    await expect(input).toHaveValue("012345");
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(input).toHaveValue("");
    await expect(canvas.getByRole("textbox")).toBe(input);
  },
} satisfies Story;
export const Forms = {
  render: () => <FormFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Code" }) as HTMLInputElement;
    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("No submission yet.");
    await userEvent.type(input, "012345");
    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: 012345");
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(input).toHaveValue("");
  },
} satisfies Story;
