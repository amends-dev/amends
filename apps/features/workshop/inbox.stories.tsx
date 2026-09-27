import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { InboxFixture } from "./inbox.fixture.tsx";

const meta = {
  title: "Features/Inbox",
  component: InboxFixture,
  parameters: { layout: "padded" as const },
} satisfies Meta<typeof InboxFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Newest first; seen, filtered, and live over the real host. */
export const Inbox = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inbox = await canvas.findByRole("list", { name: "Notifications" }, { timeout: 20000 });
    const cards = within(inbox);
    // The mention and the reply in a thread the owner follows came to them, newest first.
    await waitFor(() => expect(cards.getAllByRole("listitem")).toHaveLength(2));
    const [mention, reply] = cards.getAllByRole("listitem");
    await expect(mention).toHaveTextContent("mentioned you · #Design");
    await expect(mention).toHaveTextContent("can you approve the September close?");
    await expect(reply).toHaveTextContent("replied · #Design");
    await expect(cards.getAllByRole("img", { name: "unread" })).toHaveLength(2);
    // Marking one seen keeps it in the inbox without its dot.
    await userEvent.click(within(mention!).getByRole("button", { name: "Mark seen" }));
    await waitFor(() => expect(cards.getAllByRole("img", { name: "unread" })).toHaveLength(1));
    // A new mention arrives at the top over the live feed.
    await userEvent.click(canvas.getByRole("button", { name: "Mention owner as member" }));
    await waitFor(() => expect(cards.getAllByRole("listitem")).toHaveLength(3), {
      timeout: 10000,
    });
    await expect(cards.getAllByRole("listitem")[0]).toHaveTextContent("the receipts are in.");
    // Unread narrows the inbox to what is still pending.
    await userEvent.click(canvas.getByRole("radio", { name: "Unread" }));
    const unread = await canvas.findByRole("list", { name: "Unread notifications" });
    await waitFor(() => expect(within(unread).getAllByRole("listitem")).toHaveLength(2));
    // Marking all seen clears what is unread, through the newest shown.
    await userEvent.click(canvas.getByRole("button", { name: "Mark all seen" }));
    await canvas.findByText("Nothing needs you", {}, { timeout: 10000 });
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Mark all seen" })).toBeNull());
  },
} satisfies Story;

export const Soot = { args: { theme: "soot" } } satisfies Story;
