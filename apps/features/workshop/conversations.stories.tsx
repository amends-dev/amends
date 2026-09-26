import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ConversationsFixture } from "./conversations.fixture.tsx";

const meta = {
  title: "Features/Conversations",
  component: ConversationsFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof ConversationsFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Group = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stream = await canvas.findByRole("region", { name: "Design" }, { timeout: 20000 });
    const entries = within(stream);
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(3));
    await expect(entries.getByText("Today")).toBeVisible();
    await expect(canvas.getByRole("link", { name: /Design/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The thread the owner replied to shows its replies; opening it lists them.
    const open = entries.getByRole("link", { name: /^2 replies last at/ });
    await userEvent.click(open);
    const thread = await canvas.findByRole("region", { name: "Thread messages" });
    await waitFor(() => expect(within(thread).getAllByRole("article")).toHaveLength(3));
    await expect(canvas.getByText("3 messages")).toBeVisible();
    await waitFor(() => expect(open).toHaveAttribute("aria-current", "page"));
    // A reply from the other member arrives in the thread and its count over the live feed.
    await userEvent.click(canvas.getByRole("button", { name: "Reply as member" }));
    await waitFor(() => expect(within(thread).getAllByRole("article")).toHaveLength(4), {
      timeout: 10000,
    });
    await waitFor(() => expect(entries.getByRole("link", { name: /^3 replies/ })).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Start thread as member" }));
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(4), {
      timeout: 10000,
    });
    await userEvent.click(canvas.getByRole("button", { name: "Close thread" }));
    await waitFor(() =>
      expect(canvas.queryByRole("region", { name: "Thread messages" })).toBeNull(),
    );
  },
} satisfies Story;
export const ManyThreads = { args: { threads: 60 } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
