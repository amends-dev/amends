import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Conversation } from "./conversation.fixture.tsx";

const meta = {
  title: "Screens/Live conversation",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** Dated messages with day seams, an unread reply summary, and someone typing a first reply. */
export const Stream = {
  render: () => <Conversation earlier />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Yesterday")).toBeVisible();
    await expect(canvas.getByText("Today")).toBeVisible();
    await expect(canvas.getByRole("button", { name: /unread 2 replies/ })).toBeVisible();
    await expect(canvas.getByText("Yumi is typing…")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Show earlier threads" })).toBeVisible();
  },
} satisfies Story;

/** An older page that failed says so, and offers to try again. */
export const EarlierFailed = {
  render: () => <Conversation earlier="failed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Couldn’t load earlier threads.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible();
  },
} satisfies Story;

/** The thread beside it: notes, typing, and following. */
export const OpenThread = {
  render: () => <Conversation open />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Sara followed this thread")).toBeVisible();
    await expect(canvas.getByText("You stopped following")).toBeVisible();
    await expect(canvas.getByText("Sara is typing…")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Follow thread" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  },
} satisfies Story;

/** A message with no replies offers to reply in its thread among its actions, shown on hover. */
export const ReplyInThread = {
  render: () => <Conversation />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Its actions show under the pointer, or to the keyboard, as here.
    const message = canvas.getByText("Lunch at noon?").closest("article")!;
    const actions = within(message).getByRole("group", { name: "Message actions" });
    within(actions).getByRole("button", { name: "Reply in thread" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("combobox", { name: "Reply in thread" })).toBeVisible();
  },
} satisfies Story;

/** Typing "@" suggests people; choosing one puts them in the draft as one piece. */
export const Mentions = {
  render: () => <Conversation />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("combobox", { name: "Message #general" });
    await userEvent.type(input, "Thanks @sa");
    const options = within(await canvas.findByRole("listbox", { name: "People to mention" }));
    await expect(options.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    await expect(input.querySelector("[data-member=sara]")).toHaveTextContent("@Sara Lind");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(input).toHaveTextContent(""));
    const sent = canvas.getByText("Thanks");
    await expect(within(sent).getByText("@Sara Lind")).toBeVisible();
  },
} satisfies Story;

/** Following the group from its bell. */
export const Follow = {
  render: () => <Conversation />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bell = canvas.getByRole("button", { name: "Following" });
    await expect(bell).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(bell);
    await expect(canvas.getByRole("button", { name: "Follow" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  },
} satisfies Story;

/** Loading, closed, and failed conversations. */
export const Loading = { render: () => <Conversation status="loading" /> } satisfies Story;
export const Unavailable = { render: () => <Conversation status="unavailable" /> } satisfies Story;
export const Failed = {
  render: () => <Conversation status="failed" threadStatus="failed" open />,
} satisfies Story;

/** The account menu from the rail's avatar. */
export const AccountMenu = {
  render: () => <Conversation menu />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Account: Jordan Mercier" }));
    const menu = within(await within(document.body).findByRole("menu"));
    await expect(menu.getByText("jordan@mercier.example")).toBeVisible();
    await userEvent.click(menu.getByRole("menuitemradio", { name: "Dark" }));
  },
} satisfies Story;
