import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { CommandList, CodeBlock } from "../src/components/index.ts";
afterEach(cleanup);
it("adds and removes ordered commands with the keyboard without submitting the form", async () => {
  const [commands, setCommands] = createSignal(["bun install"]);
  const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
  render(() => (
    <form onSubmit={submit}>
      <CommandList label="Setup" commands={commands()} onChange={setCommands} />
    </form>
  ));
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "  bun run build  {Enter}");
  expect(commands()).toEqual(["bun install", "bun run build"]);
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove command 1: bun install" }));
  expect(commands()).toEqual(["bun run build"]);
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
  expect(screen.getByRole("button", { name: "Remove command 1: bun run build" })).toBeTruthy();
});
it("renders a read-only command list without editing controls", () => {
  render(() => <CommandList label="Setup" commands={["bun install"]} />);
  expect(screen.getByRole("list", { name: "Setup" })).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
it("copies a command and announces success", async () => {
  const user = userEvent.setup();
  render(() => <CodeBlock label="install" text="bun install" copyable />);
  await user.click(screen.getByRole("button", { name: "Copy install" }));
  expect(await navigator.clipboard.readText()).toBe("bun install");
  expect(screen.getByRole("status").textContent).toBe("Copied");
});
