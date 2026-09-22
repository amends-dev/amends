import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { RadioGroup, type RadioOption } from "@amends/ui/compositions/radio-group";

const choices: readonly RadioOption[] = [
  { value: "7", label: "7 days", description: "Short invitation." },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days", disabled: true },
];
afterEach(cleanup);
it("associates the group and individual options without putting descriptions into option names", () => {
  render(() => (
    <>
      <p id="external">Workspace context.</p>
      <RadioGroup
        id="duration"
        label="Expires"
        description="Choose a duration."
        error="Choose an available option."
        aria-describedby="external external"
        required
        value={undefined}
        onValueChange={() => {}}
        options={choices}
      />
    </>
  ));
  const group = screen.getByRole("group", { name: "Expires" });
  expect(group).toHaveAccessibleDescription(
    "Workspace context. Choose a duration. Error: Choose an available option.",
  );
  const radio = screen.getByRole("radio", { name: "7 days" });
  expect(radio).toHaveAccessibleDescription(
    "Workspace context. Choose a duration. Error: Choose an available option. Short invitation.",
  );
  expect(radio).toBeRequired();
  expect(radio).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("(required)")).toHaveAttribute("aria-hidden", "true");
});
it("reports native changes once and uses caller-controlled selection in form data", () => {
  const [value, setValue] = createSignal<string>();
  const changed = vi.fn((next: string) => setValue(next));
  const { container } = render(() => (
    <form>
      <RadioGroup
        label="Expires"
        name="duration"
        value={value()}
        onValueChange={changed}
        options={choices}
      />
    </form>
  ));
  const selected = screen.getByRole("radio", { name: "30 days" }) as HTMLInputElement;
  selected.click();
  selected.click();
  expect(changed).toHaveBeenCalledExactlyOnceWith("30");
  expect(selected).toBeChecked();
  (screen.getByRole("radio", { name: "90 days" }) as HTMLInputElement).click();
  expect(changed).toHaveBeenCalledOnce();
  expect(new FormData(container.querySelector("form")!).getAll("duration")).toEqual(["30"]);
  setValue("7");
  expect(screen.getByRole("radio", { name: "7 days" })).toBeChecked();
  expect(selected).not.toBeChecked();
});
it("isolates unnamed groups with generated native names", () => {
  render(() => (
    <>
      <RadioGroup label="First" value="7" onValueChange={() => {}} options={choices} />
      <RadioGroup label="Second" value="7" onValueChange={() => {}} options={choices} />
    </>
  ));
  const first = screen.getAllByRole("radio", { name: "7 days" }) as HTMLInputElement[];
  expect(first[0]!.name).not.toBe(first[1]!.name);
  expect(first[0]).toBeChecked();
  expect(first[1]).toBeChecked();
  expect(new Set(screen.getAllByRole("radio").map((radio) => radio.id)).size).toBe(6);
});
it("preserves controls, IDs, focus, and selection when option objects refresh or presentation changes", () => {
  const [options, setOptions] = createSignal(choices);
  const [variant, setVariant] = createSignal<"plain" | "card">("plain");
  render(() => (
    <RadioGroup
      label="Expires"
      value="7"
      onValueChange={() => {}}
      options={options()}
      variant={variant()}
    />
  ));
  const first = screen.getByRole("radio", { name: "7 days" }) as HTMLInputElement;
  const id = first.id;
  first.focus();
  setOptions(
    choices.map((option) => ({
      ...option,
      label: `Updated ${option.label}`,
      description: "Refreshed.",
    })),
  );
  setVariant("card");
  expect(screen.getByRole("radio", { name: "Updated 7 days" })).toBe(first);
  expect(first.id).toBe(id);
  expect(first).toHaveFocus();
  expect(first).toBeChecked();
  expect(first).toHaveAccessibleDescription("Refreshed.");
});
it("keeps a disabled selection and does not silently select another option when it is removed", () => {
  const [options, setOptions] = createSignal(choices);
  const changed = vi.fn();
  render(() => (
    <RadioGroup label="Expires" value="7" onValueChange={changed} options={options()} />
  ));
  const selected = screen.getByRole("radio", { name: "7 days" });
  setOptions(choices.map((option) => ({ ...option, disabled: true })));
  expect(selected).toBeChecked();
  expect(selected).toBeDisabled();
  setOptions(choices.slice(1));
  expect(screen.queryByRole("radio", { checked: true })).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});
it("updates required, disabled, and error associations through the fieldset", () => {
  const [error, setError] = createSignal<string | undefined>("Try again.");
  const [disabled, setDisabled] = createSignal(false),
    [required, setRequired] = createSignal(true);
  render(() => (
    <RadioGroup
      label="Expires"
      description="Help."
      error={error()}
      disabled={disabled()}
      required={required()}
      value="7"
      onValueChange={() => {}}
      options={choices}
    />
  ));
  const radio = screen.getByRole("radio", { name: "7 days" });
  setError(undefined);
  setRequired(false);
  setDisabled(true);
  expect(radio).not.toHaveAttribute("aria-invalid");
  expect(radio).not.toBeRequired();
  expect(radio).toBeDisabled();
  expect(radio).toHaveAccessibleDescription("Help. Short invitation.");
  setDisabled(false);
  expect(radio).not.toBeDisabled();
});
it("forwards native fieldset attributes/ref/events and an external form association to every radio", () => {
  let ref: HTMLFieldSetElement | undefined;
  const change = vi.fn();
  render(() => (
    <>
      <form id="owner" />
      <RadioGroup
        label="Expires"
        form="owner"
        name="duration"
        value={undefined}
        onValueChange={() => {}}
        options={choices}
        class="consumer"
        classList={{ selected: true }}
        onChange={change}
        ref={(node) => {
          ref = node;
        }}
      />
    </>
  ));
  const group = screen.getByRole("group");
  expect(ref).toBe(group);
  expect(group).toHaveClass("consumer", "selected");
  for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveAttribute("form", "owner");
  (screen.getByRole("radio", { name: "7 days" }) as HTMLInputElement).click();
  expect(change).toHaveBeenCalledOnce();
});
it("rejects duplicate option values", () => {
  expect(() =>
    render(() => (
      <RadioGroup
        label="Duplicate"
        value={undefined}
        onValueChange={() => {}}
        options={[choices[0]!, choices[0]!]}
      />
    )),
  ).toThrow("option values must be unique");
});
