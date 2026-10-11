import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Entry, workshopCode } from "./entry.fixture.tsx";

const meta = {
  title: "Screens/Sign in",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The Lunacy "Sign in / Email" frame. */
export const Email = { render: () => <Entry /> } satisfies Story;

/** Too many codes were asked for: the email stays, and the host says to wait. */
export const EmailLimited = {
  render: () => <Entry email="alex@mercier.example" emailError="rate-limited" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Too many codes were requested lately. Try again later."),
    ).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Email" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
} satisfies Story;

/** The Lunacy "Sign in / Verification code" frame. */
export const Code = {
  render: () => <Entry step="code" email="alex@mercier.example" code="042816" />,
} satisfies Story;

/** The Lunacy "Sign in / Code error" frame: the code stays for editing. */
export const CodeError = {
  render: () => <Entry step="code" email="alex@mercier.example" code="042816" error="mismatch" />,
} satisfies Story;

/** The Lunacy "Future provider layout" frame. */
export const WithProviders = { render: () => <Entry providers /> } satisfies Story;

/** Email, a wrong code, the right code (314159 in the workshop), and the workspace picker. */
export const SignInFlow = {
  render: () => <Entry />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByRole("textbox", { name: "Email" });
    await userEvent.type(email, "alex{Enter}");
    await expect(canvas.getByText("Enter a valid email address.")).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(email, "@mercier.example{Enter}");
    const code = await canvas.findByRole("textbox", { name: "Verification code" });
    await expect(code).toHaveFocus();
    await expect(canvas.getByText("alex@mercier.example")).toBeVisible();
    await userEvent.type(code, "04a2816");
    await expect(code).toHaveValue("042816");
    await expect(
      await canvas.findByText("That code doesn’t match. Check it and try again."),
    ).toBeVisible();
    await userEvent.clear(code);
    await userEvent.type(code, workshopCode);
    await waitFor(() =>
      expect(canvas.getByRole("heading", { name: "Choose a workspace" })).toBeVisible(),
    );
  },
} satisfies Story;

/** Send again: the new code is announced and the field clears. */
export const Resend = {
  render: () => <Entry step="code" email="alex@mercier.example" code="0428" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Send again" }));
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(
        "We sent a new code. Use the latest one.",
      ),
    );
    const code = canvas.getByRole("textbox", { name: "Verification code" });
    await expect(code).toHaveValue("");
    await expect(code).toHaveFocus();
  },
} satisfies Story;
