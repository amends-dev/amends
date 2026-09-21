import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { RadioList } from "../src/components/index.ts";
afterEach(cleanup);
it("selects exactly one enabled option using the keyboard", async () => {
  const [value, setValue] = createSignal("one");
  render(() => (
    <RadioList
      label="Providers"
      value={value()}
      onChange={setValue}
      options={[
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
        { value: "three", label: "Unavailable", disabled: true },
      ]}
    />
  ));
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{ArrowRight}");
  expect(value()).toBe("two");
  expect((screen.getByRole("radio", { name: "Two" }) as HTMLInputElement).checked).toBe(true);
  await user.keyboard("{ArrowRight}");
  expect(value()).toBe("one");
});
