import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Select } from "@amends/ui/primitives/select";
import { Field } from "@amends/ui/compositions/field";
afterEach(cleanup);
const options = [
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin", disabled: true },
];
it("associates Field label/help/error with the trigger and forwards button ref/classes", () => {
  let ref: HTMLButtonElement | undefined;
  render(() => (
    <Field label="Role" description="Choose one" error="Required" required>
      {(control) => (
        <Select
          options={options}
          value="member"
          {...control}
          class="consumer"
          classList={{ selected: true }}
          ref={(node) => {
            ref = node;
          }}
        />
      )}
    </Field>
  ));
  const trigger = screen.getByRole("button", { name: "Role Member" });
  expect(ref).toBe(trigger);
  expect(trigger).toHaveTextContent("Member");
  expect(trigger).toHaveClass("consumer", "selected");
  expect(trigger).toHaveAccessibleDescription("Choose one Error: Required");
  expect(trigger).toHaveAttribute("aria-invalid", "true");
  expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
});
it("keeps identity and selected key across controlled updates and refreshed option objects", () => {
  const [value, setValue] = createSignal<string | null>("viewer"),
    [choices, setChoices] = createSignal(options),
    [disabled, setDisabled] = createSignal(false);
  render(() => (
    <Select options={choices()} value={value()} disabled={disabled()} aria-label="Role" />
  ));
  const trigger = screen.getByRole("button");
  trigger.focus();
  setValue("member");
  setChoices(options.map((option) => ({ ...option })));
  expect(trigger).toHaveTextContent("Member");
  expect(trigger).toHaveFocus();
  setDisabled(true);
  expect(trigger).toBeDisabled();
  setDisabled(false);
  setValue(null);
  expect(trigger).toHaveTextContent("Choose an option");
  expect(screen.getByRole("button")).toBe(trigger);
});
it("uses a real form value with validation focus and resets the uncontrolled default", () => {
  const invalid = vi.fn(),
    changed = vi.fn();
  const { container } = render(() => (
    <form>
      <Select
        options={options}
        aria-label="Role"
        name="role"
        required
        defaultValue="viewer"
        onInvalid={invalid}
        onChange={changed}
      />
    </form>
  ));
  const native = container.querySelector("select")!,
    form = container.querySelector("form")!,
    trigger = screen.getByRole("button");
  expect(new FormData(form).get("role")).toBe("viewer");
  fireEvent.change(native, { target: { value: "member" } });
  expect(changed).toHaveBeenLastCalledWith("member");
  expect(trigger).toHaveTextContent("Member");
  form.reset();
  expect(trigger).toHaveTextContent("Viewer");
  expect(new FormData(form).get("role")).toBe("viewer");
  fireEvent.change(native, { target: { value: "" } });
  expect(native.checkValidity()).toBe(false);
  expect(invalid).toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});
it("closes the popup when disabled and restores the trigger when re-enabled", async () => {
  const [disabled, setDisabled] = createSignal(true);
  render(() => <Select options={options} aria-label="Role" disabled={disabled()} />);
  const trigger = screen.getByRole("button");
  expect(trigger).toBeDisabled();
  setDisabled(false);
  await waitFor(() => expect(trigger).not.toBeDisabled());
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  await screen.findByRole("listbox");
  setDisabled(true);
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
});
it("resolves a controlled selection when async choices arrive without replacing the trigger", () => {
  const [choices, setChoices] = createSignal(options.slice(0, 1));
  render(() => <Select aria-label="Role" value="member" options={choices()} />);
  const trigger = screen.getByRole("button");
  expect(trigger).toHaveTextContent("Choose an option");
  setChoices(options);
  expect(trigger).toHaveTextContent("Member");
  expect(screen.getByRole("button")).toBe(trigger);
});
it("rejects duplicate and empty option values before they can alias selections", () => {
  expect(() =>
    render(() => <Select options={[options[0]!, options[0]!]} aria-label="Role" />),
  ).toThrow("non-empty and unique");
  expect(() =>
    render(() => <Select options={[{ value: "", label: "Empty" }]} aria-label="Role" />),
  ).toThrow("non-empty and unique");
});
