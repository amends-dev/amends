import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { GroupWorkspace } from "./group.fixture.tsx"

const meta = {
  title: "Screens/Create group",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

/** The Lunacy "Create group / Open form" frame. */
export const OpenForm = {
  render: () => <GroupWorkspace creating />
} satisfies Story

/** Naming the group, making it public, and choosing members, then creating it: the new group
 * opens with its welcome and a "Group created" toast. */
export const CreateAndOpen = {
  render: () => <GroupWorkspace creating />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dialog = within(await canvas.findByRole("dialog", { name: "Create group" }))
    const create = dialog.getByRole("button", { name: "Create group" })
    await expect(create).toBeDisabled()
    await userEvent.type(dialog.getByRole("textbox", { name: "Group name" }), "release-planning")
    await userEvent.click(dialog.getByRole("radio", { name: "Public" }))
    const picker = dialog.getByRole("combobox", { name: "Members" })
    await userEvent.type(picker, "alex{Enter}")
    // The picker empties itself after each choice; clearing resets user-event's own copy.
    await userEvent.clear(picker)
    await userEvent.type(picker, "sara{Enter}")
    await expect(dialog.getByText("3 members, including you.")).toBeVisible()
    await userEvent.click(create)
    await waitFor(() => expect(canvas.queryByRole("dialog", { name: "Create group" })).toBeNull())
    await expect(canvas.getByRole("heading", { name: "Welcome to #release-planning" })).toBeVisible()
    await expect(canvas.getByText("You, Alex Morgan, and Sara are members.")).toBeVisible()
    await expect(within(canvas.getByRole("list", { name: "Notifications" })).getByRole("status")).toHaveTextContent(
      "Group created"
    )
    await expect(canvas.getByRole("link", { name: "release-planning" })).toHaveAttribute("aria-current", "page")
  }
} satisfies Story
