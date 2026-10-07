import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { TurnsWorkshop } from "./turns.fixture.tsx";

const meta = {
  title: "Screens/Turns",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** An agent asked in a thread waits to start: its row, a mark in the stream, and one in the sidebar. */
export const Queued = {
  render: () => <TurnsWorkshop scenario="queued" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = within(canvas.getByRole("group", { name: "Yumi’s turn" }));
    await expect(row.getByRole("status")).toHaveTextContent("Queued");
    await expect(row.getByRole("button", { name: "Stop Yumi" })).toBeEnabled();
    await expect(canvas.getByText("Yumi queued")).toBeVisible();
  },
} satisfies Story;

/** Working, with the mark's stitches lit; Stop asks it to stop and shows Stopping… at once. */
export const Working = {
  render: () => <TurnsWorkshop scenario="working" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = within(canvas.getByRole("group", { name: "Yumi’s turn" }));
    await expect(row.getByRole("status")).toHaveTextContent("Working");
    await userEvent.click(row.getByRole("button", { name: "Stop Yumi" }));
    await expect(row.getByRole("status")).toHaveTextContent("Stopping…");
    await expect(row.getByRole("button", { name: "Stopping" })).toBeDisabled();
  },
} satisfies Story;

export const Stopping = { render: () => <TurnsWorkshop scenario="stopping" /> } satisfies Story;
export const Stopped = { render: () => <TurnsWorkshop scenario="stopped" /> } satisfies Story;

/** A failure names its reason, offers the agent's settings, and runs again as a new attempt. */
export const FailedWithRetry = {
  render: () => <TurnsWorkshop scenario="failed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Anthropic needs its API key.")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Agent settings" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    // The failed attempt stays where it was, and the new one follows it.
    const [failed, retried] = canvas.getAllByRole("group", { name: "Yumi’s turn" });
    await expect(within(failed!).getByRole("status")).toHaveTextContent("Failed");
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();
    await expect(within(retried!).getByRole("status")).toHaveTextContent("Queued");
  },
} satisfies Story;

export const StoppedWhenAgentLeft = {
  render: () => <TurnsWorkshop scenario="departed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Yumi stopped taking part in this thread.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();
  },
} satisfies Story;

/** The reply is the agent's own message, with its turn's log a click away. */
export const Replied = {
  render: () => <TurnsWorkshop scenario="done" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The reply's actions show under the pointer, or to the keyboard, as here.
    const reply = canvas.getByText(/Deploy the API first/u).closest("article")!;
    within(reply).getByRole("button", { name: "View turn log" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByText("Reply posted")).toBeVisible();
    await expect(canvas.getByText("This response was posted to the thread.")).toBeVisible();
  },
} satisfies Story;

export const CompletedWithoutReply = {
  render: () => <TurnsWorkshop scenario="done-quietly" />,
} satisfies Story;

/** A reader who cannot direct the agent follows the turn but cannot stop it. */
export const FollowOnly = {
  render: () => <TurnsWorkshop scenario="follow-only" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Stop Yumi" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "View log" })).toBeVisible();
  },
} satisfies Story;

export const StopFailed = {
  render: () => <TurnsWorkshop scenario="stop-failed" />,
} satisfies Story;

/** The log while queued: nothing recorded yet. */
export const LogQueued = {
  render: () => <TurnsWorkshop scenario="queued" log />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Waiting to start. There is no output yet.")).toBeVisible();
    await expect(canvas.getByText("Waiting for activity")).toBeVisible();
  },
} satisfies Story;

/** The reply streaming into its draft, not posted until the turn closes. */
export const LogStreaming = {
  render: () => (
    <TurnsWorkshop
      scenario="working"
      log
      draft="Deploy the API first, verify compatibility, then release clients on Thursday. Keep rollback"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Streaming")).toBeVisible();
    await expect(canvas.getByText("Draft output · not posted to the thread yet")).toBeVisible();
    await expect(canvas.getByText("Following live")).toBeVisible();
    await expect(canvas.getByText("Harness · opencode")).toBeVisible();
    await expect(canvas.getByText("Sandbox · Daytona")).toBeVisible();
  },
} satisfies Story;

/** Live updates dropped: the last output stays, paused, while the turn keeps working. */
export const LogReconnecting = {
  render: () => (
    <TurnsWorkshop
      scenario="working"
      log
      reconnecting
      draft="Deploy the API first, verify compatibility, then release clients on Thursday. Keep rollback"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Live updates disconnected")).toBeVisible();
    await expect(canvas.getByText("Paused")).toBeVisible();
  },
} satisfies Story;

/** A turn that failed before it started, with where to fix it and a new attempt. */
export const LogFailed = {
  render: () => <TurnsWorkshop scenario="failed" log failedEarly />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("This turn failed before execution started.")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Agent settings" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Retry turn" })).toBeVisible();
  },
} satisfies Story;

export const LogCompleted = {
  render: () => <TurnsWorkshop scenario="done" log />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "View reply in thread" })).toBeVisible();
  },
} satisfies Story;
