import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { createSignal } from "solid-js";
import { ChipPicker } from "@amends/ui/compositions/chip-picker";
import preview from "../.storybook/preview.ts";
import meta, {
  InDialog,
  Interaction,
} from "../src/compositions/chip-picker/chip-picker.stories.tsx";
afterEach(cleanup);

const options = [
  { value: "jo", label: "Jo", mark: "j" },
  { value: "ada", label: "Ada", mark: "a", ring: "dashed" as const },
];
it("shows chosen values as named chips and leaves them out of the choices", () => {
  const [value, setValue] = createSignal<ReadonlyArray<string>>(["jo", "ada", "missing"]);
  render(() => (
    <ChipPicker.Root
      options={options}
      value={value()}
      onChange={setValue}
      fixed={{ jo: "you" }}
      chipsLabel="Members"
      input={{ "aria-label": "Add member" }}
      empty="nobody"
      class="consumer"
    />
  ));
  const chips = screen.getByRole("list", { name: "Members" });
  // A value with no option shows nothing.
  expect(
    within(chips)
      .getAllByRole("listitem")
      .map((chip) => chip.textContent),
  ).toEqual(["jJoyou", "aAda✕"]);
  expect(chips.parentElement).toHaveClass("consumer");
  within(chips).getByRole("button", { name: "Remove Ada" }).click();
  expect(value()).toEqual(["jo", "missing"]);
  expect(screen.getByRole("combobox", { name: "Add member" })).toBeInTheDocument();
});
it("adds, removes, and moves focus as the reference picker does", async () => {
  await definePreview(preview).meta(meta).story(Interaction).run();
});
it("works inside a dialog", async () => {
  await definePreview(preview).meta(meta).story(InDialog).run();
});
