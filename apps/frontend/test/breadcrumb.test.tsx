import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { Breadcrumb } from "@amends/frontend/compositions/breadcrumb";
import preview from "../.storybook/preview.ts";
import breadcrumbMeta, { Interaction } from "../src/compositions/breadcrumb/breadcrumb.stories.tsx";

afterEach(cleanup);

it("keeps ancestors navigable and identifies one non-link current page", () => {
  const activated = vi.fn();
  const [current, setCurrent] = createSignal("this task");
  const { container } = render(() => (
    <Breadcrumb.Root class="consumer" aria-label="Page location">
      <Breadcrumb.Link
        href="/tasks"
        onClick={(event) => {
          event.preventDefault();
          activated();
        }}
      >
        Tasks
      </Breadcrumb.Link>
      <Breadcrumb.Link href="/tasks/september-close">September close</Breadcrumb.Link>
      <Breadcrumb.Current>{current()}</Breadcrumb.Current>
    </Breadcrumb.Root>
  ));
  const nav = screen.getByRole("navigation", { name: "Page location" });
  expect(nav).toHaveClass("consumer");
  expect(within(nav).getByRole("list")).toBeInTheDocument();
  expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
  expect(within(nav).getAllByRole("link")).toHaveLength(2);
  expect(within(nav).getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/tasks");
  const currentNode = within(nav).getByText("this task");
  expect(currentNode).toHaveAttribute("aria-current", "page");
  expect(currentNode.tagName).toBe("SPAN");
  expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  fireEvent.click(within(nav).getByRole("link", { name: "Tasks" }));
  expect(activated).toHaveBeenCalledOnce();
  setCurrent("renamed task");
  expect(within(nav).getByText("renamed task")).toBe(currentNode);
  expect(currentNode).toHaveAttribute("aria-current", "page");
});

it("runs the Breadcrumb interaction story", async () => {
  await definePreview(preview).meta(breadcrumbMeta).story(Interaction).run();
});
