import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WorkspacesFixture } from "./workspaces.fixture.tsx";
import type { Command, Snapshot } from "./scenario.ts";
const meta = {
  title: "Features/Workspaces",
  component: WorkspacesFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof WorkspacesFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
async function setup(element: HTMLElement) {
  const canvas = within(element);
  await canvas.findByText(/0 workspaces|2 workspaces/, {}, { timeout: 15000 });
  const url = element.querySelector<HTMLElement>("[data-scenario-url]")?.dataset.scenarioUrl;
  if (!url) throw new Error("Missing scenario URL");
  const command = async (value: Command) => {
    const response = await fetch(`${url}/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    await expect(response.ok).toBe(true);
  };
  const snapshot = async (): Promise<Snapshot> => (await fetch(url)).json();
  const create = async () => {
    await userEvent.click(canvas.getByRole("button", { name: "New workspace" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Workspace name" }), "Studio");
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }));
  };
  const done = async () => {
    await canvas.findByRole("link", { name: "Studio 1 member · Owner" }, { timeout: 10000 });
    await expect(canvas.getByLabelText("Opened workspace").textContent).not.toBe("");
    await expect(canvas.getByText("1 workspace")).toBeVisible();
  };
  return { canvas, command, snapshot, create, done };
}
export const Playground = {} satisfies Story;
export const Populated = {
  args: { populated: true },
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await expect(s.canvas.getByRole("link", { name: "Home 1 member · Owner" })).toBeVisible();
    await expect(
      s.canvas.getByRole("link", { name: "Mercier & Co 1 member · Owner" }),
    ).toBeVisible();
    await expect(s.canvas.queryByText("No workspaces yet")).not.toBeInTheDocument();
    await expect(
      s.canvas.queryByRole("button", { name: "Refresh workspaces" }),
    ).not.toBeInTheDocument();
  },
} satisfies Story;
export const Soot = { args: { populated: true, theme: "soot" } } satisfies Story;
export const Creation = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await expect(s.canvas.getByText("No workspaces yet")).toBeVisible();
    await s.create();
    await s.done();
  },
} satisfies Story;
export const LostResponse = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.command("lose-creation-response");
    await s.create();
    await s.canvas.findByText(/We couldn’t confirm creation/);
    await userEvent.click(s.canvas.getByRole("button", { name: "Create workspace" }));
    await s.done();
  },
} satisfies Story;
export const RefreshRecovery = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.command("fail-directory");
    await s.create();
    await s.canvas.findByText(/Your workspace was created, but/);
    await userEvent.click(s.canvas.getByRole("button", { name: "Try again" }));
    await s.done();
  },
} satisfies Story;
export const Pending = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.command("hold");
    await s.create();
    await waitFor(async () => expect((await s.snapshot()).held).toBe(true));
    const before = (await s.snapshot()).requests;
    await userEvent.click(s.canvas.getByRole("button", { name: "Create workspace" }));
    await expect((await s.snapshot()).requests).toBe(before);
    await s.command("release");
    await s.done();
  },
} satisfies Story;
export const UnmountPending = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.command("hold");
    await s.create();
    await waitFor(async () => expect((await s.snapshot()).held).toBe(true));
    await userEvent.click(s.canvas.getByRole("button", { name: "Unmount feature" }));
    await s.command("release");
    await waitFor(async () => expect((await s.snapshot()).held).toBe(false));
    await expect(s.canvas.getByLabelText("Opened workspace").textContent).toBe("");
  },
} satisfies Story;
