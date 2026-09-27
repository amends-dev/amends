import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { IconMarkNew } from "@amends/icons";
import { Button } from "./button/index.ts";
import { Choice } from "./choice/index.ts";
import { Field } from "./field/index.ts";
import { Input, SearchField } from "./input/index.ts";
import { Menu } from "./menu/index.ts";
import { MemberPicker } from "./member-picker/index.ts";
import * as s from "./components.stories.css.ts";

const meta = { title: "Components/Forms" } satisfies Meta;
export default meta;
type Story = StoryObj;

export const Buttons = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Button</h2>
        <p class={s.note}>
          Primary for the one main action, secondary for the rest, and quiet for row actions.
          Disabled buttons fill with the subtle shade. Below 64rem they are 44px tall.
        </p>
        <div class={s.panel}>
          <Button variant="primary">Save changes</Button>
          <Button variant="primary" disabled>
            Save changes
          </Button>
          <Button>Cancel</Button>
          <Button icon={IconMarkNew}>New task</Button>
          <Button chevron>Status</Button>
          <Button disabled>Add</Button>
          <Button variant="quiet">Remove</Button>
        </div>
      </section>
    </div>
  ),
} satisfies Story;

function FieldsExample() {
  const [name, setName] = createSignal("general");
  const [visibility, setVisibility] = createSignal("private");
  const [status, setStatus] = createSignal("all");
  const [selected, setSelected] = createSignal<string[]>([]);
  return (
    <div class={s.stack}>
      <Field.Root
        hint="Everyone in this group sees this name."
        error={name().trim() ? undefined : "Give the group a name."}
      >
        <Field.Label>Group name</Field.Label>
        <Input value={name()} onInput={(event) => setName(event.currentTarget.value)} />
      </Field.Root>
      <Choice.Group
        label="Visibility"
        value={visibility()}
        onChange={setVisibility}
        hint={
          visibility() === "public"
            ? "Anyone in the workspace can find this group and join it."
            : "Only people added to this group can find it."
        }
      >
        <Choice.Option value="public">Public</Choice.Option>
        <Choice.Option value="private">Private</Choice.Option>
      </Choice.Group>
      <div class={s.panel}>
        <SearchField placeholder="Search tasks…" />
        <Menu.Root>
          <Menu.Trigger>{status() === "all" ? "Status" : status()}</Menu.Trigger>
          <Menu.Content aria-label="Filter by status">
            <Menu.RadioGroup value={status()} onChange={setStatus}>
              <Menu.RadioItem value="all">Any status</Menu.RadioItem>
              <Menu.RadioItem value="Open">Open</Menu.RadioItem>
              <Menu.RadioItem value="Done">Done</Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Root>
      </div>
      <Field.Root>
        <Field.Label>Add members</Field.Label>
        <MemberPicker
          candidates={[
            { id: "casey", name: "Casey Park", tone: "sage", kind: "Person" },
            { id: "morgan", name: "Morgan Lee", tone: "slate", kind: "Person" },
            { id: "yumi", name: "Yumi", tone: "lilac", kind: "Agent" },
          ]}
          selected={selected()}
          onSelectedChange={setSelected}
        />
      </Field.Root>
    </div>
  );
}

export const Fields = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Fields, choices, search, menus, and the member picker</h2>
        <FieldsExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Group name" });
    await expect(name).toHaveAccessibleDescription("Everyone in this group sees this name.");
    await userEvent.clear(name);
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(canvas.getByRole("radio", { name: "Public" }));
    await expect(canvas.getByText(/can find this group and join it/)).toBeVisible();
    const picker = canvas.getByRole("combobox", { name: "Add members" });
    await userEvent.type(picker, "yu{Enter}");
    await expect(canvas.getByRole("button", { name: "Remove Yumi" })).toBeVisible();
    await userEvent.type(picker, "{Backspace}");
    await expect(canvas.queryByRole("button", { name: "Remove Yumi" })).toBeNull();
  },
} satisfies Story;
