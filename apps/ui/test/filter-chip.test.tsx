import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { FilterChip, FilterChipGroup } from "../src/components/index.ts";

afterEach(cleanup);

it("toggles independent filters with keyboard and never submits the surrounding form", async () => {
  const [mine, setMine] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
  render(() => (
    <form onSubmit={submit}>
      <FilterChipGroup label="Filter tasks">
        <FilterChip label="mine" selected={mine()} onChange={setMine} />
        <FilterChip label="failed" indicator="danger" selected={failed()} onChange={setFailed} />
      </FilterChipGroup>
    </form>
  ));
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard(" ");
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
  await user.keyboard(" ");
  expect(screen.getByRole("button", { name: "failed", pressed: false })).toBeTruthy();
  expect(mine()).toBe(true);
  expect(submit).not.toHaveBeenCalled();
});

it("prevents changes to a disabled filter", async () => {
  const change = vi.fn();
  render(() => <FilterChip label="mine" selected disabled onChange={change} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "mine", pressed: true }));
  expect(change).not.toHaveBeenCalled();
});
