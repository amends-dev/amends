import { For, createSignal, onMount, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import Color from "colorjs.io";
import { Select, type SelectOption } from "@amends/ui/primitives/select";
import { Field } from "@amends/ui/compositions/field";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { colors, type ColorTheme } from "@amends/ui/foundations/color";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./select.stories.css.ts";

const models: SelectOption[] = ["claude-sonnet-4-6", "claude-opus-4-1", "gpt-5-codex"].map(
  (label) => ({ value: label, label }),
);
const roles: SelectOption[] = [
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Administrator — unavailable", disabled: true },
  { value: "member", label: "Member" },
];
function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-select-theme={theme}>
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
                  <Field label="Empty selection">
                    {(control) => (
                      <Select options={models} placeholder="Choose a model" {...control} />
                    )}
                  </Field>
                  <Field label="Selected">
                    {(control) => (
                      <Select options={models} defaultValue={models[0]!.value} {...control} />
                    )}
                  </Field>
                  <Field label="Disabled" disabled>
                    {(control) => (
                      <Select options={models} defaultValue={models[0]!.value} {...control} />
                    )}
                  </Field>
                  <Field label="Invalid" required error="Choose an available model.">
                    {(control) => (
                      <Select options={models} placeholder="Choose a model" {...control} />
                    )}
                  </Field>
                </section>
              )}
            </For>
            <fieldset disabled class={s.fieldset}>
              <legend>
                <Text as="span">Disabled fieldset</Text>
              </legend>
              <Field label="Inherited disabled">
                {(control) => <Select options={models} {...control} />}
              </Field>
            </fieldset>
            <Field label="No available choices">
              {(control) => <Select options={[]} placeholder="No models available" {...control} />}
            </Field>
          </article>
        )}
      </For>
    </main>
  );
}
function FormFixture() {
  const [value, setValue] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string>();
  const [result, setResult] = createSignal("Ready.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Selection, required validation, and reset
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("role");
          setResult(`Submitted: ${typeof value === "string" ? value : "none"}`);
        }}
        onReset={() => {
          setValue(null);
          setError(undefined);
          setResult("Ready.");
        }}
      >
        <Field label="Role" description="Select one available role." required error={error()}>
          {(control) => (
            <Select
              options={roles}
              name="role"
              value={value()}
              placeholder="Choose a role"
              onInvalid={() => setError("Choose a role.")}
              onChange={(next) => {
                setValue(next);
                setError(undefined);
              }}
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
function ReactiveFixture() {
  const [value, setValue] = createSignal<string | null>("member");
  const [disabled, setDisabled] = createSignal(false);
  const [options, setOptions] = createSignal(roles);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Reactive selection
      </Text>
      <Field label="Role" disabled={disabled()}>
        {(control) => (
          <Select options={options()} value={value()} onChange={setValue} {...control} />
        )}
      </Field>
      <Text role="status">Value: {value() ?? "none"}</Text>
      <Button onClick={() => setValue("viewer")}>Set viewer</Button>
      <Button onClick={() => setOptions(roles.map((option) => ({ ...option })))}>
        Refresh choices
      </Button>
      <label>
        <input
          type="checkbox"
          checked={disabled()}
          onChange={(event) => setDisabled(event.currentTarget.checked)}
        />{" "}
        Disable control
      </label>
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
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <Field
              label="Choose the workspace permission level for this member"
              description="The selected text and popup options wrap when space is limited."
            >
              {(control) => (
                <Select
                  options={[
                    {
                      value: "viewer",
                      label: "View conversations and shared workspace information",
                    },
                    { value: "member", label: "Manage conversations and workspace settings" },
                  ]}
                  defaultValue="viewer"
                  {...control}
                />
              )}
            </Field>
          </section>
        )}
      </For>
    </main>
  );
}
function PlaygroundFixture(props: { theme: ColorTheme; disabled: boolean; required: boolean }) {
  return (
    <main class={`${colorThemes[props.theme]} ${s.playground} ${s.stack}`}>
      <Field label="Model" disabled={props.disabled} required={props.required}>
        {(control) => <Select options={models} defaultValue={models[0]!.value} {...control} />}
      </Field>
      <Button variant="ghost">Next action</Button>
    </main>
  );
}
type Args = { theme: ColorTheme; disabled: boolean; required: boolean };
const meta = {
  title: "Primitives/Select",
  render: (props: Args) => <PlaygroundFixture {...props} />,
  args: { theme: "cotton", disabled: false, required: false },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    disabled: { control: "boolean" },
    required: { control: "boolean" },
  },
  parameters: {
    layout: "fullscreen" as const,
    a11y: {
      config: {
        checks: [
          {
            id: "region",
            options: {
              // A labelled popup belongs to its trigger outside page landmarks,
              // like axe's existing dialog exception. Keep other region checks.
              regionMatcher:
                "dialog, [role=dialog], [role=alertdialog], svg, [role=listbox][aria-labelledby]",
            },
          },
        ],
      },
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
    const triggers = canvasElement.querySelectorAll<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]',
    );
    await expect(triggers).toHaveLength(20);
    if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
    for (const trigger of triggers) {
      const palette =
          colors[
            trigger.closest<HTMLElement>("[data-select-theme]")!.dataset.selectTheme as ColorTheme
          ],
        style = getComputedStyle(trigger);
      await expect(style.borderRadius).toBe("10px");
      await expect(style.borderTopStyle).toBe("dashed");
      await expect(
        new Color(style.color).deltaEOK(
          trigger.matches(":disabled") ? palette.text.disabled : palette.text.primary,
        ),
      ).toBeLessThan(0.0001);
      await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
} satisfies Story;
export const Playground = {} satisfies Story;
export const OpenMenu = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Model/ }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option", { name: models[0]!.label })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
} satisfies Story;
export const OpenMenuSoot = { ...OpenMenu, args: { theme: "soot" } } satisfies Story;
export const Interaction = {
  render: () => <ReactiveFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      trigger = canvas.getByRole("button", { name: /^Role/ });
    await expect(trigger).toHaveTextContent("Member");
    await userEvent.click(trigger);
    await expect(page.getByRole("option", { name: /Administrator/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(page.getByRole("option", { name: "Viewer" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Value: viewer");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Refresh choices" }));
    await expect(trigger).toHaveTextContent("Viewer");
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole("option", { name: "Member" }));
    await userEvent.click(canvas.getByRole("button", { name: "Set viewer" }));
    await expect(trigger).toHaveTextContent("Viewer");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable control" }));
    await expect(trigger).toBeDisabled();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable control" }));
    await expect(canvas.getByRole("button", { name: /^Role/ })).toBe(trigger);
  },
} satisfies Story;
export const Forms = {
  render: () => <FormFixture />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      trigger = canvas.getByRole("button", { name: /^Role/ });
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(trigger).toHaveAttribute("aria-invalid", "true");
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole("option", { name: "Member" }));
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: member");
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(trigger).toHaveTextContent("Choose a role");
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
export const ResetDefaults = {
  render: () => (
    <main class={`${colorThemes.cotton} ${s.playground}`}>
      <form class={s.stack}>
        <Field label="Default role">
          {(control) => <Select options={roles} defaultValue="viewer" name="role" {...control} />}
        </Field>
        <Button type="reset" variant="secondary">
          Reset to viewer
        </Button>
      </form>
    </main>
  ),
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      trigger = canvas.getByRole("button", { name: /^Default role/ });
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole("option", { name: "Member" }));
    await expect(trigger).toHaveTextContent("Member");
    await userEvent.click(canvas.getByRole("button", { name: "Reset to viewer" }));
    await expect(trigger).toHaveTextContent("Viewer");
    await expect(new FormData(canvasElement.querySelector("form")!).get("role")).toBe("viewer");
  },
} satisfies Story;
export const Keyboard = {
  render: () => (
    <main class={`${colorThemes.cotton} ${s.playground} ${s.stack}`}>
      <Button variant="ghost">Previous action</Button>
      <Field label="Role">
        {(control) => <Select options={roles} defaultValue="viewer" {...control} />}
      </Field>
      <Button variant="ghost">Next action</Button>
    </main>
  ),
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: /^Role/ });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(page.getByRole("option", { name: "Viewer" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await expect(page.getByRole("option", { name: "Member" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent("Member");
    await userEvent.keyboard("{ArrowDown}");
    await page.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole("button", { name: "Previous action" }));
    await waitFor(() => expect(page.queryByRole("listbox")).toBeNull());
    await expect(canvas.getByRole("button", { name: "Previous action" })).toHaveFocus();
  },
} satisfies Story;
