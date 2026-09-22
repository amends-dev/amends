import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Input, type InputType } from "@amends/frontend/primitives/input";

afterEach(cleanup);
it("renders one native text input with forwarded associations, events, styles, and ref", () => {
  let ref: HTMLInputElement | undefined;
  const typed = vi.fn();
  const { container } = render(() => (
    <Input
      id="title"
      aria-label="Title"
      aria-describedby="help"
      name="title"
      autocomplete="off"
      placeholder="Enter title"
      required
      maxLength={80}
      class="consumer"
      classList={{ selected: true }}
      style={{ "text-align": "right" }}
      onInput={[typed, "title"]}
      ref={(element) => {
        ref = element;
      }}
    />
  ));
  const input = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
  expect(container.children).toHaveLength(1);
  expect(ref).toBe(input);
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveAttribute("aria-describedby", "help");
  expect(input).toHaveAttribute("name", "title");
  expect(input).toHaveAttribute("autocomplete", "off");
  expect(input).toHaveAttribute("placeholder", "Enter title");
  expect(input).toHaveAttribute("maxlength", "80");
  expect(input).toBeRequired();
  expect(input).toHaveClass("consumer", "selected");
  expect(input.style.textAlign).toBe("right");
  fireEvent.input(input, { target: { value: "Proposal" } });
  expect(typed).toHaveBeenCalledExactlyOnceWith("title", expect.any(Event));
});
it.each<InputType>(["text", "email", "password", "search", "tel", "url"])(
  "forwards native %s type",
  (type) => {
    const { container } = render(() => <Input type={type} aria-label="Value" />);
    expect(container.querySelector("input")).toHaveAttribute("type", type);
  },
);
it("updates value, type, handlers, and native props on the same focused input", () => {
  const [value, setValue] = createSignal("Initial");
  const [changed, setChanged] = createSignal(false);
  const [type, setType] = createSignal<InputType | undefined>();
  const first = vi.fn(),
    second = vi.fn();
  render(() => (
    <Input
      aria-label="Value"
      value={value()}
      type={type()}
      readOnly={changed()}
      aria-invalid={changed() || undefined}
      class={changed() ? "updated" : "original"}
      classList={{ selected: changed() }}
      onInput={changed() ? second : first}
    />
  ));
  const input = screen.getByRole("textbox") as HTMLInputElement;
  input.focus();
  input.setSelectionRange(1, 3);
  const originalClass = input.className;
  setChanged(true);
  expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(1);
  expect(input.selectionEnd).toBe(3);
  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveClass("updated", "selected");
  setValue("Updated value");
  setType("search");
  expect(screen.getByRole("searchbox")).toBe(input);
  expect(input).toHaveValue("Updated value");
  expect(input).toHaveFocus();
  fireEvent.input(input);
  expect(second).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
  setChanged(false);
  setType(undefined);
  expect(input.className).toBe(originalClass);
  expect(input).toHaveAttribute("type", "text");
});
it("supports uncontrolled entry and native reset defaults without internal state", () => {
  const { container } = render(() => (
    <form>
      <Input
        aria-label="Title"
        name="title"
        ref={(input) => {
          input.defaultValue = "Original";
        }}
      />
    </form>
  ));
  const input = screen.getByRole("textbox") as HTMLInputElement;
  expect(input.value).toBe("Original");
  fireEvent.input(input, { target: { value: "Edited" } });
  expect(input.value).toBe("Edited");
  container.querySelector("form")!.reset();
  expect(input.value).toBe("Original");
});
it("retains native validity and invalid events without deciding when to show an error", () => {
  const invalid = vi.fn();
  render(() => <Input aria-label="Email" type="email" required onInvalid={invalid} />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  expect(input.checkValidity()).toBe(false);
  expect(invalid).toHaveBeenCalledOnce();
  expect(input).not.toHaveAttribute("aria-invalid");
  input.value = "incomplete";
  expect(input.validity.typeMismatch).toBe(true);
  input.value = "member@example.com";
  expect(input.checkValidity()).toBe(true);
});
it("includes read-only values and omits disabled controls from native form data", () => {
  const { container } = render(() => (
    <form>
      <Input aria-label="Reference" name="reference" value="kept" readOnly />
      <Input aria-label="Disabled" name="disabled" value="omitted" disabled />
      <fieldset disabled>
        <Input aria-label="Inherited" name="inherited" value="omitted" />
      </fieldset>
    </form>
  ));
  const data = new FormData(container.querySelector("form")!);
  expect(data.get("reference")).toBe("kept");
  expect(data.has("disabled")).toBe(false);
  // Happy DOM includes inherited-disabled values in FormData; the browser story checks omission.
  expect(screen.getByRole("textbox", { name: "Inherited" })).toBeDisabled();
});
