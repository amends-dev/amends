import { afterEach, expect, it, vi } from "@effect/vitest";
import { userEvent } from "storybook/test";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Interaction } from "../src/primitives/filter-chip/filter-chip.stories.tsx";
import { FilterChip } from "../src/primitives/filter-chip/index.ts";
afterEach(cleanup);
it("toggles filters independently and supports keyboard activation", async () => {
  await definePreview(preview).meta(meta).story(Interaction).run();
});
it("respects disabled fieldsets and cancelled activation without submitting a form", async () => {
  const changed = vi.fn(),
    submit = vi.fn();
  render(() => (
    <form onSubmit={submit}>
      <fieldset disabled>
        <FilterChip pressed onPressedChange={changed}>
          Unavailable
        </FilterChip>
      </fieldset>
      <FilterChip
        pressed={false}
        onPressedChange={changed}
        onClick={(event) => event.preventDefault()}
      >
        Cancelled
      </FilterChip>
    </form>
  ));
  await userEvent.click(screen.getByRole("button", { name: "Unavailable" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancelled" }));
  expect(changed).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});
