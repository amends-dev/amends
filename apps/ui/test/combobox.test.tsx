import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { userEvent } from "storybook/test";
import { createSignal } from "solid-js";
import { people } from "../src/primitives/combobox/combobox.stories-support.tsx";
import { Combobox } from "../src/primitives/combobox/index.ts";
afterEach(cleanup);
it("submits the selected key after filtering, and resets without a hidden required text field", async () => {
  const { container } = render(() => (
    <form>
      <Combobox.Root options={people} name="person" defaultValue="ada" required clearOnSelect>
        <Combobox.Control>
          <Combobox.Input aria-label="Person" />
        </Combobox.Control>
        <Combobox.Content>
          <Combobox.Listbox />
          <Combobox.Empty>No matches</Combobox.Empty>
        </Combobox.Content>
      </Combobox.Root>
    </form>
  ));
  const form = container.querySelector("form")!;
  const input = screen.getByRole("combobox", { name: "Person" });
  expect(new FormData(form).get("person")).toBe("ada");
  expect(form.checkValidity()).toBe(true);
  await userEvent.click(input);
  await userEvent.type(input, "kit");
  expect(new FormData(form).get("person")).toBe("ada");
  await userEvent.click(screen.getByRole("option", { name: "Kit Nakano" }));
  expect(new FormData(form).get("person")).toBe("kit");
  form.reset();
  await waitFor(() => expect(new FormData(form).get("person")).toBe("ada"));
  expect(form.checkValidity()).toBe(true);
});
it("retains input identity across options updates, skips disabled options, and clears a normal selection", async () => {
  const [options, setOptions] = createSignal([
    ...people,
    { value: "disabled", label: "Disabled", kind: "user", disabled: true },
  ]);
  const changed = vi.fn();
  render(() => (
    <Combobox.Root options={options()} defaultValue="ada" onChange={changed}>
      <Combobox.Control>
        <Combobox.Input aria-label="Person" />
      </Combobox.Control>
      <Combobox.Content>
        <Combobox.Listbox />
      </Combobox.Content>
    </Combobox.Root>
  ));
  const input = screen.getByRole("combobox", { name: "Person" });
  await userEvent.click(input);
  setOptions(options().map((option) => ({ ...option })));
  expect(screen.getByRole("combobox", { name: "Person" })).toBe(input);
  expect(input).toHaveFocus();
  await userEvent.clear(input);
  expect(changed).toHaveBeenLastCalledWith(null);
  changed.mockClear();
  await userEvent.click(screen.getByRole("option", { name: "Disabled" }));
  expect(changed).not.toHaveBeenCalled();
});
it("disables the entire widget and closes an open popup when disabled changes", async () => {
  const [disabled, setDisabled] = createSignal(false);
  render(() => (
    <fieldset disabled={disabled()}>
      <Combobox.Root options={people} disabled={disabled()}>
        <Combobox.Control>
          <Combobox.Input aria-label="Person" />
        </Combobox.Control>
        <Combobox.Content>
          <Combobox.Listbox />
        </Combobox.Content>
      </Combobox.Root>
    </fieldset>
  ));
  await userEvent.click(screen.getByRole("combobox", { name: "Person" }));
  await screen.findByRole("listbox");
  setDisabled(true);
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(screen.getByRole("combobox", { name: "Person" })).toBeDisabled();
  setDisabled(false);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Person" })).not.toBeDisabled());
});

it("associates an external form with its input and selected key, including reset", async () => {
  const { container } = render(() => (
    <>
      <form id="external" />
      <Combobox.Root options={people} name="person" form="external" defaultValue="ada">
        <Combobox.Control>
          <Combobox.Input aria-label="Person" />
        </Combobox.Control>
        <Combobox.Content>
          <Combobox.Listbox />
        </Combobox.Content>
      </Combobox.Root>
    </>
  ));
  const input = screen.getByRole("combobox", { name: "Person" });
  await userEvent.clear(input);
  await userEvent.type(input, "kit");
  await userEvent.click(screen.getByRole("option", { name: "Kit Nakano" }));
  const form = container.querySelector("form")!;
  expect(new FormData(form).get("person")).toBe("kit");
  form.reset();
  await waitFor(() => expect(new FormData(form).get("person")).toBe("ada"));
});

it("rejects free text in a required field and reports invalid selection on the visible input", async () => {
  const invalid = vi.fn();
  const { container } = render(() => (
    <form>
      <Combobox.Root options={people} required name="person" onInvalid={invalid}>
        <Combobox.Control>
          <Combobox.Input aria-label="Person" />
        </Combobox.Control>
        <Combobox.Content>
          <Combobox.Listbox />
          <Combobox.Empty>No matches</Combobox.Empty>
        </Combobox.Content>
      </Combobox.Root>
    </form>
  ));
  const input = screen.getByRole("combobox", { name: "Person" });
  await userEvent.type(input, "unknown");
  expect(container.querySelector("form")!.reportValidity()).toBe(false);
  expect(invalid).toHaveBeenCalledOnce();
  expect(input).toHaveFocus();
  expect(new FormData(container.querySelector("form")!).get("person")).toBe("");
});
