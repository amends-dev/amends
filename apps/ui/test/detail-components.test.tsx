import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { Tabs, Disclosure, ChoiceChipGroup, TitleField, Field } from "../src/components/index.ts";
afterEach(cleanup);
it("keeps tab contents mounted and preserves draft input across keyboard panel changes", async () => {
  const [value, setValue] = createSignal("thread");
  render(() => (
    <Tabs
      label="Panels"
      value={value()}
      onChange={setValue}
      items={[
        { value: "thread", label: "thread", content: <textarea aria-label="Draft" /> },
        { value: "detail", label: "detail", content: <p>Objective</p> },
      ]}
    />
  ));
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement;
  await user.type(input, "Keep this message");
  await user.click(screen.getByRole("tab", { name: "thread" }));
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "detail" }).getAttribute("aria-selected")).toBe("true");
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
  expect(input.value).toBe("Keep this message");
});
it("keeps collapsed execution links out of keyboard navigation", async () => {
  const [open, setOpen] = createSignal(false);
  render(() => (
    <Disclosure label="turn 1" expanded={open()} onExpandedChange={setOpen}>
      <a href="#session">Session</a>
    </Disclosure>
  ));
  expect(screen.queryByRole("link")).toBeNull();
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("link"));
});
it("uses single-choice chip semantics and associates title validation", async () => {
  const [value, setValue] = createSignal("ada");
  render(() => (
    <>
      <ChoiceChipGroup
        label="Owner"
        value={value()}
        onChange={setValue}
        options={[
          { value: "ada", label: "Ada" },
          { value: "rae", label: "Rae" },
        ]}
      />
      <Field label="Task title" error="Enter a title">
        <TitleField />
      </Field>
    </>
  ));
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: "Rae" }));
  expect(value()).toBe("rae");
  expect((screen.getByRole("radio", { name: "Ada" }) as HTMLInputElement).checked).toBe(false);
  const input = screen.getByRole("textbox", { name: "Task title" });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
    "Enter a title",
  );
});
