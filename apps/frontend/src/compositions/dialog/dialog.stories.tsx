import { For, createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Dialog } from "@amends/frontend/compositions/dialog";
import { Button } from "@amends/frontend/primitives/button";
import { Input } from "@amends/frontend/primitives/input";
import { Select } from "@amends/frontend/primitives/select";
import { Column, Row } from "@amends/frontend/primitives/layout";
import { Text } from "@amends/frontend/primitives/text";
import { Field } from "@amends/frontend/compositions/field";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";
import { EnlargedText as Enlarge } from "../../primitives/overlay/overlay.stories-support.tsx";

function Reference(props: { theme: ColorTheme }) {
  let safe: HTMLButtonElement | undefined;
  return (
    <main class={colorThemes[props.theme]} style={{ padding: "1.5rem", "min-height": "100vh" }}>
      <Dialog.Root initialFocus={() => safe}>
        <Dialog.Trigger>Open dialog</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Cancel this run?</Dialog.Title>
            <Dialog.Description>
              Ada is 2 minutes into turn 3. The session log is kept either way.
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Footer>
            <Dialog.Close
              ref={(node) => {
                safe = node;
              }}
            >
              keep running
            </Dialog.Close>
            <Dialog.Close variant="secondary" tone="danger">
              cancel run
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
}
function FormExample() {
  const [open, setOpen] = createSignal(false),
    [pending, setPending] = createSignal(false),
    [error, setError] = createSignal(false),
    [saved, setSaved] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem", "min-height": "100vh" }}>
      <Dialog.Root open={open()} onOpenChange={setOpen} dismissible={!pending()}>
        <Dialog.Trigger>Edit workspace</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Workspace details</Dialog.Title>
            <Dialog.Description>Changes stay in this form until you save.</Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <form
              id="workspace-dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (pending()) return;
                setPending(true);
                timer = setTimeout(() => {
                  setPending(false);
                  if (!error()) setError(true);
                  else {
                    setSaved(true);
                    setOpen(false);
                  }
                }, 400);
              }}
            >
              <Column gap={4}>
                <Field label="Name" required>
                  {(control) => <Input {...control} name="name" />}
                </Field>
                <Field label="Default role">
                  {(control) => (
                    <Select
                      {...control}
                      defaultValue="member"
                      options={[
                        { value: "member", label: "Member" },
                        { value: "viewer", label: "Viewer" },
                      ]}
                    />
                  )}
                </Field>
                {error() && (
                  <Text as="p" tone="danger" role="alert">
                    Could not save. Your draft is safe; try again.
                  </Text>
                )}
              </Column>
            </form>
          </Dialog.Body>
          <Dialog.Footer>
            <Button type="submit" form="workspace-dialog-form" pending={pending()}>
              Save changes
            </Button>
            <Dialog.Close variant="secondary" disabled={pending()}>
              Cancel
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
      {saved() && (
        <Text as="p" role="status">
          Workspace saved.
        </Text>
      )}
    </main>
  );
}
const meta = {
  title: "Compositions/Dialog",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" as const },
  args: { theme: "cotton" as ColorTheme },
  argTypes: { theme: { control: "select", options: ["cotton", "soot"] } },
  render: Reference,
} satisfies Meta<typeof Reference>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const Open = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open dialog" }));
    await waitFor(() =>
      expect(within(canvasElement).getByRole("dialog", { name: "Cancel this run?" })).toBeVisible(),
    );
  },
} satisfies Story;
export const Soot = { ...Open, args: { theme: "soot" } } satisfies Story;
export const EnlargedText = {
  ...Open,
  render: (args) => (
    <Enlarge>
      <Reference {...args} />
    </Enlarge>
  ),
  tags: ["!autodocs"],
} satisfies Story;
export const Rtl = {
  ...Open,
  render: (args) => (
    <div dir="rtl">
      <Reference {...args} />
    </div>
  ),
} satisfies Story;
export const Comparison = {
  render: () => (
    <Row wrap>
      <Reference theme="cotton" />
      <Reference theme="soot" />
    </Row>
  ),
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      trigger = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole("dialog", { name: "Cancel this run?" });
    await expect(dialog).toHaveAccessibleDescription(
      "Ada is 2 minutes into turn 3. The session log is kept either way.",
    );
    await expect(canvas.getByRole("button", { name: "keep running" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "cancel run" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await expect(trigger).toHaveFocus();
  },
} satisfies Story;
export const Form = { render: FormExample } satisfies Story;
export const FormRecovery = {
  ...Form,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Edit workspace" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Research");
    const save = canvas.getByRole("button", { name: "Save changes" });
    await userEvent.click(save);
    await expect(save).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Could not save"));
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue("Research");
    await userEvent.click(save);
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByRole("status")).toHaveTextContent("Workspace saved.");
  },
} satisfies Story;
export const LongContent = {
  render: () => (
    <main class={colorThemes.soot} style={{ padding: "1rem" }}>
      <Dialog.Root>
        <Dialog.Trigger>Review details</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Review workspace changes</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Column gap={4}>
              <For each={Array.from({ length: 15 }, (_, i) => i + 1)}>
                {(i) => (
                  <Text as="p">
                    Change {i}: A long explanation wraps within the dialog and scrolls while the
                    actions remain reachable.
                  </Text>
                )}
              </For>
            </Column>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close>Finish reviewing</Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </main>
  ),
} satisfies Story;
