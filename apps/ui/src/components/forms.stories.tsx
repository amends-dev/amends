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
import { Notice } from "./notice/index.ts";
import { Select } from "./select/index.ts";
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

/** The caution notice from the Lunacy "Connections / 08 / Credential storage unavailable" frame. */
export const Notices = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Notices</h2>
        <Notice title="API key wasn’t saved" alert>
          Credential storage is unavailable. Ask your administrator to enable it, then try again.
        </Notice>
        <Notice title="Provider unavailable" />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("API key wasn’t saved");
  },
} satisfies Story;

function CardChoiceExample() {
  const [where, setWhere] = createSignal("none");
  const [account, setAccount] = createSignal<string | undefined>("team");
  const [created, setCreated] = createSignal(0);
  return (
    <div class={s.stack}>
      <Choice.Group label="Sandbox" value={where()} onChange={setWhere} variant="card">
        <Choice.Option value="none" description="Run without a sandbox.">
          No sandbox
        </Choice.Option>
        <Choice.Option value="local" description="Runs on this host without isolation.">
          Local directory
        </Choice.Option>
        <Choice.Option value="daytona" description="Isolated containers in your Daytona account.">
          Daytona
        </Choice.Option>
      </Choice.Group>
      <Field.Root hint={`Created ${created()} from the list`}>
        <Field.Label>Daytona account</Field.Label>
        <Select
          options={[
            { value: "team", label: "Daytona · Team", description: "Configured" },
            {
              value: "backup",
              label: "Daytona · Backup",
              description: "Needs API key · Can finish setup later",
            },
          ]}
          value={account()}
          onChange={setAccount}
          action={{ label: "Create Daytona connection", onSelect: () => setCreated(created() + 1) }}
        />
      </Field.Root>
    </div>
  );
}

/**
 * Card choices from the Lunacy "Environments / 05" frame, and a select whose options carry a
 * second line and whose list ends with an action, from "Environments / 10".
 */
export const CardsAndDetailedSelect = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Card choices and a select with details</h2>
        <CardChoiceExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: /Daytona/ }));
    await expect(canvas.getByRole("radio", { name: /Daytona/ })).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: /Daytona account/ }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("option", { name: /Daytona · Backup/ })).toHaveTextContent(
      "Needs API key",
    );
    await userEvent.click(body.getByRole("button", { name: "Create Daytona connection" }));
    await expect(canvas.getByText("Created 1 from the list")).toBeVisible();
  },
} satisfies Story;
