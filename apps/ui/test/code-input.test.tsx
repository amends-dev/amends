import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { CodeInput } from "@amends/ui/primitives/code-input";
import { Field } from "@amends/ui/compositions/field";
import preview from "../.storybook/preview.ts";
import meta, { Editing, Forms, Layout } from "../src/primitives/code-input/code-input.stories.tsx";

afterEach(cleanup);
it("exposes one native control with Field associations, native events, and the input ref", () => {
  let ref: HTMLInputElement | undefined;
  const typed = vi.fn();
  const { container } = render(() => (
    <Field label="Verification code" description="Six digits." error="Try again." required>
      {(control) => (
        <CodeInput
          {...control}
          name="code"
          ref={(el) => {
            ref = el;
          }}
          onInput={[typed, "code"]}
        />
      )}
    </Field>
  ));
  const input = screen.getByRole("textbox", { name: "Verification code" });
  expect(container.querySelectorAll("input")).toHaveLength(1);
  expect(ref).toBe(input);
  expect(input).toHaveAccessibleDescription("Six digits. Error: Try again.");
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveAttribute("inputmode", "numeric");
  expect(input).toHaveAttribute("autocomplete", "one-time-code");
  expect(input).toHaveAttribute("maxlength", "6");
  expect(input).toHaveAttribute("pattern", "[0-9]{6}");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toBeRequired();
  fireEvent.input(input, { target: { value: "012345" } });
  expect(typed).toHaveBeenCalledExactlyOnceWith("code", expect.any(Event));
});
it("preserves identity, selection, and focus through presentation changes", () => {
  const [changed, setChanged] = createSignal(false);
  const [value, setValue] = createSignal("012345");
  render(() => (
    <CodeInput
      aria-label="Code"
      value={value()}
      readOnly={changed()}
      aria-invalid={changed()}
      class={changed() ? "updated" : "original"}
      style={{ "max-width": "20rem" }}
    />
  ));
  const input = screen.getByRole("textbox") as HTMLInputElement;
  input.focus();
  input.setSelectionRange(1, 4);
  setChanged(true);
  expect(input).toHaveFocus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
  expect(input).toHaveAttribute("readonly");
  setValue("098765");
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("098765");
});
it("keeps native validity, leading zeros, and reset defaults without synchronizing a second value", () => {
  const { container } = render(() => (
    <form>
      <CodeInput
        aria-label="Code"
        name="code"
        required
        ref={(el) => {
          el.defaultValue = "012345";
        }}
      />
    </form>
  ));
  const input = screen.getByRole("textbox") as HTMLInputElement;
  expect(new FormData(container.querySelector("form")!).get("code")).toBe("012345");
  input.value = "12ab56";
  expect(input.validity.patternMismatch).toBe(true);
  input.value = "123";
  expect(input.checkValidity()).toBe(false);
  container.querySelector("form")!.reset();
  expect(input).toHaveValue("012345");
  expect(input.checkValidity()).toBe(true);
});
it("uses native inherited disabled semantics and keeps read-only values in form data", () => {
  const { container } = render(() => (
    <form>
      <CodeInput name="readonly" aria-label="Read-only" value="012345" readOnly />
      <CodeInput name="disabled" aria-label="Disabled" value="012345" disabled />
      <fieldset disabled>
        <CodeInput name="inherited" aria-label="Inherited" value="012345" />
      </fieldset>
    </form>
  ));
  const data = new FormData(container.querySelector("form")!);
  expect(data.get("readonly")).toBe("012345");
  expect(data.has("disabled")).toBe(false);
  expect(screen.getByRole("textbox", { name: "Inherited" })).toBeDisabled();
});
const stories = definePreview(preview).meta(meta);
it("runs the code editing story", async () => {
  await stories.story(Editing).run();
});
it("runs the code form story", async () => {
  await stories.story(Forms).run();
});
it("runs the container resizing story", async () => {
  await stories.story(Layout).run();
});
