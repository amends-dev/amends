import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { Entry, unavailableWorkspace } from "../sign-in/entry.fixture.tsx"
import { CreateWorkspace as CreateWorkspaceModal } from "./index.ts"

const meta = {
  title: "Screens/Workspaces",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

/** The Lunacy "Your workspaces and invitations" frame. */
export const WorkspacesAndInvitations = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" />
} satisfies Story

/** The Lunacy "Create workspace" frame. */
export const CreateWorkspace = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" creating />
} satisfies Story

/** The Lunacy "Invitations only" frame. */
export const InvitationsOnly = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" workspaces="invitations" />
} satisfies Story

/** The Lunacy "First workspace" frame. */
export const FirstWorkspace = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" workspaces="none" />
} satisfies Story

/** The Lunacy "Invitation accepted" frame: joining under a chosen name, then a toast. */
export const AcceptInvitation = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Accept invite to Northstar Studio" }))
    const dialog = within(await canvas.findByRole("dialog", { name: "Join Northstar Studio" }))
    await expect(dialog.getByRole("textbox", { name: "Your name" })).toHaveValue("Alex")
    await userEvent.click(dialog.getByRole("button", { name: "Join" }))
    const joined = await canvas.findByRole("link", { name: "Northstar Studio" })
    // The invitation's button went with it, so focus moves to the workspace.
    await waitFor(() => expect(joined).toHaveFocus())
    await expect(canvas.getByText("3 workspaces · 1 pending invitation")).toBeVisible()
    await expect(canvas.getByRole("status")).toHaveTextContent("Joined Northstar Studio")
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument()
  }
} satisfies Story

/** An invitation that went away: the Join dialog explains and stays open. */
export const AcceptFailure = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: `Accept invite to ${unavailableWorkspace}` }))
    const dialog = within(await canvas.findByRole("dialog", { name: `Join ${unavailableWorkspace}` }))
    await userEvent.click(dialog.getByRole("button", { name: "Join" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("This invitation is no longer available.")
  }
} satisfies Story

/** The list could not be reloaded; what loaded before stays. */
export const RefreshFailed = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" refreshFailed />
} satisfies Story

/** Created, but the list did not reload, so it cannot open yet. */
export const CreatedRefreshFailed = {
  render: () => (
    <CreateWorkspaceModal
      open
      onClose={() => {}}
      name="New Ventures"
      onNameChange={() => {}}
      memberName="Alex"
      onMemberNameChange={() => {}}
      onCreate={() => {}}
      created={{ name: "New Ventures", pending: false, refreshFailed: true }}
      onRetry={() => {}}
    />
  )
} satisfies Story

/** Creating a first workspace from the empty picker. */
export const CreateFirstWorkspace = {
  render: () => <Entry step="workspaces" email="alex@mercier.example" workspaces="none" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    const dialog = within(await canvas.findByRole("dialog", { name: "Create workspace" }))
    const create = dialog.getByRole("button", { name: "Create workspace" })
    await expect(create).toBeDisabled()
    await userEvent.type(dialog.getByRole("textbox", { name: "Workspace name" }), "New Ventures")
    await expect(dialog.getByRole("textbox", { name: "Your name" })).toHaveValue("Alex")
    await userEvent.click(create)
    await waitFor(() => expect(canvas.getByRole("link", { name: "New Ventures" })).toBeVisible())
    await expect(canvas.getByText("1 workspace")).toBeVisible()
  }
} satisfies Story
