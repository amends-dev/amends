import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Drawing } from "@amends/ui/primitives/drawing";
import preview from "../.storybook/preview.ts";
import meta, { ReactiveRecovery } from "../src/compositions/empty-state/empty-state.stories.tsx";
afterEach(cleanup);
it("composes a decorative drawing, a heading at the caller's level, and actions", () => {
  const { container } = render(() => (
    <EmptyState.Root class="consumer">
      <Drawing.Bare />
      <EmptyState.Text>
        <EmptyState.Title as="h1">Nothing at this address</EmptyState.Title>
        <EmptyState.Description>This page doesn’t exist.</EmptyState.Description>
      </EmptyState.Text>
      <EmptyState.Actions>
        <button>Your workspaces</button>
      </EmptyState.Actions>
    </EmptyState.Root>
  ));
  expect(container.firstElementChild).toHaveClass("consumer");
  expect(container.firstElementChild).toHaveAttribute("data-size", "region");
  expect(container.firstElementChild).not.toHaveAttribute("role");
  expect(screen.getByRole("heading", { level: 1, name: "Nothing at this address" })).toBeVisible();
  const drawing = container.querySelector("svg");
  expect(drawing).toHaveAttribute("aria-hidden", "true");
  expect(drawing).not.toHaveAttribute("role");
  expect(screen.queryByRole("img")).toBeNull();
});
it("defaults titles to h2 and names a drawing only when it carries meaning", () => {
  render(() => (
    <>
      <EmptyState.Title>The run failed</EmptyState.Title>
      <Drawing.Snapped label="A thread snapped in two" />
      <Drawing.Disconnected label="A thread trailing off" />
    </>
  ));
  expect(screen.getByRole("heading", { level: 2, name: "The run failed" })).toBeVisible();
  expect(screen.getAllByRole("img").map((image) => image.getAttribute("aria-label"))).toEqual([
    "A thread snapped in two",
    "A thread trailing off",
  ]);
});
it("keeps its announced description and focused action through updates", async () => {
  await definePreview(preview).meta(meta).story(ReactiveRecovery).run();
});
it("marks a page-sized state for the heading scale", () => {
  const { container } = render(() => (
    <EmptyState.Root size="page">
      <EmptyState.Text>
        <EmptyState.Title as="h1">Checking your session</EmptyState.Title>
      </EmptyState.Text>
    </EmptyState.Root>
  ));
  expect(container.firstElementChild).toHaveAttribute("data-size", "page");
});
