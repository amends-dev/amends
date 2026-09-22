import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Checkbox } from "@amends/frontend/primitives/checkbox";
import { Switch } from "@amends/frontend/primitives/switch";
afterEach(cleanup);
for (const [role, Control] of [
  ["checkbox", Checkbox],
  ["switch", Switch],
] as const) {
  it(`${role} forwards native props/ref and bound changes, and keeps checked independent of aria`, () => {
    let ref: HTMLInputElement | undefined;
    const changed = vi.fn();
    const { container } = render(() => (
      <Control
        aria-label="Notifications"
        name="notifications"
        value="yes"
        required
        class="consumer"
        classList={{ selected: true }}
        ref={(node) => {
          ref = node;
        }}
        onChange={[changed, "change"]}
      />
    ));
    const input = screen.getByRole(role) as HTMLInputElement;
    expect(container.children).toHaveLength(1);
    expect(ref).toBe(input);
    expect(input).toHaveClass("consumer", "selected");
    expect(input).toBeRequired();
    input.click();
    expect(input).toBeChecked();
    expect(changed).toHaveBeenCalledExactlyOnceWith("change", expect.any(Event));
    input.click();
    expect(input).not.toBeChecked();
  });
  it(`${role} preserves identity/focus across controlled updates and blocks disabled clicks`, () => {
    const [checked, setChecked] = createSignal(false),
      [disabled, setDisabled] = createSignal(false);
    const changed = vi.fn();
    render(() => (
      <Control
        aria-label="Notifications"
        checked={checked()}
        disabled={disabled()}
        onChange={changed}
      />
    ));
    const input = screen.getByRole(role) as HTMLInputElement;
    input.focus();
    setChecked(true);
    expect(input).toHaveFocus();
    expect(input).toBeChecked();
    setDisabled(true);
    input.click();
    expect(changed).not.toHaveBeenCalled();
    setDisabled(false);
    setChecked(false);
    input.click();
    expect(changed).toHaveBeenCalledOnce();
    expect(screen.getByRole(role)).toBe(input);
  });
  it(`${role} participates in native form submission/reset and required validation`, () => {
    const { container } = render(() => (
      <form>
        <Control
          aria-label="Notifications"
          name="notifications"
          value="yes"
          required
          ref={(input) => {
            input.defaultChecked = true;
          }}
        />
      </form>
    ));
    const input = screen.getByRole(role) as HTMLInputElement,
      form = container.querySelector("form")!;
    expect(new FormData(form).get("notifications")).toBe("yes");
    input.click();
    expect(new FormData(form).has("notifications")).toBe(false);
    expect(input.checkValidity()).toBe(false);
    form.reset();
    expect(input).toBeChecked();
    expect(input.checkValidity()).toBe(true);
  });
  it(`${role} inherits fieldset disabling`, () => {
    render(() => (
      <fieldset disabled>
        <Control aria-label="Unavailable" />
      </fieldset>
    ));
    expect(screen.getByRole(role)).toBeDisabled();
  });
}
it("Checkbox updates the mixed DOM property, preserves ref, and lets native activation clear mixed state", () => {
  const [mixed, setMixed] = createSignal(true);
  let ref: HTMLInputElement | undefined;
  render(() => (
    <Checkbox
      aria-label="Selection"
      indeterminate={mixed()}
      ref={(node) => {
        ref = node;
      }}
    />
  ));
  const input = screen.getByRole("checkbox") as HTMLInputElement;
  expect(input).toBePartiallyChecked();
  expect(ref).toBe(input);
  expect(input).not.toHaveAttribute("indeterminate");
  input.click();
  expect(input).not.toBePartiallyChecked();
  expect(input).toBeChecked();
  setMixed(false);
  setMixed(true);
  expect(input).toBePartiallyChecked();
});
