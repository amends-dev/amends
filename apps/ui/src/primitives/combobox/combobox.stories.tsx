import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Dialog } from "@amends/ui/compositions/dialog";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Assignee } from "./combobox.stories-support.tsx";
function Example(props: {
  theme?: "cotton" | "soot";
  narrow?: boolean;
  disabled?: boolean;
  clearOnSelect?: boolean;
}) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Column
        style={{
          padding: "1.5rem",
          background: colorVars.surface.panel,
          "max-width": props.narrow ? "16rem" : "32rem",
          "min-height": "22rem",
        }}
      >
        <Assignee clearOnSelect={props.clearOnSelect} disabled={props.disabled} />
        <Button variant="ghost">Next control</Button>
      </Column>
    </ThemeProvider>
  );
}
const meta = {
  title: "Primitives/Combobox",
  render: () => <Example clearOnSelect />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference = {} satisfies Story;
export const Soot = { render: () => <Example theme="soot" clearOnSelect /> } satisfies Story;
export const SelectedInInput = { render: () => <Example /> } satisfies Story;
export const Narrow = { render: () => <Example narrow clearOnSelect /> } satisfies Story;
export const Disabled = {
  render: () => (
    <>
      <Example disabled />
      <Example theme="soot" disabled />
    </>
  ),
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(document.body);
    const input = canvas.getByRole("combobox", { name: "Assign to" });
    await userEvent.click(input);
    await expect(body.getAllByRole("option")).toHaveLength(5);
    await userEvent.type(input, "ra");
    await expect(body.getByRole("option", { name: "Rae" })).toBeVisible();
    await expect(body.queryByRole("option", { name: "Ada" })).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("option", { name: "Ravi Kaur" }));
    await expect(canvas.getByText("assigned · Ravi Kaur")).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(input, "unknown");
    await expect(body.getByText("nobody by that name")).toBeVisible();
    await expect(body.queryAllByRole("option")).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.getByText("assigned · Ravi Kaur")).toBeVisible();
  },
} satisfies Story;
export const InDialog = {
  render: () => (
    <ThemeProvider theme="soot">
      <Dialog.Root>
        <Dialog.Trigger>Assign someone</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Choose assignee</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Assignee clearOnSelect />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close>Done</Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "Assign someone" }));
    const input = body.getByRole("combobox", { name: "Assign to" });
    await userEvent.click(input);
    await userEvent.click(body.getByRole("option", { name: "Ravi Kaur" }));
    await expect(body.getByText("assigned · Ravi Kaur")).toBeVisible();
    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute("aria-expanded", "false");
  },
} satisfies Story;
export const DisabledFieldset = {
  render: () => {
    const [disabled, setDisabled] = createSignal(false);
    return (
      <ThemeProvider theme="cotton">
        <Column style={{ padding: "1.5rem" }}>
          <Button onClick={() => setDisabled(!disabled())}>Toggle fieldset</Button>
          <fieldset disabled={disabled()}>
            <legend>Assignee</legend>
            <Assignee clearOnSelect />
          </fieldset>
        </Column>
      </ThemeProvider>
    );
  },
} satisfies Story;
