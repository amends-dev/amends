import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { Divider } from "@amends/frontend/primitives/divider";
import { Button } from "@amends/frontend/primitives/button";
import { Navigation } from "@amends/frontend/compositions/navigation";
import preview from "../.storybook/preview.ts";
import dividerMeta, { Interaction } from "../src/primitives/divider/divider.stories.tsx";

afterEach(cleanup);

it("keeps headings and actions accessible while only the line is decorative", () => {
  const clicked = vi.fn();
  let heading: HTMLHeadingElement | undefined, line: HTMLSpanElement | undefined;
  const { container } = render(() => (
    <Divider.Root class="consumer" classList={{ active: true }}>
      <Divider.Label
        as="h2"
        id="channels"
        ref={(node) => {
          heading = node;
        }}
      >
        Channels
      </Divider.Label>
      <Divider.Line
        ref={(node) => {
          line = node;
        }}
      />
      <Button onClick={clicked}>Create channel</Button>
    </Divider.Root>
  ));
  expect(screen.getByRole("heading", { name: "Channels", level: 2 })).toBe(heading);
  expect(heading).toHaveAttribute("id", "channels");
  expect(container.firstElementChild).toHaveClass("consumer", "active");
  expect(container.firstElementChild).not.toHaveAttribute("aria-hidden");
  expect(line).toHaveAttribute("aria-hidden", "true");
  expect(line).not.toHaveAttribute("tabindex");
  expect(screen.queryByRole("separator")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
  expect(clicked).toHaveBeenCalledOnce();
});

it("keeps action identity and focus while divider content changes", () => {
  const [label, setLabel] = createSignal("Today"),
    [centered, setCentered] = createSignal(false);
  render(() => (
    <Divider.Root>
      {centered() && <Divider.Line />}
      <Divider.Label>{label()}</Divider.Label>
      <Divider.Line />
      <Button>More activity</Button>
    </Divider.Root>
  ));
  const button = screen.getByRole("button");
  button.focus();
  setLabel("Yesterday");
  setCentered(true);
  expect(screen.getByText("Yesterday")).toBeVisible();
  expect(screen.getByRole("button")).toBe(button);
  expect(button).toHaveFocus();
});

it("keeps section names and mounted actions when collapsing, and recovers focus from a hidden action", () => {
  const [compact, setCompact] = createSignal(false),
    [name, setName] = createSignal("Workspace");
  const [hidden, setHidden] = createSignal(false),
    clicked = vi.fn();
  render(() => (
    <Navigation.Root compact={compact()} aria-label="Main">
      <Navigation.Section>
        <Navigation.SectionHeader>
          <Navigation.SectionLabel>{name()}</Navigation.SectionLabel>
          <Divider.Line />
          <Navigation.SectionActions hidden={hidden()}>
            <Button onClick={clicked}>Create group</Button>
          </Navigation.SectionActions>
        </Navigation.SectionHeader>
        <Navigation.Link href="#groups">
          <Navigation.Icon>g</Navigation.Icon>
          <Navigation.Label>Groups</Navigation.Label>
        </Navigation.Link>
      </Navigation.Section>
    </Navigation.Root>
  ));
  const action = screen.getByRole("button", { name: "Create group" }),
    link = screen.getByRole("link");
  action.focus();
  setCompact(true);
  expect(screen.queryByRole("button", { name: "Create group" })).toBeNull();
  expect(action).toBeInTheDocument();
  expect(link).toHaveFocus();
  setName("Organization");
  expect(screen.getByRole("group", { name: "Organization" })).toContainElement(link);
  setCompact(false);
  expect(screen.getByRole("button", { name: "Create group" })).toBe(action);
  expect(link).toHaveFocus();
  fireEvent.click(action);
  expect(clicked).toHaveBeenCalledOnce();
  setHidden(true);
  setCompact(true);
  setCompact(false);
  expect(screen.queryByRole("button", { name: "Create group" })).toBeNull();
});

it("runs the divider action story", async () => {
  await definePreview(preview).meta(dividerMeta).story(Interaction).run();
});
