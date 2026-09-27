import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Entry } from "../sign-in/entry.fixture.tsx";

const meta = {
  title: "Screens/Workspaces",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The Lunacy "Your workspaces and invitations" frame. */
export const WorkspacesAndInvitations = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" />,
} satisfies Story;

/** The Lunacy "Create workspace" frame. */
export const CreateWorkspace = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" creating />,
} satisfies Story;

/** The Lunacy "Invitations only" frame. */
export const InvitationsOnly = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" workspaces="invitations" />,
} satisfies Story;

/** The Lunacy "First workspace" frame. */
export const FirstWorkspace = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" workspaces="none" />,
} satisfies Story;

/** The Lunacy "Invitation accepted" frame: the workspace joins the list with a toast. */
export const AcceptInvitation = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Accept invite to Northstar Studio" }),
    );
    await expect(canvas.getByRole("link", { name: "Northstar Studio" })).toBeVisible();
    await expect(canvas.getByText("3 workspaces · 1 pending invitation")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Joined Northstar Studio");
  },
} satisfies Story;

/** Creating a first workspace from the empty picker. */
export const CreateFirstWorkspace = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" workspaces="none" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "Create workspace" }));
    const create = dialog.getByRole("button", { name: "Create workspace" });
    await expect(create).toBeDisabled();
    await userEvent.type(dialog.getByRole("textbox", { name: "Workspace name" }), "New Ventures");
    await userEvent.click(create);
    await waitFor(() => expect(canvas.getByRole("link", { name: "New Ventures" })).toBeVisible());
    await expect(canvas.getByText("1 workspace")).toBeVisible();
  },
} satisfies Story;
