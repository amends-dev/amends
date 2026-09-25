import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { SettingsFixture } from "./settings.fixture.tsx";
const meta = {
  title: "Features/Settings",
  component: SettingsFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof SettingsFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
const control = async (canvasElement: HTMLElement, command: string) => {
  const url = canvasElement.querySelector<HTMLElement>("[data-scenario-url]")?.dataset.scenarioUrl;
  const response = await fetch(`${url}/control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error("Control failed.");
};
export const Workspace = {} satisfies Story;
export const Members = { args: { section: "members" } } satisfies Story;
export const Invites = { args: { section: "invites" } } satisfies Story;
export const Viewer = { args: { as: "Viewer" } } satisfies Story;
export const Soot = { args: { theme: "soot", section: "members" } } satisfies Story;
export const Rename = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole(
      "textbox",
      { name: "Workspace name" },
      { timeout: 15000 },
    );
    await userEvent.clear(input);
    await userEvent.type(input, "Studio");
    await userEvent.click(canvas.getByRole("button", { name: "Save name" }));
    await canvas.findByText("Saved.");
    await expect(canvas.getByText("Studio")).toBeVisible();
  },
} satisfies Story;
export const ReadOnly = {
  args: { as: "Viewer" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(
      "Only an authorized owner can rename this workspace.",
      {},
      { timeout: 15000 },
    );
    await expect(canvas.queryByRole("button", { name: "Save name" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "People" }));
    await userEvent.click(await canvas.findByRole("link", { name: /owner@example.test/ }));
    await canvas.findByRole("heading", { name: "Person" });
    await expect(canvas.queryByRole("button", { name: "Remove member" })).not.toBeInTheDocument();
  },
} satisfies Story;
export const InviteAndJoin = {
  args: { section: "invites" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole("textbox", { name: "Recipient" }, { timeout: 15000 }),
      "new@example.test",
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Role / }));
    await userEvent.click(within(document.body).getByRole("option", { name: "Viewer" }));
    await userEvent.click(canvas.getByRole("button", { name: "Create invitation" }));
    await canvas.findByText("Saved.");
    await userEvent.click(canvas.getByRole("button", { name: "Act as Recipient" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Accept invitation" }));
    await canvas.findByRole("link", { name: /Mercier & Co 4 members/ }, { timeout: 10000 });
    await expect(
      canvas.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
  },
} satisfies Story;
export const ChangeRole = {
  args: { section: "members" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("link", { name: /viewer@example.test/ }, { timeout: 15000 }),
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Workspace role / }));
    await userEvent.click(within(document.body).getByRole("option", { name: "Administrator" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }));
    await canvas.findByText("Saved.");
    await expect(canvas.getByRole("button", { name: /^Workspace role / })).toHaveTextContent(
      "Administrator",
    );
  },
} satisfies Story;
export const RemoveMember = {
  args: { section: "members" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("link", { name: /viewer@example.test/ }, { timeout: 15000 }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Remove member" }));
    await userEvent.click(within(document.body).getByRole("button", { name: "Confirm removal" }));
    await canvas.findByText(
      "This membership is closed. Invite the person again to create a new membership.",
    );
    await expect(canvas.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
  },
} satisfies Story;
export const TransferOwner = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Transfer ownership" }, { timeout: 15000 }),
    );
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: /^New owner / }));
    await userEvent.click(body.getByRole("option", { name: "viewer@example.test" }));
    await userEvent.click(body.getByRole("button", { name: "Confirm transfer" }));
    await canvas.findByText("Only an authorized owner can rename this workspace.");
    await expect(
      canvas.queryByRole("button", { name: "Transfer ownership" }),
    ).not.toBeInTheDocument();
  },
} satisfies Story;
export const RefreshRecovery = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole(
      "textbox",
      { name: "Workspace name" },
      { timeout: 15000 },
    );
    // Live updates also refresh the directory, so it stays failed until the story restores it.
    await control(canvasElement, "break-directory");
    await userEvent.clear(input);
    await userEvent.type(input, "Studio");
    await userEvent.click(canvas.getByRole("button", { name: "Save name" }));
    await canvas.findByText("Saved, but the latest data could not be loaded. Refresh to continue.");
    await control(canvasElement, "restore-directory");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(canvas.getByText("Studio")).toBeVisible());
  },
} satisfies Story;
export const StaleRename = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole(
      "textbox",
      { name: "Workspace name" },
      { timeout: 15000 },
    );
    await userEvent.clear(input);
    await userEvent.type(input, "My draft");
    await userEvent.click(canvas.getByRole("button", { name: "Rename elsewhere" }));
    await canvas.findByText("External rename complete");
    // The live rename reaches the details but not the draft, which still targets the old name.
    await waitFor(
      () =>
        expect(canvas.getByRole("complementary", { name: "Workspace details" })).toHaveTextContent(
          "Changed elsewhere",
        ),
      { timeout: 5000 },
    );
    await expect(input).toHaveValue("My draft");
    await userEvent.click(canvas.getByRole("button", { name: "Save name" }));
    await canvas.findByText(
      "This changed while you were editing. Refresh, review the latest values, and try again.",
    );
    await expect(input).toHaveValue("My draft");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(input).toHaveValue("Changed elsewhere"));
  },
} satisfies Story;
export const LostInvitationResponse = {
  args: { section: "invites" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole("textbox", { name: "Recipient" }, { timeout: 15000 }),
      "new@example.test",
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Role / }));
    await userEvent.click(within(document.body).getByRole("option", { name: "Viewer" }));
    const url =
      canvasElement.querySelector<HTMLElement>("[data-scenario-url]")?.dataset.scenarioUrl;
    const response = await fetch(`${url}/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("lose-invitation-response"),
    });
    await expect(response.ok).toBe(true);
    await userEvent.click(canvas.getByRole("button", { name: "Create invitation" }));
    await canvas.findByText(
      "The request could not be completed. Try again when the host is available.",
    );
    // A failed request leaves the form current: no refresh, just send it again.
    await expect(canvas.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Create invitation" }));
    // The retry carries the same key, so the host returns the invitation it already created.
    await canvas.findByText("Saved.");
    await expect(canvas.getAllByText("new@example.test")).toHaveLength(1);
    await userEvent.click(
      within(canvas.getByRole("list", { name: "Invitation history" })).getByRole("button", {
        name: "Revoke",
      }),
    );
    await userEvent.click(within(document.body).getByRole("button", { name: "Confirm revoke" }));
    await canvas.findByText("Revoked");
    await userEvent.click(canvas.getByRole("button", { name: "Act as Recipient" }));
    await canvas.findByText("0 workspaces");
    await expect(
      canvas.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
  },
} satisfies Story;
export const LiveRename = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole(
      "textbox",
      { name: "Workspace name" },
      { timeout: 15000 },
    );
    await expect(input).toHaveValue("Mercier & Co");
    await userEvent.click(canvas.getByRole("button", { name: "Rename elsewhere" }));
    await canvas.findByText("External rename complete");
    // Nothing here asked for a refresh: the change feed delivered the commit.
    await waitFor(() => expect(input).toHaveValue("Changed elsewhere"), { timeout: 5000 });
    await expect(
      canvas.getByRole("complementary", { name: "Workspace details" }),
    ).toHaveTextContent("Changed elsewhere");
    await expect(canvas.queryByText("Saved.")).not.toBeInTheDocument();
  },
} satisfies Story;
export const LiveInvitation = {
  args: { section: "invites" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("list", { name: "Invitation history" }, { timeout: 15000 });
    await userEvent.type(canvas.getByRole("textbox", { name: "Recipient" }), "draft@example.test");
    await userEvent.click(canvas.getByRole("button", { name: "Invite elsewhere" }));
    await canvas.findByText("External invitation complete");
    await canvas.findByText("elsewhere@example.test", {}, { timeout: 5000 });
    await expect(canvas.getByRole("textbox", { name: "Recipient" })).toHaveValue(
      "draft@example.test",
    );
  },
} satisfies Story;
export const ResumeAfterDrop = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole(
      "textbox",
      { name: "Workspace name" },
      { timeout: 15000 },
    );
    // Commits made while disconnected replay from the last one received.
    await control(canvasElement, "drop-changes");
    await userEvent.click(canvas.getByRole("button", { name: "Rename elsewhere" }));
    await canvas.findByText("External rename complete");
    await waitFor(() => expect(input).toHaveValue("Changed elsewhere"), { timeout: 10000 });
  },
} satisfies Story;
