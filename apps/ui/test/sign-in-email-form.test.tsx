import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { SignInEmailForm } from "@amends/ui/features/sign-in";
import preview from "../.storybook/preview.ts";
import meta, {
  Validation,
  RequestRecovery,
  Layout,
} from "../src/features/sign-in/sign-in-email-form.stories.tsx";

afterEach(cleanup);
it("composes a named native form, unique field associations, and caller-owned input", () => {
  const changed = vi.fn();
  let form: HTMLFormElement | undefined;
  render(() => (
    <SignInEmailForm
      email="jo@mercier.co"
      onEmailChange={changed}
      onSubmit={() => {}}
      ref={(el) => {
        form = el;
      }}
      class="consumer"
      headingAs="h2"
    />
  ));
  const input = screen.getByRole("textbox", { name: "Email" });
  expect(form).toBe(screen.getByRole("form", { name: "Sign in to amends" }));
  expect(form).toHaveClass("consumer");
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Sign in to amends");
  expect(input).toHaveAttribute("type", "email");
  expect(input).toHaveAttribute("autocomplete", "email");
  expect(input).toBeRequired();
  expect(new FormData(form).get("email")).toBe("jo@mercier.co");
  fireEvent.input(input, { target: { value: "other@example.com" } });
  expect(changed).toHaveBeenCalledExactlyOnceWith("other@example.com");
});
it("validates direct submit events, focuses invalid entry, and hands a valid address to the caller", () => {
  const submitted = vi.fn();
  render(() => <SignInEmailForm email="" onEmailChange={() => {}} onSubmit={submitted} />);
  const input = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
  const form = screen.getByRole("form");
  fireEvent.submit(form);
  expect(submitted).not.toHaveBeenCalled();
  expect(input).toHaveFocus();
  expect(input).toHaveAccessibleDescription("Error: Enter your email address.");
  input.value = "broken";
  fireEvent.submit(form);
  expect(submitted).not.toHaveBeenCalled();
  expect(input).toHaveAccessibleDescription("Error: Enter a valid email address.");
  fireEvent.input(input, { target: { value: "Jo@mercier.co" } });
  fireEvent.submit(form);
  expect(submitted).toHaveBeenCalledExactlyOnceWith("Jo@mercier.co");
});
it("guards repeated submissions while pending and retains the field and button for recovery", () => {
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const submitted = vi.fn(() => setPending(true));
  render(() => (
    <SignInEmailForm
      email="jo@mercier.co"
      onEmailChange={() => {}}
      onSubmit={submitted}
      pending={pending()}
      requestError={error()}
    />
  ));
  const form = screen.getByRole("form");
  const input = screen.getByRole("textbox");
  const button = screen.getByRole("button", { name: "Continue" });
  button.focus();
  fireEvent.submit(form);
  fireEvent.submit(form);
  fireEvent.click(button);
  expect(submitted).toHaveBeenCalledOnce();
  expect(button).toHaveFocus();
  expect(input).toHaveAttribute("readonly");
  setPending(false);
  setError("Unable to connect.");
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to connect.");
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).toHaveValue("jo@mercier.co");
  expect(screen.getByRole("textbox")).toBe(input);
  expect(button).toHaveFocus();
});
it("keeps caller field errors distinct from request errors and clears native errors on replacement", () => {
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal<string>();
  const submitted = vi.fn();
  render(() => (
    <SignInEmailForm
      email={email()}
      onEmailChange={setEmail}
      onSubmit={submitted}
      emailError={error()}
    />
  ));
  const input = screen.getByRole("textbox");
  const form = screen.getByRole("form");
  fireEvent.submit(form);
  setEmail("jo@mercier.co");
  expect(input).not.toHaveAttribute("aria-invalid");
  setError("Use a different email address.");
  fireEvent.submit(form);
  expect(submitted).not.toHaveBeenCalled();
  expect(input).toHaveFocus();
  expect(input).toHaveAccessibleDescription("Error: Use a different email address.");
  expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  setError(undefined);
  fireEvent.submit(form);
  expect(submitted).toHaveBeenCalledExactlyOnceWith("jo@mercier.co");
});
it("leaves controlled reset to the caller and respects an inherited disabled fieldset", () => {
  const [email, setEmail] = createSignal("jo@mercier.co");
  const [disabled, setDisabled] = createSignal(false);
  const submitted = vi.fn();
  render(() => (
    <fieldset disabled={disabled()}>
      <SignInEmailForm
        email={email()}
        onEmailChange={setEmail}
        onSubmit={submitted}
        onReset={() => setEmail("")}
      />
    </fieldset>
  ));
  const form = screen.getByRole("form") as HTMLFormElement;
  setDisabled(true);
  // Happy DOM's :disabled selector omits fieldset inheritance. Browser review
  // exercises the direct-submit guard against the native selector too.
  expect(screen.getByRole("textbox")).toBeDisabled();
  setDisabled(false);
  form.reset();
  expect(email()).toBe("");
  expect(screen.getByRole("textbox")).toHaveValue("");
});
const stories = definePreview(preview).meta(meta);
it("isolates field identities and validation between independently mounted forms", () => {
  render(() => (
    <>
      <SignInEmailForm email="" onEmailChange={() => {}} onSubmit={() => {}} />
      <SignInEmailForm email="jo@mercier.co" onEmailChange={() => {}} onSubmit={() => {}} />
    </>
  ));
  const inputs = screen.getAllByRole("textbox");
  expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
  fireEvent.submit(screen.getAllByRole("form")[0]!);
  expect(inputs[0]).toHaveAttribute("aria-invalid", "true");
  expect(inputs[1]).not.toHaveAttribute("aria-invalid");
  expect(inputs[1]).toHaveValue("jo@mercier.co");
});
it("runs inline validation", async () => {
  await stories.story(Validation).run();
});
it("runs pending, failure, and retry", async () => {
  await stories.story(RequestRecovery).run();
});
it("runs responsive composition", async () => {
  await stories.story(Layout).run();
});
