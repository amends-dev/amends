import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Theme } from "../../foundations/theme/index.ts";
import { NewMessage } from "../direct/index.ts";
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
