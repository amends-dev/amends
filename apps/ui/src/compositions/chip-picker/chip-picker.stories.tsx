import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Column } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Field } from "@amends/ui/compositions/field";
import { Dialog } from "@amends/ui/compositions/dialog";
import { ChipPicker } from "@amends/ui/compositions/chip-picker";

const people = [
  { value: "jo", label: "Jo Mercer", mark: "jm", description: "person" },
  { value: "rae", label: "Rae Ashworth", mark: "ra", description: "person" },
  { value: "kit", label: "Kit Nakano", mark: "kn", description: "person" },
  { value: "ada", label: "Ada", mark: "a", description: "agent", ring: "dashed" as const },
  {
    value: "long",
    label: "Ravi Kaur-Montgomery-Abernathy",
    mark: "rk",
    description: "person",
  },
];
function Members(props: { disabled?: boolean; initial?: ReadonlyArray<string> }) {
  const [value, setValue] = createSignal<ReadonlyArray<string>>(props.initial ?? ["jo", "ada"]);
  return (
    <Column gap={3}>
      <Field label="Members" description="Type to find someone; you are always a member.">
        {(control) => (
          <ChipPicker.Root
            options={people}
            value={value()}
            onChange={setValue}
            fixed={{ jo: "you" }}
            chipsLabel="Members"
            input={{ ...control, placeholder: "Add someone…" }}
            empty="nobody by that name"
            disabled={props.disabled}
          />
        )}
      </Field>
      <span role="status" style={{ "font-family": "monospace", "font-size": "0.75rem" }}>
        members · {value().join(", ")}
      </span>
    </Column>
  );
}
function Example(props: {
  theme?: "cotton" | "soot";
  width?: string;
  disabled?: boolean;
  rtl?: boolean;
}) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        style={{
          padding: "1.5rem",
          background: colorVars.surface.panel,
          "max-width": props.width ?? "30rem",
          "min-height": "22rem",
        }}
      >
        <Members disabled={props.disabled} initial={["jo", "ada", "long"]} />
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/ChipPicker", render: () => <Example /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference = {} satisfies Story;
export const Soot = { render: () => <Example theme="soot" /> } satisfies Story;
export const Narrow = { render: () => <Example width="17rem" /> } satisfies Story;
export const RTL = { render: () => <Example rtl /> } satisfies Story;
export const Disabled = { render: () => <Example disabled /> } satisfies Story;
export const Interaction = {
  render: () => (
    <ThemeProvider theme="cotton">
      <Column style={{ padding: "1.5rem", "max-width": "30rem", "min-height": "22rem" }}>
        <Members />
      </Column>
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(document.body);
    const chips = canvas.getByRole("list", { name: "Members" });
    await expect(within(chips).getAllByRole("listitem")).toHaveLength(2);
    // The fixed chip has no remove button; the others do.
    await expect(canvas.queryByRole("button", { name: "Remove Jo Mercer" })).toBeNull();
    const input = canvas.getByRole("combobox", { name: "Members" });
    await userEvent.click(input);
    // Chosen people leave the list.
    await expect(body.queryByRole("option", { name: /Jo Mercer/ })).toBeNull();
    await userEvent.type(input, "rae");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(canvas.getByRole("status")).toHaveTextContent("members · jo, ada, rae");
    await expect(input).toHaveValue("");
    // Removing a chip moves focus to the next chip's button, then the input.
    await userEvent.click(canvas.getByRole("button", { name: "Remove Ada" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("members · jo, rae");
    await expect(canvas.getByRole("button", { name: "Remove Rae Ashworth" })).toHaveFocus();
    // Backspace in the empty input removes the last removable chip, never a fixed one.
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}{Backspace}{Backspace}");
    await expect(canvas.getByRole("status")).toHaveTextContent("members · jo");
  },
} satisfies Story;
export const InDialog = {
  render: () => (
    <ThemeProvider theme="soot">
      <Dialog.Root>
        <Dialog.Trigger>New group</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>New group</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Members />
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
    await userEvent.click(canvas.getByRole("button", { name: "New group" }));
    const input = body.getByRole("combobox", { name: "Members" });
    await userEvent.click(input);
    await userEvent.click(body.getByRole("option", { name: /Kit Nakano/ }));
    await expect(body.getByRole("status")).toHaveTextContent("members · jo, ada, kit");
    await expect(input).toHaveFocus();
  },
} satisfies Story;
export const Standalone = {
  render: () => (
    <ThemeProvider theme="cotton">
      <Column style={{ padding: "1.5rem" }}>
        <Button variant="ghost">Before</Button>
        <Members initial={["jo"]} />
      </Column>
    </ThemeProvider>
  ),
} satisfies Story;
