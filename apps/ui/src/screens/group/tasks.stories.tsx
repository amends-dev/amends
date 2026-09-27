import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { GroupWorkspace } from "./group.fixture.tsx";

const meta = {
  title: "Screens/Group tasks",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The Lunacy "Group tasks / All tasks" frame. */
export const AllTasks = {
  render: () => <GroupWorkspace tab="tasks" />,
} satisfies Story;

/** The Lunacy "Task open in context panel" frame. */
export const TaskOpen = {
  render: () => <GroupWorkspace tab="tasks" task="AND-214" />,
} satisfies Story;

/** Searching, filtering by status, and opening a task, then changing its state. */
export const FilterAndOpen = {
  render: () => <GroupWorkspace tab="tasks" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = () => within(canvas.getByRole("list", { name: "Tasks" }));
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search tasks…" }), "composer");
    await waitFor(() => expect(list().getAllByRole("link")).toHaveLength(2));
    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search tasks…" }));
    await userEvent.click(canvas.getByRole("button", { name: "Status" }));
    const done = await within(canvasElement.ownerDocument.body).findByRole("menuitemradio", {
      name: "Done",
    });
    await userEvent.click(done);
    await waitFor(() => expect(list().getAllByRole("link")).toHaveLength(4));
    await userEvent.click(list().getByRole("link", { name: /AND-211/ }));
    const panel = await canvas.findByRole("complementary", {
      name: "Align thread header and composer",
    });
    await expect(within(panel).getByText("Task in #general")).toBeVisible();
  },
} satisfies Story;
