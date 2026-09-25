import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, {
  Interaction,
} from "../src/compositions/segmented-control/segmented-control.stories.tsx";
import { SegmentedControl } from "../src/compositions/segmented-control/index.ts";
afterEach(cleanup);
it("selects exactly one segment", async () => {
  await definePreview(preview).meta(meta).story(Interaction).run();
});
it("preserves native form submission, disabled fieldsets, and controlled reset", async () => {
  const [value, setValue] = createSignal("all");
  const change = vi.fn(setValue);
  const { container } = render(() => (
    <form onReset={() => setValue("all")}>
      <SegmentedControl.Root aria-label="View" name="view" value={value()} onValueChange={change}>
        <SegmentedControl.Item value="all">All</SegmentedControl.Item>
        <SegmentedControl.Item value="mine">Mine</SegmentedControl.Item>
        <SegmentedControl.Item value="closed" disabled>
          Closed
        </SegmentedControl.Item>
      </SegmentedControl.Root>
      <fieldset disabled>
        <SegmentedControl.Root aria-label="Disabled" value="one" onValueChange={change}>
          <SegmentedControl.Item value="one">One</SegmentedControl.Item>
        </SegmentedControl.Root>
      </fieldset>
    </form>
  ));
  (screen.getByRole("radio", { name: "Mine" }) as HTMLInputElement).click();
  expect(new FormData(container.querySelector("form")!).get("view")).toBe("mine");
  (screen.getByRole("radio", { name: "Closed" }) as HTMLInputElement).click();
  expect(change).toHaveBeenCalledOnce();
  expect(screen.getByRole("radio", { name: "One" })).toBeDisabled();
  container.querySelector("form")!.reset();
  await Promise.resolve();
  expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
});
