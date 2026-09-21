import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { Composer } from "../src/components/index.ts";

afterEach(cleanup);

it("keeps Enter multiline and sends with Ctrl or Command without sending during composition", async () => {
  const [draft, setDraft] = createSignal("");
  const submit = vi.fn();
  render(() => (
    <Composer
      label="Message Ada"
      value={draft()}
      onChange={setDraft}
      onSubmit={submit}
      description="Starts a new thread."
    />
  ));
  const input = screen.getByRole("textbox", { name: "Message Ada" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "send message" }));
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(submit).not.toHaveBeenCalled();
  await user.type(input, "First line{Enter}Second line");
  expect(draft()).toBe("First line\nSecond line");
  expect(submit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true, isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", metaKey: true, repeat: true });
  expect(submit).not.toHaveBeenCalled();
  await user.keyboard("{Control>}{Enter}{/Control}");
  await user.keyboard("{Meta>}{Enter}{/Meta}");
  expect(submit).toHaveBeenCalledTimes(2);
});

it("retains focus and the draft while pending, connects failure feedback and allows retry", async () => {
  const [draft, setDraft] = createSignal("Start in Q1");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const submit = vi.fn(() => setPending(true));
  render(() => (
    <Composer
      label="Reply"
      value={draft()}
      onChange={setDraft}
      onSubmit={submit}
      description="Continues this thread."
      pending={pending()}
      {...(error() ? { error: error()! } : {})}
    />
  ));
  const input = screen.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement;
  const button = screen.getByRole("button", { name: "send message" });
  const user = userEvent.setup();
  await user.click(input);
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(input.readOnly).toBe(true);
  expect(document.activeElement).toBe(input);
  await user.type(input, "should not change");
  await user.click(button);
  expect(document.activeElement).toBe(button);
  fireEvent.submit(input.form!);
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(input.value).toBe("Start in Q1");
  setPending(false);
  setError("Could not send. Try again.");
  expect(input.readOnly).toBe(false);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const descriptions = input
    .getAttribute("aria-describedby")!
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent);
  expect(descriptions).toContain("Could not send. Try again.");
  expect(descriptions).toContain("Continues this thread.");
  expect(screen.getByRole("alert").textContent).toBe("Could not send. Try again.");
  await user.click(button);
  expect(submit).toHaveBeenCalledTimes(2);
});

it("blocks every submission path for an unavailable conversation", async () => {
  const submit = vi.fn();
  render(() => (
    <Composer
      label="Message Ada"
      value="Keep this"
      onChange={() => {}}
      onSubmit={submit}
      description="Ada was removed."
      disabled
    />
  ));
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "send message" }));
  fireEvent.keyDown(input, { key: "Enter", metaKey: true });
  fireEvent.submit(input.form!);
  expect(input.disabled).toBe(true);
  expect(input.value).toBe("Keep this");
  expect(submit).not.toHaveBeenCalled();
});

it("does not reclaim focus after submission opens another view", async () => {
  let destination!: HTMLButtonElement;
  render(() => (
    <>
      <Composer
        label="Reply"
        value="Ready"
        onChange={() => {}}
        onSubmit={() => destination.focus()}
        description="Continues this thread."
      />
      <button
        ref={(node) => {
          destination = node;
        }}
      >
        Next view
      </button>
    </>
  ));
  await userEvent.click(screen.getByRole("button", { name: "send message" }));
  expect(document.activeElement).toBe(destination);
});
