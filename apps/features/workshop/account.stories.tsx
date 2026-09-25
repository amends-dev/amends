import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { AccountFixture } from "./account.fixture.tsx";
const meta = {
  title: "Features/Account",
  component: AccountFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof AccountFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const AppearanceAndSignOut = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Session validated", {}, { timeout: 15000 });
    await userEvent.click(
      canvas.getByRole("button", { name: "Your account: account@example.com" }),
    );
    const panel = await page.findByRole("dialog", { name: "account@example.com" });
    await userEvent.click(within(panel).getByText("Soot"));
    await expect(canvas.getByLabelText("Appearance")).toHaveTextContent("dark");
    await expect(panel).toBeVisible();
    await userEvent.click(within(panel).getByRole("button", { name: "Sign out" }));
    await canvas.findByText("Signed out");
    await expect(page.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Appearance")).toHaveTextContent("dark");
  },
} satisfies Story;
