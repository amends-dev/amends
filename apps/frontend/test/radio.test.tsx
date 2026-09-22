import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Radio } from "@amends/frontend/primitives/radio";
afterEach(cleanup);

it("renders one native radio and forwards its ref, attributes, classes, and bound events", () => {
  let ref: HTMLInputElement | undefined;
  const changed = vi.fn();
  const { container } = render(() => (
    <Radio
      ref={(input) => {
        ref = input;
      }}
      aria-label="Thirty days"
      aria-describedby="help"
      name="duration"
      value="30"
      required
      class="consumer"
      classList={{ selected: true }}
      onChange={[changed, "duration"]}
    />
  ));
  const radio = screen.getByRole("radio", { name: "Thirty days" }) as HTMLInputElement;
  expect(container.children).toHaveLength(1);
  expect(ref).toBe(radio);
  expect(radio).toHaveAttribute("type", "radio");
  expect(radio).toHaveAttribute("name", "duration");
  expect(radio).toHaveAttribute("value", "30");
  expect(radio).toHaveAttribute("aria-describedby", "help");
  expect(radio).toBeRequired();
  expect(radio).toHaveClass("consumer", "selected");
  radio.click();
  expect(changed).toHaveBeenCalledExactlyOnceWith("duration", expect.any(Event));
  radio.click();
  expect(changed).toHaveBeenCalledOnce();
});
it("updates checked, disabled, and classes without replacing or blurring the radio", () => {
  const [checked, setChecked] = createSignal(false),
    [disabled, setDisabled] = createSignal(false);
  const changed = vi.fn();
  render(() => (
    <Radio
      aria-label="Choice"
      checked={checked()}
      disabled={disabled()}
      class={checked() ? "selected" : "idle"}
      onChange={changed}
    />
  ));
  const radio = screen.getByRole("radio") as HTMLInputElement;
  radio.focus();
  setChecked(true);
  expect(radio).toHaveFocus();
  expect(radio).toBeChecked();
  expect(radio).toHaveClass("selected");
  setDisabled(true);
  radio.click();
  expect(changed).not.toHaveBeenCalled();
  setChecked(false);
  setDisabled(false);
  radio.click();
  expect(changed).toHaveBeenCalledOnce();
  expect(screen.getByRole("radio")).toBe(radio);
});
it("uses native mutual exclusion, form value, and reset defaults", () => {
  const { container } = render(() => (
    <form>
      <Radio
        aria-label="First"
        name="choice"
        value="a"
        ref={(input) => {
          input.defaultChecked = true;
        }}
      />
      <Radio aria-label="Second" name="choice" value="b" />
    </form>
  ));
  const first = screen.getByRole("radio", { name: "First" }),
    second = screen.getByRole("radio", { name: "Second" }) as HTMLInputElement;
  second.click();
  expect(first).not.toBeChecked();
  expect(second).toBeChecked();
  const form = container.querySelector("form")!;
  expect(new FormData(form).getAll("choice")).toEqual(["b"]);
  form.reset();
  expect(first).toBeChecked();
  expect(second).not.toBeChecked();
});
it("retains disabled fieldset semantics", () => {
  render(() => (
    <fieldset disabled>
      <Radio aria-label="Unavailable" />
    </fieldset>
  ));
  expect(screen.getByRole("radio")).toBeDisabled();
});
