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
    // The sidebar's groups load on their own, alongside the stream.
    await waitFor(() =>
      expect(canvas.getByRole("link", { name: /Design/ })).toHaveAttribute("aria-current", "page"),
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
export const Writing = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stream = await canvas.findByRole("region", { name: "Design" }, { timeout: 20000 });
    const entries = within(stream);
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(3));
    // Writing on the page starts a thread.
    const page = await canvas.findByRole("textbox", { name: "Message #Design" });
    await expect(page).toHaveAccessibleDescription("Starts a new thread in #Design.");
    await userEvent.type(page, "A question for everyone{Enter}");
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(4));
    await expect(page).toHaveValue("");
    await expect(entries.getAllByRole("article").at(-1)).toHaveTextContent(
      "A question for everyone",
    );
    // @ suggests the group's other members; the chosen one is mentioned and shown as such.
    await userEvent.type(page, "Over to @mem");
    const people = await canvas.findByRole("listbox", { name: "People to mention" });
    await expect(within(people).getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    await expect(page).toHaveValue("Over to @member@example.test ");
    await userEvent.type(page, "for review{Enter}");
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(5));
    const mentioned = entries.getAllByRole("article").at(-1)!;
    await expect(within(mentioned).getByText("@member@example.test")).toBeVisible();
    // Writing in a thread replies there, and its count follows.
    await userEvent.click(entries.getByRole("link", { name: /^2 replies/ }));
    const thread = await canvas.findByRole("region", { name: "Thread messages" });
    await waitFor(() => expect(within(thread).getAllByRole("article")).toHaveLength(3));
    const reply = canvas.getByRole("textbox", { name: "Reply" });
    await userEvent.type(reply, "Following up.{Enter}");
    await waitFor(() => expect(within(thread).getAllByRole("article")).toHaveLength(4));
    await waitFor(() => expect(entries.getByRole("link", { name: /^3 replies/ })).toBeVisible());
    // A draft left in one thread is still there after visiting another.
    await userEvent.type(reply, "Unsent draft");
    await userEvent.click(entries.getAllByRole("link", { name: "reply in thread" })[0]!);
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Reply" })).toHaveValue(""));
    await userEvent.click(entries.getByRole("link", { name: /^3 replies/ }));
    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Reply" })).toHaveValue("Unsent draft"),
    );
  },
} satisfies Story;
export const ManyThreads = { args: { threads: 60 } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
