import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Toast } from "@amends/ui/compositions/toast";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import type { ColorTheme } from "@amends/ui/foundations/color";
import "@amends/ui/foundations/typography/fonts";
import { EnlargedText as Enlarge } from "../../primitives/overlay/overlay.stories-support.tsx";

function Controls() {
  const toast = Toast.useToast(),
    [undone, setUndone] = createSignal(false);
  let count = 0;
  return (
    <Column gap={4}>
      <Text as="p">Press Alt+T to reach notifications. Hover or focus pauses the timer.</Text>
      <Row wrap gap={3}>
        <Button
          onClick={() =>
            toast.show(() => (
              <Toast.Root>
                <Toast.Title>Task accepted.</Toast.Title>
                <Toast.Action onClick={() => setUndone(true)}>undo</Toast.Action>
              </Toast.Root>
            ))
          }
        >
          Fire toast
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const number = ++count;
            toast.show(() => (
              <Toast.Root>
                <Toast.Title>Saved change {number}.</Toast.Title>
                <Toast.Close />
              </Toast.Root>
            ));
          }}
        >
          Auto-dismiss
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.show(() => (
              <Toast.Root persistent>
                <Toast.Content>
                  <Toast.Title>Could not save changes.</Toast.Title>
                  <Toast.Description>
                    Your draft is still here. Check your connection and try again when you are
                    ready.
                  </Toast.Description>
                </Toast.Content>
                <Toast.Action>retry</Toast.Action>
                <Toast.Close />
              </Toast.Root>
            ))
          }
        >
          Long message
        </Button>
        <Button variant="ghost" onClick={toast.clear}>
          Clear notifications
        </Button>
      </Row>
      {undone() && <Text as="p">Task acceptance undone.</Text>}
    </Column>
  );
}
function Example(props: { theme: ColorTheme; contained?: boolean }) {
  return (
    <section
      class={colorThemes[props.theme]}
      aria-label={`${props.theme} toast examples`}
      style={{
        padding: "1.5rem",
        "min-height": props.contained ? "24rem" : "100vh",
        position: "relative",
        "box-sizing": "border-box",
        width: "100%",
      }}
    >
      <Toast.Provider>
        <Controls />
        <Toast.Viewport style={props.contained ? { position: "absolute" } : undefined} />
      </Toast.Provider>
    </section>
  );
}
const meta = {
  title: "Compositions/Toast",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" as const },
  args: { theme: "cotton" as ColorTheme },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    contained: { table: { disable: true } },
  },
  render: (args) => (
    <main>
      <Example {...args} />
    </main>
  ),
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const Reference = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Fire toast" }));
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Task accepted.");
  },
} satisfies Story;
export const Soot = { ...Reference, args: { theme: "soot" } } satisfies Story;
export const Comparison = {
  render: () => (
    <main>
      <Example theme="cotton" contained />
      <Example theme="soot" contained />
    </main>
  ),
  play: async ({ canvasElement }) => {
    for (const trigger of within(canvasElement).getAllByRole("button", { name: "Fire toast" }))
      await userEvent.click(trigger);
  },
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      trigger = canvas.getByRole("button", { name: "Fire toast" });
    await userEvent.click(trigger);
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await userEvent.click(canvas.getByRole("button", { name: "undo" }));
    await expect(canvas.queryByRole("status")).toBeNull();
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByText("Task acceptance undone.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Long message" }));
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => expect(canvas.queryByRole("status")).toBeNull());
  },
} satisfies Story;
export const Queue = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (let i = 0; i < 5; i++)
      await userEvent.click(canvas.getByRole("button", { name: "Fire toast" }));
    await expect(canvas.getAllByRole("status")).toHaveLength(3);
    await userEvent.click(canvas.getAllByRole("button", { name: "undo" })[0]!);
    await expect(canvas.getAllByRole("status")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Clear notifications" }));
    await expect(canvas.queryAllByRole("status")).toHaveLength(0);
  },
} satisfies Story;
export const LongContent = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Long message" }));
  },
} satisfies Story;
export const EnlargedText = {
  ...LongContent,
  render: (args) => (
    <Enlarge>
      <main>
        <Example {...args} />
      </main>
    </Enlarge>
  ),
  tags: ["!autodocs"],
} satisfies Story;
export const Rtl = {
  ...Reference,
  render: (args) => (
    <main dir="rtl">
      <Example {...args} />
    </main>
  ),
} satisfies Story;
export const InsideDialog = {
  render: () => (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Dialog.Root>
        <Dialog.Trigger>Open workspace</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Workspace</Dialog.Title>
            <Dialog.Description>Feedback stays inside the native modal.</Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <Toast.Provider>
              <Controls />
              <Toast.Viewport />
            </Toast.Provider>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close>Close workspace</Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </main>
  ),
} satisfies Story;
