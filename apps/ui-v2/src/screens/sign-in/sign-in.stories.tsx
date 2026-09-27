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

/** The Lunacy "Sign in / Verification code" frame. */
export const Code = {
  render: () => <Entry step="code" email="alex@mercier.example" code="042816" />,
} satisfies Story;

/** The Lunacy "Sign in / Code error" frame: the code stays for editing. */
export const CodeError = {
  render: () => (
    <Entry
      step="code"
      email="alex@mercier.example"
      code="042816"
      error="That code doesn’t match. Check it and try again."
    />
  ),
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
    await expect(canvas.getByText("Enter an email address like you@example.com.")).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(email, "@mercier.example{Enter}");
    const code = await canvas.findByRole("textbox", { name: "Verification code" });
    await expect(canvas.getByText("alex@mercier.example")).toBeVisible();
    await userEvent.type(code, "04a2816");
    await expect(code).toHaveValue("042816");
    await expect(
      canvas.getByText("That code doesn’t match. Check it and try again."),
    ).toBeVisible();
    await userEvent.clear(code);
    await userEvent.type(code, workshopCode);
    await waitFor(() =>
      expect(canvas.getByRole("heading", { name: "Choose a workspace" })).toBeVisible(),
    );
  },
} satisfies Story;
