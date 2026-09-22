import { For, createSignal, onCleanup, onMount, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button, type ButtonProps } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./button.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;

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
        Hover, press, or use Tab to inspect the primary button. Click, Enter, and Space activate it.
      </Text>
      <For each={["canvas", "panel"] as const}>
        {(surface) => (
          <section
            class={`${s.surface} ${s.stack}`}
            style={{ "background-color": colorVars.surface[surface] }}
            data-button-surface={surface}
          >
            <Text as="h3">On surface.{surface}</Text>
            <div class={s.row}>
              <Button onClick={() => setCount((count) => count + 1)}>Publish reply</Button>
              <Button disabled onClick={() => setCount((count) => count + 1)}>
                Unavailable
              </Button>
            </div>
          </section>
        )}
      </For>
      <fieldset disabled class={s.fieldset}>
        <legend class={s.legend}>Inside a disabled fieldset</legend>
        <Button onClick={() => setCount((count) => count + 1)}>Publish reply</Button>
      </fieldset>
      <Text role="status">Activations: {count()}</Text>
    </article>
  );
}

function ActivationFixture() {
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
        <Button onClick={() => setCount((count) => count + 1)}>Publish reply</Button>
        <Button disabled onClick={() => setCount((count) => count + 1)}>
          Unavailable
        </Button>
        <Button onClick={() => setCount(0)}>Reset counter</Button>
      </div>
      <Text role="status">Activations: {count()}</Text>
    </main>
  );
}

function FormFixture() {
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
          <Button onClick={() => setDrafts((count) => count + 1)}>Save draft</Button>
          <Button type="submit" name="intent" value="publish">
            Publish reply
          </Button>
          <Button type="submit" disabled>
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
  const [updated, setUpdated] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);
  const [count, setCount] = createSignal(0);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Reactive props
      </Text>
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
            <div class={`${s.stack} ${s.narrow}`}>
              <div>
                <Button>Publish this proposal and notify the group</Button>
              </div>
              <div>
                <Button>Publish_reply_abcdefghijklmnopqrstuvwxyz_1234567890</Button>
              </div>
              <div>
                <Button disabled>Publish this proposal and notify the group</Button>
              </div>
            </div>
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
  args: { theme: "cotton", children: "Publish reply", disabled: false, type: "button" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    children: { control: "text" },
    disabled: { control: "boolean" },
    type: { control: "select", options: ["button", "submit", "reset"] },
  },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    controls: { include: ["theme", "children", "disabled", "type"] },
    docs: {
      description: {
        component:
          "The primary Button, composed from the reviewed foundations. One regular size, native button semantics, and type=button by default. Try real hover, press, Tab, Enter, and Space in the browser; no simulated visual-state props.",
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
} satisfies Story;
export const Playground = {} satisfies Story;
export const Activation = {
  render: () => <ActivationFixture />,
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
  render: () => <FormFixture />,
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
    await expect(button.className).toBe(originalClass);
  },
} satisfies Story;
export const LongLabels = {
  render: () => <LongLabelSpecimens />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedButtons />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
} satisfies Story;
