import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import {
  IssueInvitationForm,
  type InvitationRoles,
  type IssueInvitationResult,
} from "../../src/invitations/index.ts";
import { draft, issued, roles } from "./fixtures.ts";

const meta = {
  title: "Invitations/Issue invitation",
  component: IssueInvitationForm,
  tags: ["autodocs"],
  args: { roles, defaultRoleId: "viewer", onRetryRoles: fn(), onSubmit: fn(issued) },
  argTypes: { onSubmit: { control: false }, onRetryRoles: { control: false } },
  parameters: {
    docs: {
      description: {
        component:
          "The same invitation form used by the web app. Stories supply role availability and submission outcomes; the component owns its draft, validation, focus, and submission state.",
      },
    },
  },
} satisfies Meta<typeof IssueInvitationForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { initialDraft: draft } };
export const Loading: Story = { args: { roles: { _tag: "Loading" } } };
export const Unavailable: Story = {
  args: { roles: { _tag: "Unavailable", message: "You do not hold the permission this needs." } },
};
export const NoAssignableRoles: Story = {
  args: {
    roles: { _tag: "Ready", choices: [{ id: "viewer", label: "Viewer", assignable: false }] },
    initialDraft: draft,
  },
};
export const NoRoles: Story = {
  args: { roles: { _tag: "Ready", choices: [] }, initialDraft: draft },
};
export const Refreshing: Story = {
  args: { initialDraft: draft, roles: { ...roles, refreshing: true } },
};
export const RefreshFailed: Story = {
  args: {
    initialDraft: draft,
    roles: { ...roles, refreshError: "The connection was interrupted." },
  },
};

export const Validation: Story = {
  args: { initialDraft: { ...draft, recipientId: "not-an-email" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "issue the invitation" }));
    await expect(canvas.getByText("Enter a valid email address.")).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveFocus();
  },
};
export const Submitting: Story = {
  args: {
    initialDraft: draft,
    onSubmit: fn<typeof issued>(() => new Promise<IssueInvitationResult>(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "issue the invitation" }));
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveAttribute("readonly");
    await expect(canvas.getByRole("button", { name: "issue the invitation" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  },
};
export const Succeeded: Story = {
  args: { initialDraft: draft },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "issue the invitation" }));
    await expect(canvas.getByText(/Issued an invitation for avery@example.com/)).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveValue("");
    await expect(args.onSubmit).toHaveBeenCalledWith(draft);
  },
};
export const Failed: Story = {
  args: {
    initialDraft: draft,
    onSubmit: fn<typeof issued>(async () => ({
      _tag: "Failed" as const,
      message: "That person is already an active member.",
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "issue the invitation" }));
    await expect(canvas.getByText("That person is already an active member.")).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveValue(draft.recipientId);
  },
};
export const Retry: Story = {
  args: { initialDraft: draft },
  render: (args) => {
    let attempts = 0;
    return (
      <IssueInvitationForm
        {...args}
        onSubmit={async (input) =>
          ++attempts === 1
            ? { _tag: "Failed", message: "The workspace was busy. Try again." }
            : issued(input)
        }
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "issue the invitation" }));
    await expect(canvas.getByText("The workspace was busy. Try again.")).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveValue(draft.recipientId);
    await userEvent.click(canvas.getByRole("button", { name: "issue the invitation" }));
    await expect(canvas.getByText(/Issued an invitation/)).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveValue("");
  },
};
export const AvailabilityChanges: Story = {
  args: { initialDraft: draft },
  render: (args) => {
    const [choices, setChoices] = createSignal<InvitationRoles>(roles);
    return (
      <>
        <button
          onClick={() =>
            setChoices({
              _tag: "Ready",
              choices: [{ id: "viewer", label: "Viewer", assignable: false }],
            })
          }
        >
          Simulate access change
        </button>
        <IssueInvitationForm {...args} roles={choices()} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Simulate access change" }));
    await expect(canvas.getByRole("button", { name: "issue the invitation" })).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveValue(draft.recipientId);
  },
};
export const Narrow: Story = {
  args: { initialDraft: draft },
  decorators: [
    (Story) => (
      <div style={{ "max-width": "320px" }}>
        <Story />
      </div>
    ),
  ],
};
export const Soot: Story = { args: { initialDraft: draft }, globals: { theme: "soot" } };
