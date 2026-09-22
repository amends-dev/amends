import { createSignal, createUniqueId } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

// This unstyled fixture verifies the renderer; it is not a production component.
function WorkshopSetup() {
  const id = createUniqueId();
  const [text, setText] = createSignal("");
  return (
    <main>
      <h1>Amends frontend workshop</h1>
      <p>Foundations and components will be introduced and reviewed one at a time.</p>
      <p>This unstyled example checks that Solid renders and responds to input.</p>
      <label for={id}>Preview text</label>{" "}
      <input id={id} value={text()} onInput={(event) => setText(event.currentTarget.value)} />
      <p>
        <output for={id} aria-label="Live preview">
          {text() || "Waiting for input"}
        </output>
      </p>
    </main>
  );
}

const meta = {
  title: "Setup/Workshop",
  component: WorkshopSetup,
  tags: ["autodocs"],
} satisfies Meta<typeof WorkshopSetup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rendering = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Preview text" });
    const output = canvas.getByRole("status", { name: "Live preview" });
    await expect(output).toHaveTextContent("Waiting for input");
    await userEvent.type(input, "Solid is reactive.");
    await expect(output).toHaveTextContent("Solid is reactive.");
    await userEvent.clear(input);
    await expect(output).toHaveTextContent("Waiting for input");
  },
} satisfies Story;
