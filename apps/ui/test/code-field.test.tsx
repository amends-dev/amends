import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { CodeField } from "../src/components/index.ts";
import { createSignal } from "solid-js";

afterEach(cleanup);

describe("code field", () => {
  it("keeps digits only, fills the boxes, and associates the error with the input", async () => {
    const user = userEvent.setup();
    const [value, setValue] = createSignal("");
    const [error, setError] = createSignal<string>();
    render(() => (
      <CodeField label="Six-digit code" value={value()} onInput={setValue} error={error()} />
    ));
    const input = screen.getByLabelText("Six-digit code") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    await user.type(input, "4a1b9");
    expect(value()).toBe("419");
    const boxes = document.querySelectorAll('[data-filled="true"]');
    expect(boxes).toHaveLength(3);
    expect(document.querySelector('[data-caret="true"]')?.textContent).toBe("");
    await user.type(input, "2705");
    expect(value()).toBe("419270");
    setError("That code did not match.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("That code did not match.").id).toBe(
      input.getAttribute("aria-describedby"),
    );
  });
});
