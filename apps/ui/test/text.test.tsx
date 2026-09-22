import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Text, type TextElement, type TextTone } from "@amends/ui/primitives/text";
import { typographyStyles } from "@amends/ui/foundations/typography/styles";
import type { TypographyRole } from "@amends/ui/foundations/typography";

afterEach(cleanup);

it("changes semantic tone without replacing text or adding announcements", () => {
  const [tone, setTone] = createSignal<TextTone>("success");
  render(() => (
    <Text tone={tone()} tabIndex={-1}>
      Operation result
    </Text>
  ));
  const text = screen.getByText("Operation result");
  text.focus();
  for (const tone of ["warning", "pending", "danger", "success"] as const) {
    const previous = text.className;
    setTone(tone);
    expect(screen.getByText("Operation result")).toBe(text);
    expect(text).toHaveFocus();
    expect(text.className).not.toBe(previous);
    for (const attribute of ["tone", "role", "aria-live"])
      expect(text).not.toHaveAttribute(attribute);
  }
});

it("renders a body paragraph without an extra wrapper or component attributes", () => {
  const { container } = render(() => <Text>Keep the context close.</Text>);
  const text = screen.getByText("Keep the context close.");
  expect(text.tagName).toBe("P");
  expect(container.children).toHaveLength(1);
  expect(text).toHaveClass(typographyStyles.body);
  for (const prop of ["as", "variant", "tone"]) expect(text).not.toHaveAttribute(prop);
});

it.each<TextElement>(["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "code"])(
  "uses the requested %s element independently of its visual style",
  (element) => {
    render(() => (
      <Text as={element} variant="mono">
        An example
      </Text>
    ));
    const text = screen.getByText("An example");
    expect(text.tagName).toBe(element.toUpperCase());
    expect(text).toHaveClass(typographyStyles.mono);
  },
);

it("forwards native attributes, classes, styles, events, and the actual element ref", () => {
  let element: HTMLParagraphElement | undefined;
  const copied = vi.fn();
  render(() => (
    <Text
      id="message"
      title="Message context"
      lang="en"
      dir="ltr"
      aria-describedby="context"
      data-state="ready"
      class="consumer-class"
      classList={{ selected: true }}
      style={{ "text-align": "center" }}
      onCopy={copied}
      ref={(node) => {
        element = node;
      }}
    >
      Message
    </Text>
  ));
  const text = screen.getByText("Message");
  expect(element).toBe(text);
  expect(text).toHaveAttribute("id", "message");
  expect(text).toHaveAttribute("title", "Message context");
  expect(text).toHaveAttribute("lang", "en");
  expect(text).toHaveAttribute("dir", "ltr");
  expect(text).toHaveAttribute("aria-describedby", "context");
  expect(text).toHaveAttribute("data-state", "ready");
  expect(text).toHaveClass("consumer-class", "selected", typographyStyles.body);
  expect(text.style.textAlign).toBe("center");
  fireEvent.copy(text);
  expect(copied).toHaveBeenCalledOnce();
});

it("updates visual props, content, and native attributes without replacing or blurring the element", () => {
  const [variant, setVariant] = createSignal<TypographyRole | undefined>(undefined);
  const [tone, setTone] = createSignal<TextTone | undefined>(undefined);
  const [changed, setChanged] = createSignal(false);
  const [selected, setSelected] = createSignal(true);
  render(() => (
    <Text
      as="h2"
      variant={variant()}
      tone={tone()}
      tabIndex={-1}
      class={changed() ? "updated" : "original"}
      classList={{ selected: selected() }}
      aria-label={changed() ? "Updated heading" : "Heading"}
    >
      {changed() ? "Updated content" : "Content"}
    </Text>
  ));
  const text = screen.getByRole("heading", { level: 2, name: "Heading" });
  text.focus();
  const originalClass = text.className;
  setVariant("heading");
  expect(text).toHaveClass(typographyStyles.heading);
  expect(text).not.toHaveClass(typographyStyles.body);
  const headingClass = text.className;
  setTone("secondary");
  expect(text.className).not.toBe(headingClass);
  setChanged(true);
  expect(screen.getByRole("heading", { level: 2, name: "Updated heading" })).toBe(text);
  expect(text).toHaveTextContent("Updated content");
  expect(text).toHaveClass("updated");
  expect(text).not.toHaveClass("original");
  expect(text).toHaveClass("selected");
  setSelected(false);
  expect(text).not.toHaveClass("selected");
  expect(document.activeElement).toBe(text);
  setVariant(undefined);
  setTone(undefined);
  setChanged(false);
  setSelected(true);
  expect(text.className).toBe(originalClass);
});

it("replaces the native element and forwards its ref when as changes", () => {
  const [element, setElement] = createSignal<TextElement>("p");
  const refs: HTMLElement[] = [];
  render(() => (
    <Text as={element()} variant="heading" ref={(node) => refs.push(node)}>
      Context
    </Text>
  ));
  const original = screen.getByText("Context");
  setElement("h2");
  const heading = screen.getByRole("heading", { level: 2, name: "Context" });
  expect(heading).not.toBe(original);
  expect(original.isConnected).toBe(false);
  expect(refs).toEqual([original, heading]);
  expect(heading).toHaveClass(typographyStyles.heading);
});

it("keeps inline children inside the paragraph without extra elements", () => {
  render(() => (
    <Text>
      Read{" "}
      <Text as="span" tone="secondary">
        the notes
      </Text>{" "}
      for{" "}
      <Text as="code" variant="mono">
        thread_123
      </Text>
      .
    </Text>
  ));
  const code = screen.getByText("thread_123");
  const paragraph = code.parentElement;
  expect(paragraph?.tagName).toBe("P");
  expect(paragraph?.children).toHaveLength(2);
  expect(paragraph?.children[0]?.tagName).toBe("SPAN");
  expect(code.tagName).toBe("CODE");
  expect(paragraph).toHaveTextContent("Read the notes for thread_123.");
});
