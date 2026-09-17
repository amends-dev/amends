import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Text } from "../src/components/index.ts";

afterEach(cleanup);

it("keeps heading semantics and focus when its visual role and content change", () => {
  const [compact, setCompact] = createSignal(false);
  let heading: HTMLHeadingElement | undefined;
  render(() => (
    <Text
      as="h2"
      variant={compact() ? "titleSmall" : "heading"}
      tone={compact() ? "muted" : "primary"}
      class="section-heading"
      ref={(node) => {
        heading = node;
      }}
      tabIndex={-1}
      aria-describedby="summary"
    >
      {compact() ? "Task details" : "Details"}
    </Text>
  ));
  const element = screen.getByRole("heading", { level: 2, name: "Details" });
  expect(heading).toBe(element);
  element.focus();
  const originalClass = element.className;
  setCompact(true);
  expect(screen.getByRole("heading", { level: 2, name: "Task details" })).toBe(element);
  expect(document.activeElement).toBe(element);
  expect(element.className).not.toBe(originalClass);
  expect(element.classList.contains("section-heading")).toBe(true);
  expect(element.getAttribute("aria-describedby")).toBe("summary");
  for (const prop of ["as", "variant", "tone"]) expect(element.hasAttribute(prop)).toBe(false);
});

it("forwards element-specific label and timestamp attributes", () => {
  render(() => (
    <>
      <Text as="label" variant="titleSmall" for="task-name">
        Task name
      </Text>
      <input id="task-name" />
      <Text as="time" variant="caption" dateTime="2026-09-13">
        13 Sep
      </Text>
    </>
  ));
  const control = screen.getByLabelText("Task name");
  expect(control.id).toBe("task-name");
  expect(screen.getByText("13 Sep").getAttribute("datetime")).toBe("2026-09-13");
});

it("supports live paragraphs with semantic inline emphasis and no extra wrapper", () => {
  const [status, setStatus] = createSignal("Saving");
  render(() => (
    <Text role="status" aria-live="polite">
      <Text as="strong" variant="inherit">
        {status()}
      </Text>{" "}
      <Text as="em" variant="inherit">
        your draft
      </Text>
    </Text>
  ));
  const paragraph = screen.getByRole("status");
  expect(paragraph.tagName).toBe("P");
  expect(paragraph.children.length).toBe(2);
  expect(paragraph.children[0]?.tagName).toBe("STRONG");
  expect(paragraph.children[1]?.tagName).toBe("EM");
  setStatus("Saved");
  expect(paragraph.textContent).toBe("Saved your draft");
  expect(paragraph.getAttribute("aria-live")).toBe("polite");
});
