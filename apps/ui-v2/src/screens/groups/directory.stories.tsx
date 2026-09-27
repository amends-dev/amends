import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { GroupWorkspace } from "../group/group.fixture.tsx";

const meta = {
  title: "Screens/Browse groups",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The Lunacy "Browse groups / Your groups" frame. */
export const YourGroups = {
  render: () => <GroupWorkspace view={{ kind: "directory", tab: "joined" }} />,
} satisfies Story;

/** The Lunacy "Browse groups / Discover" frame. */
export const Discover = {
  render: () => <GroupWorkspace view={{ kind: "directory", tab: "discover" }} />,
} satisfies Story;

/** The Lunacy "Preview public group" frame: read before joining. */
export const PreviewPublicGroup = {
  render: () => <GroupWorkspace view={{ kind: "group", id: "launches" }} />,
} satisfies Story;

/** The Lunacy "Read a public thread before joining" frame: no composer until joined. */
export const ReadPublicThread = {
  render: () => <GroupWorkspace view={{ kind: "group", id: "launches" }} thread />,
} satisfies Story;

/** Opening a public group from Discover, reading it, and joining: the composer replaces the
 * prompt and the group joins the sidebar. */
export const PreviewAndJoin = {
  render: () => <GroupWorkspace view={{ kind: "directory", tab: "discover" }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "launches" }));
    await expect(await canvas.findByText("You’re previewing #launches")).toBeVisible();
    await expect(canvas.queryByRole("textbox", { name: "Message #launches" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "6 replies" }));
    const thread = await canvas.findByRole("complementary", { name: "Launch plan for next week" });
    await expect(within(thread).queryByRole("textbox")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Join group" }));
    await expect(await canvas.findByRole("textbox", { name: "Message #launches" })).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "Notifications" })).getByRole("status"),
    ).toHaveTextContent("Joined #launches");
    const sidebar = within(canvas.getByRole("navigation", { name: "Workspace" }));
    await expect(sidebar.getByRole("link", { name: "launches" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
} satisfies Story;

/** Joining from Discover keeps you there, with a toast to open the group. */
export const JoinFromDiscover = {
  render: () => <GroupWorkspace view={{ kind: "directory", tab: "discover" }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search public groups…" }), "lau");
    await userEvent.click(canvas.getByRole("button", { name: "Join launches" }));
    await waitFor(() => expect(canvas.getByText("No groups match this search.")).toBeVisible());
    await expect(
      within(canvas.getByRole("list", { name: "Notifications" })).getByRole("status"),
    ).toHaveTextContent("Joined #launches");
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await expect(await canvas.findByRole("textbox", { name: "Message #launches" })).toBeVisible();
  },
} satisfies Story;
