import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Field, type FieldControlProps } from "@amends/ui/compositions/field";
import { Input } from "@amends/ui/primitives/input";

afterEach(cleanup);
it("generates distinct control identities and associates each label and description", () => {
  render(() => (
    <>
      <Field label="First" description="First hint">
        {(control) => <Input {...control} />}
      </Field>
      <Field label="Second" description="Second hint">
        {(control) => <Input {...control} />}
      </Field>
    </>
  ));
  const first = screen.getByRole("textbox", { name: "First" });
  const second = screen.getByRole("textbox", { name: "Second" });
  expect(first.id).not.toBe(second.id);
  expect(first.id).not.toBe("");
  expect(first).toHaveAccessibleDescription("First hint");
  expect(second).toHaveAccessibleDescription("Second hint");
});
it("keeps wrapper attributes separate from the control and forwards wrapper refs/classes/events", () => {
  let wrapper: HTMLDivElement | undefined;
  const clicked = vi.fn();
  render(() => (
    <Field
      id="wrapper"
      controlId="address"
      label="Address"
      class="consumer"
      classList={{ selected: true }}
      data-context="invite"
      onClick={clicked}
      ref={(node) => {
        wrapper = node;
      }}
    >
      {(control) => <Input name="address" {...control} />}
    </Field>
  ));
  const input = screen.getByRole("textbox", { name: "Address" }) as HTMLInputElement;
  expect(input.id).toBe("address");
  expect(wrapper).toBe(input.parentElement);
  expect(wrapper).toHaveAttribute("id", "wrapper");
  expect(wrapper).toHaveAttribute("data-context", "invite");
  expect(wrapper).toHaveClass("consumer", "selected");
  for (const attribute of ["label", "controlid", "description", "error", "required", "disabled"])
    expect(wrapper).not.toHaveAttribute(attribute);
  input.click();
  expect(clicked).toHaveBeenCalledOnce();
});
it("updates state and identity without recreating, blurring, or changing the control value and selection", () => {
  const [error, setError] = createSignal<string>();
  const [description, setDescription] = createSignal<string>("Use your work address.");
  const [id, setId] = createSignal("email");
  const [required, setRequired] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);
  const child = vi.fn((control: FieldControlProps) => (
    <Input value="member@example.com" {...control} />
  ));
  render(() => (
    <Field
      label="Email"
      controlId={id()}
      description={description()}
      error={error()}
      required={required()}
      disabled={disabled()}
    >
      {child}
    </Field>
  ));
  const input = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
  input.focus();
  input.setSelectionRange(1, 4);
  setError("That address is already invited.");
  setRequired(true);
  setId("updated-email");
  expect(child).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "Email" })).toBe(input);
  expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(1);
  expect(input.selectionEnd).toBe(4);
  expect(input).toHaveValue("member@example.com");
  expect(input).toBeRequired();
  expect(input.id).toBe("updated-email");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(
    "Use your work address. Error: That address is already invited.",
  );
  expect(screen.getByText("(required)")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByRole("alert")).toBeNull();
  setError(undefined);
  setDescription("");
  setRequired(false);
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(input).not.toBeRequired();
  expect(screen.queryByText("(required)")).toBeNull();
  setDisabled(true);
  expect(input).toBeDisabled();
  setDisabled(false);
  expect(input).not.toBeDisabled();
  expect(child).toHaveBeenCalledOnce();
});
it("merges and deduplicates external descriptions without losing visible help or errors", () => {
  const [external, setExternal] = createSignal("outside outside email-description");
  render(() => (
    <>
      <p id="outside">External context.</p>
      <Field
        label="Email"
        controlId="email"
        controlDescribedBy={external()}
        description="Help."
        error="Invalid."
      >
        {(control) => <Input {...control} />}
      </Field>
    </>
  ));
  const input = screen.getByRole("textbox");
  expect(input).toHaveAttribute("aria-describedby", "outside email-description email-error");
  expect(input).toHaveAccessibleDescription("External context. Help. Error: Invalid.");
  setExternal("  ");
  expect(input).toHaveAttribute("aria-describedby", "email-description email-error");
});
it("works with a native control without adding a dependency to the Input primitive", () => {
  render(() => (
    <Field label="Notes" required disabled>
      {(control) => <textarea {...control} />}
    </Field>
  ));
  const control = screen.getByRole("textbox", { name: "Notes" });
  expect(control.tagName).toBe("TEXTAREA");
  expect(control).toBeRequired();
  expect(control).toBeDisabled();
});
