import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { SettingsWorkspace } from "./settings.fixture.tsx"

const meta = {
  title: "Screens/Settings",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

const body = (element: HTMLElement) => within(element.ownerDocument.body)
const roster = (element: HTMLElement) => within(within(element).getByRole("list", { name: "Members" }))

/** The Lunacy "Workspace settings / 01 / Workspace" frame. */
export const Workspace = { render: () => <SettingsWorkspace /> } satisfies Story

/** The Lunacy "02 / Members" frame. */
export const Members = { render: () => <SettingsWorkspace tab="members" /> } satisfies Story

/** The Lunacy "03 / Member details" frame. */
export const MemberDetailsOpen = {
  render: () => <SettingsWorkspace tab="members" selected="alex" />
} satisfies Story

/** The Lunacy "04 / Invite member" frame. */
export const InviteMember = {
  render: () => <SettingsWorkspace tab="members" dialog="invite" />
} satisfies Story

/** The Lunacy "07 / Invitation history" frame. */
export const InvitationHistory = {
  render: () => <SettingsWorkspace tab="members" dialog="history" />
} satisfies Story

/** The Lunacy "Confirm transfer" frame. */
export const ConfirmTransfer = {
  render: () => <SettingsWorkspace dialog="transfer" />
} satisfies Story

/** The Lunacy "Confirm remove" frame. */
export const ConfirmRemove = {
  render: () => <SettingsWorkspace tab="members" selected="alex" dialog="remove" />
} satisfies Story

/** The Lunacy "Confirm revoke" frame. */
export const ConfirmRevoke = {
  render: () => <SettingsWorkspace tab="members" dialog="revoke" />
} satisfies Story

/** A member who may only look: no rename, invite, role, removal, or transfer. */
export const ReadOnly = {
  render: () => <SettingsWorkspace tab="members" selected="alex" readOnly />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("button", { name: "Invite people" })).toBeNull()
    const panel = await canvas.findByLabelText("Member details", { selector: "aside" })
    await expect(within(panel).queryByRole("button", { name: "Remove member" })).toBeNull()
    await expect(within(panel).queryByRole("button", { name: "Save role" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /Revoke invitation/ })).toBeNull()
  }
} satisfies Story

export const Loading = { render: () => <SettingsWorkspace status="loading" /> } satisfies Story

/**
 * The Lunacy "05 / Invite role options" and "06 / Invitation created" frames: choosing a role,
 * creating the invitation, which leads Pending marked, and its toast.
 */
export const InviteFlow = {
  render: () => <SettingsWorkspace tab="members" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Invite people" }))
    const dialog = await body(canvasElement).findByRole("dialog", { name: "Invite member" })
    const create = within(dialog).getByRole("button", { name: "Create invitation" })
    await expect(create).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText("Sign-in email"), "morgan@mercier.example")
    await userEvent.click(within(dialog).getByRole("button", { name: /Workspace role/ }))
    await userEvent.click(await body(canvasElement).findByRole("option", { name: "Administrator" }))
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: /Workspace role/ })).toHaveTextContent("Administrator")
    )
    await userEvent.click(create)
    await waitFor(() => expect(body(canvasElement).queryByRole("dialog", { name: "Invite member" })).toBeNull())
    const pending = within(canvas.getByRole("list", { name: "Pending invitations" }))
    const first = pending.getAllByRole("listitem")[0]!
    await expect(first).toHaveTextContent("morgan@mercier.example")
    await expect(first).toHaveTextContent("Administrator · Expires in 7 days")
    await expect(first).toHaveAttribute("data-highlight")
    await expect(await canvas.findByText("Invitation created")).toBeVisible()
  }
} satisfies Story

/** Changing a member's role in their details, then saving it. */
export const ChangeRole = {
  render: () => <SettingsWorkspace tab="members" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(roster(canvasElement).getByRole("link", { name: /Alex Morgan/ }))
    const panel = await canvas.findByLabelText("Member details", { selector: "aside" })
    const save = within(panel).getByRole("button", { name: "Save role" })
    await expect(save).toBeDisabled()
    await userEvent.click(within(panel).getByRole("button", { name: /Workspace role/ }))
    await userEvent.click(await body(canvasElement).findByRole("option", { name: "Administrator" }))
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)
    await expect(await canvas.findByText("Role saved for Alex Morgan")).toBeVisible()
    await waitFor(() =>
      expect(roster(canvasElement).getByRole("link", { name: /Alex Morgan/ })).toHaveTextContent("Administrator")
    )
  }
} satisfies Story

/** Removing a member after confirming; they move to Removed members. */
export const RemoveMember = {
  render: () => <SettingsWorkspace tab="members" selected="alex" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await canvas.findByLabelText("Member details", { selector: "aside" })
    await userEvent.click(within(panel).getByRole("button", { name: "Remove member" }))
    const dialog = await body(canvasElement).findByRole("dialog", { name: "Remove member" })
    await expect(within(dialog).getByText("Remove Alex Morgan?")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove member" }))
    await expect(await canvas.findByText("Alex Morgan was removed")).toBeVisible()
    await waitFor(() => expect(roster(canvasElement).queryByRole("link", { name: /Alex Morgan/ })).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Active members" }))
    await userEvent.click(await body(canvasElement).findByRole("menuitemradio", { name: "Removed members" }))
    const removed = await canvas.findByRole("list", { name: "Removed members" })
    await expect(within(removed).getByRole("link", { name: /Alex Morgan/ })).toBeVisible()
  }
} satisfies Story

/** Revoking from the history: only pending invitations offer it. */
export const RevokeFromHistory = {
  render: () => <SettingsWorkspace tab="members" dialog="history" />,
  play: async ({ canvasElement }) => {
    const history = await body(canvasElement).findByRole("dialog", { name: "Invitations" })
    await expect(within(history).getAllByRole("button", { name: /Revoke invitation/ })).toHaveLength(2)
    await userEvent.click(within(history).getByRole("button", { name: "Revoke invitation for casey@mercier.example" }))
    const confirm = await body(canvasElement).findByRole("dialog", { name: "Revoke invitation" })
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoke invitation" }))
    await expect(await within(canvasElement).findByText("Invitation revoked")).toBeVisible()
  }
} satisfies Story

/** Transferring ownership to a chosen member, who becomes the owner. */
export const TransferFlow = {
  render: () => <SettingsWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Transfer ownership" }))
    const dialog = await body(canvasElement).findByRole("dialog", { name: "Transfer ownership" })
    const confirm = within(dialog).getByRole("button", { name: "Transfer ownership" })
    await expect(confirm).toBeDisabled()
    await userEvent.click(within(dialog).getByRole("button", { name: /New owner/ }))
    await userEvent.click(await body(canvasElement).findByRole("option", { name: "Alex Morgan" }))
    await expect(within(dialog).getByText(/Alex Morgan becomes the only owner/)).toBeVisible()
    await userEvent.click(confirm)
    await expect(await canvas.findByText("Alex Morgan is now the owner")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Transfer ownership" })).toBeNull()
  }
} satisfies Story

/** A rename saved elsewhere meanwhile: the draft stays, Refresh, then save again. */
export const StaleRename = {
  render: () => <SettingsWorkspace conflict="rename" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText("Workspace name")
    await userEvent.clear(input)
    await userEvent.type(input, "Mercier Studio")
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(/changed while you were editing/)
    await expect(input).toHaveValue("Mercier Studio")
    await userEvent.click(canvas.getByRole("button", { name: "Refresh" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }))
    await expect(await canvas.findByText("Workspace renamed")).toBeVisible()
  }
} satisfies Story
