import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { CodeField, EntryShell } from "../src/components/index.ts";
import { createSignal } from "solid-js";

afterEach(cleanup);

describe("entry shell", () => {
  it("frames a screen with the mark, title, and identity note before sign-in", () => {
    render(() => (
      <EntryShell home={{ href: "/" }} title="Sign in to amends" blurb="One address, one identity.">
        <p>form</p>
      </EntryShell>
    ));
    expect(screen.getByRole("link", { name: "amends" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to amends" })).toBeTruthy();
    expect(screen.getByText("One address, one identity.")).toBeTruthy();
    expect(screen.getByText("amends keeps one identity per address")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "sign out" })).toBeNull();
  });

  it("shows the signed-in address with sign-out and forwards the home link to the router", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    render(() => (
      <EntryShell
        home={{
          href: "/?choose",
          renderLink: (link) => <a {...link} data-router="yes" />,
        }}
        account={{ name: "jo@mercier.co", onSignOut: signOut }}
        title="Where are you working?"
        width="wide"
        align="start"
      >
        <p>picker</p>
      </EntryShell>
    ));
    const home = screen.getByRole("link", { name: "amends" });
    expect(home.getAttribute("href")).toBe("/?choose");
    expect(home.getAttribute("data-router")).toBe("yes");
    expect(screen.getByText("signed in as jo@mercier.co")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});

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
