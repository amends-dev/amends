import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Show, createSignal } from "solid-js";
import {
  IconMarkAgents,
  IconMarkChannel,
  IconMarkConnections,
  IconMarkEnvironments,
  IconMarkMail,
  IconMarkSettings,
} from "@amends-dev/icons";
import { Theme } from "../../foundations/theme/index.ts";
import { NewMessage } from "../direct/index.ts";
import { JumpTo, type JumpToItem } from "../jump-to/index.ts";
import { creationCandidates } from "../sample.ts";
import { ChangeName, type ChangeNameError } from "./index.ts";

const meta = {
  title: "Screens/Workspace dialogs",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Name(props: { readonly error?: ChangeNameError }) {
  const [name, setName] = createSignal("Jordan");
  return (
    <ChangeName
      open
      onClose={() => {}}
      workspaceName="Mercier & Co"
      name={name()}
      onNameChange={setName}
      ready={name().trim() !== "" && name().trim() !== "Jordan"}
      error={props.error}
      onSave={() => {}}
    />
  );
}

/** Changing what people in one workspace call the reader. */
export const ChangeYourName = {
  render: () => <Name />,
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog", { name: "Your name" }));
    const save = dialog.getByRole("button", { name: "Save name" });
    await expect(save).toBeDisabled();
    const input = dialog.getByRole("textbox", { name: "Name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Jordan M.");
    await expect(save).toBeEnabled();
  },
} satisfies Story;

/** A save that failed. */
export const ChangeNameFailed = { render: () => <Name error="failed" /> } satisfies Story;

function Message() {
  const [selected, setSelected] = createSignal<string[]>([]);
  return (
    <Theme mode="light">
      <NewMessage
        open
        onClose={() => {}}
        candidates={creationCandidates}
        selected={selected()}
        onSelectedChange={setSelected}
        existing={selected().length === 1 && selected()[0] === creationCandidates[0]?.id}
        onConfirm={() => {}}
      />
    </Theme>
  );
}

/** Choosing people to message; someone the reader already talks to opens that conversation. */
export const NewMessageDialog = {
  render: () => <Message />,
  play: async () => {
    const dialog = within(
      await within(document.body).findByRole("dialog", { name: "New message" }),
    );
    await expect(dialog.getByRole("button", { name: "Start conversation" })).toBeDisabled();
    await userEvent.type(dialog.getByRole("combobox", { name: "To" }), "alex{Enter}");
    await expect(dialog.getByRole("button", { name: "Open conversation" })).toBeEnabled();
    await expect(dialog.getByText("You already have a conversation with them.")).toBeVisible();
  },
} satisfies Story;

const places: readonly JumpToItem[] = [
  { id: "inbox", label: "Inbox", section: "Go to", icon: IconMarkMail },
  { id: "agents", label: "Agents", section: "Go to", icon: IconMarkAgents },
  { id: "environments", label: "Environments", section: "Go to", icon: IconMarkEnvironments },
  { id: "connections", label: "Connections", section: "Go to", icon: IconMarkConnections },
  { id: "settings", label: "Settings", section: "Go to", icon: IconMarkSettings },
  ...["general", "design", "engineering", "product"].map((name) => ({
    id: `group:${name}`,
    label: name,
    section: "Groups",
    icon: IconMarkChannel,
  })),
  ...["Alex Morgan", "Sara Lind", "Oliver Dean"].map((name) => ({
    id: `person:${name}`,
    label: name,
    section: "People",
    detail: "Direct message",
    person: { name },
  })),
  {
    id: "agent:yumi",
    label: "Yumi",
    section: "Agents",
    person: { name: "Yumi", tone: "lilac" as const },
  },
  { id: "environment:web", label: "Web app", section: "Environments", icon: IconMarkEnvironments },
];

function Jump() {
  const [open, setOpen] = createSignal(true);
  const [went, setWent] = createSignal<string>();
  return (
    <Theme mode="light">
      <Show when={went()}>
        <output aria-label="Went to">{went()}</output>
      </Show>
      <JumpTo
        open={open()}
        onClose={() => setOpen(false)}
        items={places}
        onOpen={(id) => {
          setWent(id);
          setOpen(false);
        }}
      />
    </Theme>
  );
}

/** Jumping anywhere by name: typing narrows every section, and Enter goes to the first match. */
export const JumpToAnywhere = {
  render: () => <Jump />,
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Jump to" }));
    const field = dialog.getByRole("combobox", { name: "Jump to" });
    await waitFor(() => expect(field).toHaveFocus());
    await expect(dialog.getByRole("group", { name: "Groups" })).toBeVisible();
    await userEvent.type(field, "#des");
    await expect(dialog.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "design",
    ]);
    await userEvent.clear(field);
    await userEvent.type(field, "sara{ArrowDown}{ArrowUp}{Enter}");
    await expect(await body.findByRole("status", { name: "Went to" })).toHaveTextContent(
      "person:Sara Lind",
    );
  },
} satisfies Story;
