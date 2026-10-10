import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { IconCheck, IconSearch, type IconSize, type IconWeight } from "@amends-dev/icons";
import { IconX } from "@amends-dev/icons/x";

afterEach(cleanup);

it("renders decorative inline SVG with inherited color and no focus stop", () => {
  const { container } = render(() => <IconX />);
  const svg = container.firstElementChild!;
  expect(svg.tagName.toLowerCase()).toBe("svg");
  expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  expect(svg).toHaveAttribute("width", "1.25rem");
  expect(svg).toHaveAttribute("height", "1.25rem");
  expect(svg).toHaveAttribute("stroke", "currentColor");
  expect(svg).toHaveAttribute("fill", "none");
  expect(svg).toHaveAttribute("stroke-width", "2");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).not.toHaveAttribute("tabindex");
  expect(svg).not.toHaveAttribute("role");
  expect(svg.querySelector("title")).toBeNull();
  expect(svg.children).toHaveLength(1);
});

it("updates size, weight, accessible name, classes, and styles on the same SVG", () => {
  const [size, setSize] = createSignal<IconSize>("sm");
  const [weight, setWeight] = createSignal<IconWeight>(2);
  const [label, setLabel] = createSignal<string | undefined>("Completed");
  const [active, setActive] = createSignal(false);
  let ref: SVGSVGElement | undefined;
  const { container } = render(() => (
    <IconCheck
      size={size()}
      weight={weight()}
      label={label()}
      ref={(node) => {
        ref = node;
      }}
      class="icon"
      classList={{ active: active() }}
      style={{ color: active() ? "red" : "blue" }}
      data-active={active()}
      aria-describedby="details"
    />
  ));
  const svg = screen.getByRole("img", { name: "Completed" });
  expect(ref).toBe(svg);
  const titleId = svg.getAttribute("aria-labelledby");
  expect(svg.querySelector("title")?.id).toBe(titleId);
  expect(svg).not.toHaveAttribute("aria-hidden");
  setSize("lg");
  setWeight(1.5);
  setLabel("Saved");
  setActive(true);
  expect(screen.getByRole("img", { name: "Saved" })).toBe(svg);
  expect(svg).toHaveAttribute("aria-labelledby", titleId);
  expect(svg).toHaveAttribute("width", "1.5rem");
  expect(svg).toHaveAttribute("stroke-width", "1.5");
  expect(svg).toHaveClass("icon", "active");
  expect(svg).toHaveStyle({ color: "red" });
  expect(svg).toHaveAttribute("data-active", "true");
  expect(svg).toHaveAttribute("aria-describedby", "details");
  setSize(32);
  setLabel("  ");
  expect(container.firstElementChild).toBe(svg);
  expect(svg).toHaveAttribute("width", "32");
  expect(svg).toHaveAttribute("height", "32");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).not.toHaveAttribute("role");
  expect(svg).not.toHaveAttribute("aria-labelledby");
  expect(svg.querySelector("title")).toBeNull();
  setLabel("Restored");
  expect(screen.getByRole("img", { name: "Restored" })).toBe(svg);
});

it("gives repeated labelled icons unique title references and leaves button naming to the button", () => {
  render(() => (
    <>
      <IconCheck label="First result" />
      <IconCheck label="Second result" />
      <button aria-label="Search workspace">
        <IconSearch />
      </button>
    </>
  ));
  const first = screen.getByRole("img", { name: "First result" });
  const second = screen.getByRole("img", { name: "Second result" });
  expect(first.getAttribute("aria-labelledby")).not.toBe(second.getAttribute("aria-labelledby"));
  const button = screen.getByRole("button", { name: "Search workspace" });
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(button.querySelector("title")).toBeNull();
});
