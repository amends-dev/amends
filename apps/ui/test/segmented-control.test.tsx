import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { SegmentedControl } from "../src/components/index.ts";

afterEach(cleanup);
const options = [
  { value: "bucket", label: "by bucket", compactLabel: "bucket" },
  { value: "owner", label: "by owner", disabled: true },
  { value: "channel", label: "by channel" },
];
it("moves one selection with arrow keys, skips disabled choices, and submits the selected value", async () => {
  const [value, setValue] = createSignal("bucket");
  const { container } = render(() => (
    <form>
      <SegmentedControl
        label="Group tasks"
        name="group"
        value={value()}
        onChange={setValue}
        options={options}
      />
    </form>
  ));
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "by bucket" }));
  await user.keyboard("{ArrowRight}");
  expect(value()).toBe("channel");
  expect(new FormData(container.querySelector("form")!).get("group")).toBe("channel");
  await user.keyboard("{ArrowRight}");
  expect(value()).toBe("bucket");
  expect(screen.getByRole("group", { name: "Group tasks" })).toBeTruthy();
});
it("keeps instances independent and respects a disabled group", async () => {
  const changed = vi.fn();
  render(() => (
    <>
      <SegmentedControl label="First" value="bucket" onChange={changed} options={options} />
      <SegmentedControl
        label="Second"
        value="channel"
        onChange={changed}
        options={options}
        disabled
      />
    </>
  ));
  const radios = screen.getAllByRole("radio") as HTMLInputElement[];
  expect(radios[0]!.name).not.toBe(radios[3]!.name);
  await userEvent.setup().click(radios[5]!);
  expect(changed).not.toHaveBeenCalled();
});
