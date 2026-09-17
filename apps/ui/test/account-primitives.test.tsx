import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { Button, Popover, RadioCardGroup } from "../src/components/index.ts";
afterEach(cleanup);
// Happy DOM's initial animation name must match the browser for presence cleanup.
const defaults = document.createElement("style");
defaults.textContent = "* { animation-name: none; }";
beforeAll(() => {
  document.head.append(defaults);
});
afterAll(() => defaults.remove());
it("keeps controls interactive without dismissing the popover and restores focus on Escape", async () => {
  const user = userEvent.setup();
  const [open, setOpen] = createSignal(false);
  const [value, setValue] = createSignal("cotton");
  render(() => (
    <div data-surface="inverse">
      <Popover
        open={open()}
        onOpenChange={setOpen}
        label="Account"
        theme="cotton"
        trigger={(props) => <Button {...props}>Profile</Button>}
      >
        <RadioCardGroup
          label="Theme"
          value={value()}
          onChange={setValue}
          options={[
            { value: "cotton", label: "Cotton" },
            { value: "soot", label: "Soot" },
          ]}
        />
        <Button>Settings</Button>
      </Popover>
    </div>
  ));
  const trigger = screen.getByRole("button", { name: "Profile" });
  await user.click(trigger);
  const panel = await screen.findByRole("dialog", { name: "Account" });
  expect(panel.closest("[data-theme]")?.getAttribute("data-theme")).toBe("cotton");
  await user.click(screen.getByRole("radio", { name: "Soot" }));
  expect(value()).toBe("soot");
  expect(open()).toBe(true);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
it("groups radio cards for keyboard navigation and native form submission", async () => {
  const user = userEvent.setup();
  const [value, setValue] = createSignal("a");
  const change = vi.fn((next: string) => setValue(next));
  const { container } = render(() => (
    <form>
      <RadioCardGroup
        label="Choice"
        name="choice"
        value={value()}
        onChange={change}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
          { value: "c", label: "Unavailable", disabled: true },
        ]}
      />
    </form>
  ));
  screen.getByRole("radio", { name: "Alpha" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(value()).toBe("b");
  expect(new FormData(container.querySelector("form")!).get("choice")).toBe("b");
  await user.click(screen.getByRole("radio", { name: "Unavailable" }));
  expect(value()).toBe("b");
});
