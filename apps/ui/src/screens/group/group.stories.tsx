import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { GroupWorkspace } from "./group.fixture.tsx"

const meta = {
  title: "Screens/Group threads",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

/** A group's threads: the Lunacy "Group / Threads" frame. */
export const Threads = {
  render: () => <GroupWorkspace />
} satisfies Story

/** With AJ's thread open beside it: the Lunacy "Group / Threads + open thread" frame. */
export const ThreadOpen = {
  render: () => <GroupWorkspace thread />
} satisfies Story

/** Opening a thread from its replies, replying, and closing it. */
export const Reply = {
  render: () => <GroupWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "4 replies" }))
    const input = await canvas.findByRole("textbox", { name: "Reply in thread" })
    await userEvent.type(input, "On it{Enter}")
    await waitFor(() => expect(input).toHaveTextContent(""))
    await expect(canvas.getByText("On it")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Close thread" }))
    await waitFor(() => expect(canvas.queryByRole("textbox", { name: "Reply in thread" })).toBeNull())
  }
} satisfies Story

/** "/" as the whole draft offers commands; they act rather than post, as /rename opens settings. */
export const Commands = {
  render: () => <GroupWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = await canvas.findByRole("combobox", { name: "Message #general" })
    await userEvent.type(input, "/fol{Enter}")
    await expect(await canvas.findByText("Following #general")).toBeVisible()
    await userEvent.type(input, "/")
    const commands = within(await canvas.findByRole("listbox", { name: "Commands" }))
    await expect(commands.getByRole("option", { name: /unfollow/u })).toBeVisible()
    await userEvent.type(input, "ren{Enter}")
    const dialog = within(await canvas.findByRole("dialog", { name: "Group settings" }))
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "Group name" })).toHaveFocus())
    await expect(input).toHaveTextContent("")
  }
} satisfies Story

/** Sending to the group and reacting. Shift+Enter keeps writing on a new line. */
export const Send = {
  render: () => <GroupWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const send = canvas.getByRole("button", { name: "Send" })
    await expect(send).toBeDisabled()
    const input = await canvas.findByRole("combobox", { name: "Message #general" })
    await userEvent.type(input, "Lunch at noon?{Shift>}{Enter}{/Shift}Anyone")
    await expect(input.querySelector("br")).not.toBeNull()
    await expect(input).toHaveTextContent("Lunch at noon?Anyone")
    await userEvent.click(send)
    await waitFor(() => expect(input).toHaveTextContent(""))
    await expect(canvas.getByText(/Lunch at noon\?/)).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "🔥 3" }))
    await expect(canvas.getByRole("button", { name: "🔥 4" })).toHaveAttribute("aria-pressed", "true")
  }
} satisfies Story
