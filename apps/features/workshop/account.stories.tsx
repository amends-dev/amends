import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountFixture } from "./account.fixture.tsx";
const meta = {
  title: "Features/Account",
  component: AccountFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof AccountFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const ChangeName = {
  args: { workspace: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Session validated", {}, { timeout: 15000 });
    // Inside the workspace, the menu names the holder as people there call them.
    await userEvent.click(
      await canvas.findByRole("button", { name: "Your account: Account Holder" }),
    );
    const panel = await page.findByRole("dialog", { name: "Account Holder" });
    await expect(panel).toHaveTextContent("account@example.com");
    await userEvent.click(within(panel).getByRole("button", { name: "Change your name" }));
    const dialog = await page.findByRole("dialog", { name: "Your name" });
    const field = within(dialog).getByRole("textbox", { name: "Name" });
    await expect(field).toHaveValue("Account Holder");
    const save = within(dialog).getByRole("button", { name: "Save name" });
    await expect(save).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "Ada Lovelace{Enter}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Your name" })).toBeNull());
    // Focus returns to the account menu, which now names the holder anew.
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Your account: Ada Lovelace" })).toHaveFocus(),
    );
  },
} satisfies Story;
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
