import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { Avatar } from "@amends/frontend/primitives/avatar";
import { Status } from "@amends/frontend/primitives/status";
import { Button } from "@amends/frontend/primitives/button";
import preview from "../.storybook/preview.ts";
import avatarMeta, {
  ReactiveProps as AvatarReactive,
  InButton,
} from "../src/primitives/avatar/avatar.stories.tsx";
import statusMeta, {
  ReactiveProps as StatusReactive,
} from "../src/primitives/status/status.stories.tsx";

afterEach(cleanup);
it("names standalone avatars and keeps decorative initials out of a button's accessible name", () => {
  let ref: HTMLSpanElement | undefined;
  render(() => (
    <>
      <Avatar.Root
        kind="human"
        aria-label="Jo Mercer, human"
        ref={(node) => {
          ref = node;
        }}
        class="custom"
        classList={{ selected: true }}
      >
        <Avatar.Fallback>JM</Avatar.Fallback>
      </Avatar.Root>
      <span id="external-name">Ravi Kaur, contact</span>
      <Avatar.Root kind="contact" aria-labelledby="external-name">
        <Avatar.Fallback>RK</Avatar.Fallback>
      </Avatar.Root>
      <Button>
        <Avatar.Root kind="agent" decorative>
          <Avatar.Fallback>a</Avatar.Fallback>
        </Avatar.Root>
        View Ada
      </Button>
    </>
  ));
  const named = screen.getByRole("img", { name: "Jo Mercer, human" });
  expect(named).toBe(ref);
  expect(named).toHaveClass("custom", "selected");
  expect(named).not.toHaveAttribute("tabindex");
  expect(screen.getByRole("img", { name: "Ravi Kaur, contact" })).toBeVisible();
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByRole("button")).toHaveAccessibleName("View Ada");
});
it("uses a stable unknown fallback and preserves caller-supplied case and Unicode", () => {
  const [value, setValue] = createSignal<string | undefined>();
  render(() => (
    <Avatar.Root kind="agent" aria-label="Selected agent">
      <Avatar.Fallback>{value()}</Avatar.Fallback>
    </Avatar.Root>
  ));
  const avatar = screen.getByRole("img");
  expect(avatar).toHaveTextContent("?");
  setValue("  ");
  expect(avatar).toHaveTextContent("?");
  setValue("a");
  expect(avatar).toHaveTextContent("a");
  setValue("李");
  expect(avatar).toHaveTextContent("李");
  expect(screen.getByRole("img")).toBe(avatar);
});
it("keeps changing status text visible without introducing an unsolicited live region", () => {
  const [failed, setFailed] = createSignal(false);
  let ref: HTMLSpanElement | undefined;
  render(() => (
    <Status.Root
      tone={failed() ? "danger" : "running"}
      ref={(node) => {
        ref = node;
      }}
    >
      <Status.Indicator />
      <Status.Label>{failed() ? "Failed to save" : "Saving"}</Status.Label>
    </Status.Root>
  ));
  const root = ref!,
    indicator = root.querySelector("[data-status-indicator]");
  expect(root).not.toHaveAttribute("role");
  expect(root).not.toHaveAttribute("aria-live");
  expect(indicator).toHaveAttribute("aria-hidden", "true");
  setFailed(true);
  expect(root).toHaveAttribute("data-status-tone", "danger");
  expect(screen.getByText("Failed to save")).toBeVisible();
  expect(root.querySelector("[data-status-indicator]")).toBe(indicator);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("forwards explicit announcement semantics when the caller requests them", () => {
  render(() => (
    <Status.Root tone="success" role="status" aria-live="polite" aria-atomic="true">
      <Status.Indicator />
      <Status.Label>Saved</Status.Label>
    </Status.Root>
  ));
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
});
it("runs Avatar reactive-prop verification", async () => {
  await definePreview(preview).meta(avatarMeta).story(AvatarReactive).run();
});
it("runs Avatar keyboard button composition", async () => {
  await definePreview(preview).meta(avatarMeta).story(InButton).run();
});
it("runs Status reactive-prop verification", async () => {
  await definePreview(preview).meta(statusMeta).story(StatusReactive).run();
});
