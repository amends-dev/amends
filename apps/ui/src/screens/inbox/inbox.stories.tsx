import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { InboxWorkspace } from "./inbox.fixture.tsx";

const meta = {
  title: "Screens/Inbox",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The Lunacy "Inbox / 01 / All activity" frame. */
export const AllActivity = { render: () => <InboxWorkspace tab="all" /> } satisfies Story;

/** The Lunacy "Inbox / 02 / Unread and open thread" frame. */
export const UnreadWithThread = {
  render: () => <InboxWorkspace tab="unread" selected="sara" />,
} satisfies Story;

/** The Lunacy "Inbox / 03 / All caught up" frame. */
export const CaughtUp = {
  render: () => (
    <InboxWorkspace tab="unread" items={[{ id: "old", at: new Date(), unread: false }]} />
  ),
} satisfies Story;

/** The Lunacy "Inbox / 07 / First use" frame. */
export const FirstUse = {
  render: () => <InboxWorkspace tab="all" items={[]} />,
} satisfies Story;

export const Loading = { render: () => <InboxWorkspace status="loading" /> } satisfies Story;

/**
 * The mocks' selection flow in Unread: opening marks seen and keeps the row while its thread is
 * open; choosing another drops it; closing the last shows the caught-up state.
 */
export const SelectionFlow = {
  render: () => <InboxWorkspace tab="unread" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = () => canvas.getByRole("list", { name: "Unread notifications" });
    await expect(within(list()).getAllByRole("link")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("link", { name: "Sara mentioned you" }));
    const thread = await canvas.findByLabelText("Thread", { selector: "aside" });
    await expect(within(thread).getByText("Mention · #general")).toBeVisible();
    // Seen, but kept in place while its thread is open.
    await expect(canvas.getByRole("link", { name: "Sara mentioned you" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(within(list()).getAllByRole("img", { name: "unread" })).toHaveLength(2);
    // Choosing another drops the previous row.
    await userEvent.click(canvas.getByRole("link", { name: "Alex replied" }));
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "Sara mentioned you" })).toBeNull(),
    );
    await userEvent.click(canvas.getByRole("link", { name: "Graeme started a thread" }));
    // The last one: nothing unread, yet the row stays until its thread closes.
    await waitFor(() => expect(canvas.queryByRole("img", { name: "unread" })).toBeNull());
    await expect(canvas.getByRole("link", { name: "Graeme started a thread" })).toBeVisible();
    await userEvent.click(within(thread).getByRole("button", { name: "Close thread" }));
    await expect(await canvas.findByText("You’re all caught up")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "View all activity" }));
    await expect(canvas.getByRole("list", { name: "Notifications" })).toBeVisible();
  },
} satisfies Story;

/** Unread opens first; Mark all seen clears every unread dot, then hides itself. */
export const MarkAllSeen = {
  render: () => <InboxWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("img", { name: "unread" }).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "Mark all seen" }));
    await expect(canvas.queryByRole("img", { name: "unread" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Mark all seen" })).toBeNull();
  },
} satisfies Story;
