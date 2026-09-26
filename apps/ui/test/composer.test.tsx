import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { Composer } from "@amends/ui/compositions/composer";
import preview from "../.storybook/preview.ts";
import meta, { Default, Mentions } from "../src/compositions/composer/composer.stories.tsx";
afterEach(cleanup);

it("sends on Enter and the send button, but not while an input method composes", () => {
  const send = vi.fn();
  const [draft, setDraft] = createSignal("Hello");
  render(() => (
    <Composer.Root onSend={send} aria-label="Reply form">
      <Composer.Frame>
        <Composer.Input aria-label="Reply" value={draft()} onInput={setDraft} />
        <Composer.Actions>
          <button type="submit">Reply</button>
        </Composer.Actions>
      </Composer.Frame>
      <Composer.Error id="reply-error">Couldn’t send.</Composer.Error>
    </Composer.Root>
  ));
  const input = screen.getByRole("textbox", { name: "Reply" });
  expect(input).toHaveAttribute("rows", "2");
  expect(input.closest("form")).toHaveAttribute("data-density", "comfortable");
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(send).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  expect(send).toHaveBeenCalledTimes(2);
  fireEvent.input(input, { target: { value: "Changed" } });
  expect(draft()).toBe("Changed");
  expect(screen.getByText("Couldn’t send.").closest("[id]")).toHaveAttribute("id", "reply-error");
});

it("types, sends, and clears through the story's composer", async () => {
  await definePreview(preview).meta(meta).story(Default).run();
});

it("suggests people after @ and inserts the chosen one", async () => {
  await definePreview(preview).meta(meta).story(Mentions).run();
});
