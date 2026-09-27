import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Composer } from "../src/components/composer/index.ts";
import { Theme } from "../src/foundations/theme/index.ts";

afterEach(cleanup);

function mount(initial: string) {
  const [value, setValue] = createSignal(initial);
  const send = vi.fn<(value: string) => void>();
  const mention = vi.fn();
  render(() => (
    <Theme mode="light">
      <Composer.Root
        value={value()}
        onValueChange={setValue}
        onSend={send}
        mentionCandidates={[{ id: "ada", name: "Ada" }]}
        onMention={mention}
      >
        <Composer.Input placeholder="Message #general" />
        <Composer.Toolbar>
          <Composer.Send />
        </Composer.Toolbar>
      </Composer.Root>
    </Theme>
  ));
  const input = screen.getByRole("combobox", { name: "Message #general" }) as HTMLTextAreaElement;
  // Place the caret at the end, where the text is being written.
  input.setSelectionRange(initial.length, initial.length);
  fireEvent.select(input);
  return { input, value, send, mention };
}

it("leaves the Enter that confirms an input method's text to it, suggestions open or not", () => {
  const { input, value, send, mention } = mount("hello @a");
  expect(screen.getByRole("option", { name: /Ada/ })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  // Safari reports the confirming Enter with keyCode 229 instead.
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(mention).not.toHaveBeenCalled();
  expect(value()).toBe("hello @a");
  expect(send).not.toHaveBeenCalled();
  // Once composition ends, Enter chooses the suggestion.
  fireEvent.keyDown(input, { key: "Enter" });
  expect(mention).toHaveBeenCalledWith({ id: "ada", name: "Ada" });
});

it("sends with Enter only when no input method is composing", () => {
  const { input, send } = mount("hello");
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(send).toHaveBeenCalledWith("hello");
});
