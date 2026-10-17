import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { GroupWorkspace } from "./group.fixture.tsx"

const meta = {
  title: "Screens/Group settings",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

/** The Lunacy "Group settings / General" frame, over the group. */
export const General = {
  render: () => <GroupWorkspace settings="general" />
} satisfies Story

/** The Lunacy "Group settings / Members" frame. */
export const Members = {
  render: () => <GroupWorkspace settings="members" />
} satisfies Story

/**
 * The workspace's general group: everyone joins it with the workspace, so there is no Leave, no
 * adding, and no removing.
 */
export const WorkspaceGeneral = {
  render: () => <GroupWorkspace settings="general" general />,
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement).findByRole("dialog", { name: "Group settings" }))
    await expect(dialog.getByText("Everyone in the workspace belongs to this group.")).toBeVisible()
    await expect(dialog.queryByRole("button", { name: "Leave group" })).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: /Members/ }))
    await expect(dialog.getByText("Yumi")).toBeVisible()
    await expect(dialog.queryByRole("button", { name: /^Remove / })).toBeNull()
    await expect(dialog.queryByRole("combobox", { name: "Add members" })).toBeNull()
  }
} satisfies Story

/** Renaming and making the group public; Save waits for a change and a name. */
export const Rename = {
  render: () => <GroupWorkspace settings="general" />,
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement).findByRole("dialog", { name: "Group settings" }))
    const save = dialog.getByRole("button", { name: "Save changes" })
    await expect(save).toBeDisabled()
    const name = dialog.getByRole("textbox", { name: "Group name" })
    await userEvent.clear(name)
    await expect(dialog.getByText("Give the group a name.")).toBeVisible()
    await expect(save).toBeDisabled()
    await userEvent.type(name, "release")
    await userEvent.click(dialog.getByRole("radio", { name: "Public" }))
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await expect(dialog.getByText("# release")).toBeVisible()
    await expect(save).toBeDisabled()
  }
} satisfies Story

/** Choosing two workspace members with the keyboard and mouse, then adding them. */
export const AddMembers = {
  render: () => <GroupWorkspace settings="members" />,
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement).findByRole("dialog", { name: "Group settings" }))
    const picker = dialog.getByRole("combobox", { name: "Add members" })
    await userEvent.click(picker)
    await userEvent.keyboard("{ArrowDown}{Enter}")
    await userEvent.clear(picker)
    await userEvent.type(picker, "tay")
    await userEvent.click(dialog.getByRole("option", { name: /Taylor Reed/ }))
    await expect(dialog.getByRole("button", { name: "Remove Morgan Lee" })).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Add 2" }))
    await waitFor(() =>
      expect(within(dialog.getByRole("list", { name: "Members" })).getAllByRole("listitem")).toHaveLength(9)
    )
    await expect(dialog.getByRole("button", { name: /Members/ })).toHaveTextContent("9")
  }
} satisfies Story
