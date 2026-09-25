import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { UnavailableFixture } from "./unavailable.fixture.tsx";

const meta = {
  title: "Features/Workspace unavailable",
  component: UnavailableFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof UnavailableFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Removed = {
  args: { access: "removed" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole(
      "heading",
      { name: "That workspace is closed to you" },
      { timeout: 15000 },
    );
    await canvas.findByText("No longer a member");
    await expect(canvas.getByText(/Your membership of Mercier & Co has ended/)).toBeVisible();
    await expect(canvas.getByText("Rejoining needs a fresh invitation.")).toBeVisible();
  },
} satisfies Story;
export const Invited = {
  args: { access: "invited" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole(
      "heading",
      { name: "You haven’t joined this workspace yet" },
      { timeout: 15000 },
    );
    await expect(canvas.getByText("Invitation waiting")).toBeVisible();
    await expect(canvas.getByText(/You’ve been invited to Mercier & Co/)).toBeVisible();
  },
} satisfies Story;
export const NoAccess = {
  args: { access: "unknown" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("No access", {}, { timeout: 15000 });
    await expect(
      canvas.getByText(
        "This workspace doesn’t exist, or it hasn’t been shared with member@example.test.",
      ),
    ).toBeVisible();
    await expect(canvas.getByText("Ask a member to invite this address.")).toBeVisible();
  },
} satisfies Story;
export const Soot = { args: { access: "removed", theme: "soot" } } satisfies Story;
