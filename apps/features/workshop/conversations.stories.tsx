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
    // The owner replied there, so they take part in it and follow it.
    await canvas.findByText("3 messages · following", {}, { timeout: 10000 });
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
export const Reading = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stream = await canvas.findByRole("region", { name: "Design" }, { timeout: 20000 });
    const entries = within(stream);
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(3));
    // The member's threads are new to the owner; the one the owner replied to is read.
    await waitFor(() => expect(entries.getAllByRole("img", { name: "unread" })).toHaveLength(2));
    // Seeing the stream catches the owner up with the group, so its sidebar dot clears.
    await waitFor(() => expect(canvas.queryByRole("img", { name: "new activity" })).toBeNull());
    // A reply addressed to the owner shows as a count and marks its thread unread.
    await userEvent.click(canvas.getByRole("button", { name: "Reply as member" }));
    const replied = await entries.findByRole(
      "link",
      { name: /^unread 3 replies/ },
      { timeout: 10000 },
    );
    await waitFor(() => expect(canvas.getByLabelText("1 for you")).toBeVisible());
    // Opening the thread reads it: its dot and the count clear.
    await userEvent.click(replied);
    await canvas.findByRole("region", { name: "Thread messages" });
    await waitFor(() => expect(entries.getByRole("link", { name: /^3 replies/ })).toBeVisible(), {
      timeout: 10000,
    });
    await waitFor(() => expect(canvas.queryByLabelText("1 for you")).toBeNull());
    await expect(entries.getAllByRole("img", { name: "unread" })).toHaveLength(2);
  },
} satisfies Story;
export const Typing = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stream = await canvas.findByRole("region", { name: "Design" }, { timeout: 20000 });
    const entries = within(stream);
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(3));
    await userEvent.click(entries.getByRole("link", { name: /2 replies/ }));
    const thread = await canvas.findByRole("region", { name: "Thread messages" });
    // The member typing shows in the thread and on its row in the stream.
    await userEvent.click(canvas.getByRole("button", { name: "Type as member" }));
    await waitFor(() =>
      expect(within(thread).getByText("member@example.test is typing…")).toBeVisible(),
    );
    await expect(
      entries.getByRole("link", { name: /member@example.test is typing…/ }),
    ).toBeVisible();
    // Their message arriving ends it.
    await userEvent.click(canvas.getByRole("button", { name: "Reply as member" }));
    await waitFor(() => expect(within(thread).getAllByRole("article")).toHaveLength(4), {
      timeout: 10000,
    });
    await waitFor(() => expect(within(thread).queryByText(/is typing/)).toBeNull());
    await expect(entries.queryByText(/is typing/)).toBeNull();
  },
} satisfies Story;
export const Following = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stream = await canvas.findByRole("region", { name: "Design" }, { timeout: 20000 });
    const entries = within(stream);
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(3));
    // Following the group makes threads started there afterwards include the owner.
    await canvas.findByText("Follow to take part in new threads here.", {}, { timeout: 10000 });
    await userEvent.click(canvas.getByRole("button", { name: "Follow" }));
    await canvas.findByText("Following: new threads here include you.", {}, { timeout: 10000 });
    await waitFor(() => {
      if (canvas.getByRole("button", { name: "Unfollow" }).getAttribute("aria-busy") === "true")
        throw new Error("Unfollow is pending");
    });
    await userEvent.click(canvas.getByRole("button", { name: "Start thread as member" }));
    await waitFor(() => expect(entries.getAllByRole("article")).toHaveLength(4), {
      timeout: 10000,
    });
    await waitFor(() => expect(canvas.getByLabelText("1 for you")).toBeVisible(), {
      timeout: 10000,
    });
    await userEvent.click(canvas.getByRole("button", { name: "Unfollow" }));
    await canvas.findByText("Follow to take part in new threads here.", {}, { timeout: 10000 });
    // Following a thread makes the owner take part in it; the panel says so.
    await userEvent.click(entries.getAllByRole("link", { name: /reply in thread/ })[0]!);
    // The panel is an aside beside the stream when wide, a sheet when narrow; its content moves
    // between them once it knows, so it is found again for each look.
    await canvas.findByRole("region", { name: "Thread messages" });
    const panel = () =>
      within(
        canvas
          .getByRole("region", { name: "Thread messages" })
          .closest<HTMLElement>("aside, dialog")!,
      );
    // A follow change stays pending until the thread's participants show it.
    const button = (name: string) =>
      waitFor(
        () => {
          const found = panel().getByRole("button", { name });
          if (found.getAttribute("aria-busy") === "true") throw new Error(`${name} is pending`);
          return found;
        },
        { timeout: 10000 },
      );
    await userEvent.click(await button("Follow"));
    await button("Unfollow");
    await waitFor(() => expect(panel().getByText(/· following$/)).toBeVisible());
    await userEvent.click(await button("Unfollow"));
    await button("Follow");
    await expect(panel().queryByText(/· following$/)).toBeNull();
  },
} satisfies Story;
export const InboxView = {
  name: "Inbox",
  args: { view: "inbox" },
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
    // Opening the other reads its thread beside the inbox, which settles it too.
    await userEvent.click(within(reply!).getByRole("link", { name: "Open thread" }));
    const thread = await canvas.findByRole("region", { name: "Thread messages" });
    await waitFor(() => expect(within(thread).getAllByRole("article")).toHaveLength(4));
    await waitFor(() => expect(cards.queryAllByRole("img", { name: "unread" })).toHaveLength(0), {
      timeout: 10000,
    });
    // A new mention arrives at the top over the live feed.
    await userEvent.click(canvas.getByRole("button", { name: "Mention owner as member" }));
    await waitFor(() => expect(cards.getAllByRole("listitem")).toHaveLength(3), {
      timeout: 10000,
    });
    await expect(cards.getAllByRole("listitem")[0]).toHaveTextContent("the receipts are in.");
    // Unread narrows the inbox to what is still pending.
    await userEvent.click(canvas.getByRole("radio", { name: "Unread" }));
    const unread = await canvas.findByRole("list", { name: "Unread notifications" });
    await waitFor(() => expect(within(unread).getAllByRole("listitem")).toHaveLength(1));
    await expect(within(unread).getByRole("listitem")).toHaveTextContent("the receipts are in.");
  },
} satisfies Story;
export const ManyThreads = { args: { threads: 60 } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
