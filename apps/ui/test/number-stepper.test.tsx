import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { CapacityIndicator, NumberStepper } from "../src/components/index.ts";
afterEach(cleanup);
it("bounds increments and restores invalid text without submitting", async () => {
  const [value, setValue] = createSignal(1);
  const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
  render(() => (
    <form onSubmit={submit}>
      <NumberStepper label="Concurrency" min={1} max={4} value={value()} onChange={setValue} />
    </form>
  ));
  const user = userEvent.setup();
  expect(
    screen.getByRole("button", { name: "Decrease Concurrency" }).hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Increase Concurrency" }));
  expect(value()).toBe(2);
  await user.clear(screen.getByRole("spinbutton"));
  await user.tab();
  expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("2");
  await user.clear(screen.getByRole("spinbutton"));
  await user.type(screen.getByRole("spinbutton"), "9{Enter}");
  expect(value()).toBe(4);
  expect(submit).not.toHaveBeenCalled();
});
it("announces actual occupancy when the limit is reduced", () => {
  render(() => <CapacityIndicator used={3} capacity={1} />);
  expect(screen.getByRole("img", { name: "3 of 1 slots in use, over capacity" })).toBeTruthy();
});
