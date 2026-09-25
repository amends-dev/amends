import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SignInFixture } from "./sign-in.fixture.tsx";
import type { Command, Snapshot } from "./scenario.ts";

const meta = {
  title: "Features/Sign in",
  component: SignInFixture,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta<typeof SignInFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const setup = async (element: HTMLElement) => {
  const canvas = within(element);
  await canvas.findByRole("textbox", { name: "Email" }, { timeout: 10000 });
  const url = element.querySelector<HTMLElement>("[data-scenario-url]")?.dataset.scenarioUrl;
  if (!url) throw new Error("Scenario did not start.");
  const snapshot = async (): Promise<Snapshot> => (await fetch(url)).json();
  const command = async (value: Command) => {
    const response = await fetch(`${url}/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error("Control failed.");
  };
  const start = async () => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "jo@mercier.co");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    return canvas.findByRole("textbox", { name: "Six-digit code" });
  };
  const latest = async () => {
    const code = (await snapshot()).delivered.at(-1)?.code;
    if (!code) throw new Error("No code delivered.");
    return code;
  };
  const verify = async (code: string) => {
    const input = canvas.getByRole("textbox", { name: "Six-digit code" });
    await userEvent.clear(input);
    await userEvent.type(input, code);
    await userEvent.click(canvas.getByRole("button", { name: "Verify code" }));
  };
  const accepted = () =>
    canvas.findByText("Credential accepted by the directory.", {}, { timeout: 10000 });
  return { canvas, url, snapshot, command, start, latest, verify, accepted };
};

export const Playground = {} satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const Success = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    const input = await s.start();
    await expect(input).toHaveFocus();
    await userEvent.type(input, await s.latest());
    await expect(s.canvas.getByRole("textbox", { name: "Six-digit code" })).toBe(input);
    await expect((await s.snapshot()).requests).toBe(1);
    await userEvent.keyboard("{Enter}");
    await s.accepted();
    await expect(s.canvas.queryByRole("form")).not.toBeInTheDocument();
  },
} satisfies Story;
export const WrongCode = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.start();
    const code = await s.latest();
    await s.verify(code === "000000" ? "000001" : "000000");
    await s.canvas.findByText("That code doesn't match. Check it and try again.");
    await s.verify(code);
    await s.accepted();
  },
} satisfies Story;
export const ExpiredCode = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.start();
    await s.command("expire");
    await s.verify(await s.latest());
    await s.canvas.findByText("This code has expired. Request a new one.");
    await userEvent.click(s.canvas.getByRole("button", { name: "Send again" }));
    await s.canvas.findByText("A new code is available. Use the latest code.");
    await s.verify(await s.latest());
    await s.accepted();
  },
} satisfies Story;
export const UsedCode = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.start();
    const code = await s.latest();
    // Consume through the real endpoint in another client, leaving this UI signed out.
    const response = await fetch(`${s.url}/api/session/code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "jo@mercier.co", code }),
    });
    await expect(response.status).toBe(200);
    await s.verify(code);
    await s.canvas.findByText("This code is no longer available. Request a new one.");
  },
} satisfies Story;
export const Resend = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    const input = await s.start();
    const old = await s.latest();
    await userEvent.type(input, old);
    await userEvent.click(s.canvas.getByRole("button", { name: "Send again" }));
    await s.canvas.findByText("A new code is available. Use the latest code.");
    await expect(input).toHaveValue("");
    const latest = await s.latest();
    // Random issuance can repeat the same six digits; only assert invalidation when different.
    if (latest !== old) {
      await s.verify(old);
      await s.canvas.findByText("That code doesn't match. Check it and try again.");
    }
    await s.verify(latest);
    await s.accepted();
  },
} satisfies Story;
export const FailureRecovery = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.command("fail");
    const email = s.canvas.getByRole("textbox", { name: "Email" });
    await userEvent.type(email, "jo@mercier.co");
    await userEvent.click(s.canvas.getByRole("button", { name: "Continue" }));
    await s.canvas.findByText("We couldn't request a code. Try again.");
    await expect(email).toHaveValue("jo@mercier.co");
    await userEvent.click(s.canvas.getByRole("button", { name: "Continue" }));
    const input = await s.canvas.findByRole("textbox", { name: "Six-digit code" });
    const code = await s.latest();
    await s.command("fail");
    await s.verify(code);
    await s.canvas.findByText("We couldn't verify your code. Try again.");
    await expect(input).not.toHaveAttribute("aria-invalid");
    await s.command("fail");
    await userEvent.click(s.canvas.getByRole("button", { name: "Send again" }));
    await s.canvas.findByText("We couldn't request a new code. Try again.");
    await expect(input).toHaveValue(code);
    await s.verify(code);
    await s.accepted();
  },
} satisfies Story;
export const PendingAndChangeEmail = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.command("hold");
    const email = s.canvas.getByRole("textbox", { name: "Email" });
    await userEvent.type(email, "jo@mercier.co");
    await userEvent.click(s.canvas.getByRole("button", { name: "Continue" }));
    await waitFor(async () => expect((await s.snapshot()).held).toBe(true));
    await expect(email).toHaveAttribute("readonly");
    await userEvent.click(s.canvas.getByRole("button", { name: "Continue" }));
    await expect((await s.snapshot()).requests).toBe(1);
    await s.command("release");
    await s.canvas.findByRole("textbox", { name: "Six-digit code" });
    await s.command("hold");
    await s.verify(await s.latest());
    await waitFor(async () => expect((await s.snapshot()).held).toBe(true));
    await userEvent.click(s.canvas.getByRole("button", { name: "Verify code" }));
    await expect((await s.snapshot()).requests).toBe(2);
    await userEvent.click(s.canvas.getByRole("button", { name: "Change email" }));
    await s.command("release");
    await waitFor(async () => {
      const snapshot = await s.snapshot();
      await expect(snapshot.completed + snapshot.cancelled).toBe(2);
    });
    await expect(s.canvas.getByRole("textbox", { name: "Email" })).toHaveValue("jo@mercier.co");
    await expect(s.canvas.getByRole("textbox", { name: "Email" })).toHaveFocus();
    await expect(s.canvas.queryByText("Session established")).not.toBeInTheDocument();
  },
} satisfies Story;
export const UnmountPending = {
  play: async ({ canvasElement }) => {
    const s = await setup(canvasElement);
    await s.start();
    await s.command("hold");
    await s.verify(await s.latest());
    await waitFor(async () => expect((await s.snapshot()).held).toBe(true));
    await userEvent.click(s.canvas.getByRole("button", { name: "Unmount feature" }));
    await s.command("release");
    await waitFor(async () => {
      const snapshot = await s.snapshot();
      await expect(snapshot.completed + snapshot.cancelled).toBe(2);
    });
    await userEvent.click(s.canvas.getByRole("button", { name: "Mount feature" }));
    await expect(s.canvas.getByRole("textbox", { name: "Email" })).toHaveValue("");
    await expect(s.canvas.queryByText("Session established")).not.toBeInTheDocument();
  },
} satisfies Story;
