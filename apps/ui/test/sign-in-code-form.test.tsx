import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { definePreview } from "storybook-solidjs-vite/next";
import { SignInCodeForm, type SignInCodeFormProps } from "@amends/ui/features/sign-in";
import preview from "../.storybook/preview.ts";
import meta, {
  Validation,
  VerifyRecovery,
  ResendRecovery,
  ChangeEmail,
  Layout,
} from "../src/features/sign-in/sign-in-code-form.stories.tsx";

afterEach(cleanup);
const defaults = {
  email: "jo@mercier.co",
  code: "001234",
  onCodeChange: () => {},
  onSubmit: () => {},
  onResend: () => {},
  onChangeEmail: () => {},
};
it("composes a named native form with delivery guidance and a single code field", () => {
  const changed = vi.fn();
  let form: HTMLFormElement | undefined;
  render(() => (
    <SignInCodeForm
      {...defaults}
      onCodeChange={changed}
      headingAs="h2"
      class="consumer"
      deliveryHint="Find the code in the host's terminal."
      ref={(el) => {
        form = el;
      }}
    />
  ));
  const input = screen.getByRole("textbox", { name: "Six-digit code" });
  expect(form).toBe(screen.getByRole("form", { name: "Enter your code" }));
  expect(form).toHaveClass("consumer");
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Enter your code");
  expect(input).toHaveAccessibleDescription("Find the code in the host's terminal.");
  expect(input).toBeRequired();
  expect(new FormData(form).get("code")).toBe("001234");
  fireEvent.input(input, { target: { value: "005678" } });
  expect(changed).toHaveBeenCalledExactlyOnceWith("005678");
});
it.each(["", "123", "12ab56", "1234567"])(
  "rejects invalid code %s on direct submission",
  (code) => {
    const submitted = vi.fn();
    render(() => <SignInCodeForm {...defaults} code={code} onSubmit={submitted} />);
    fireEvent.submit(screen.getByRole("form"));
    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  },
);
it("submits leading zeros unchanged only after explicit submission", () => {
  const submitted = vi.fn();
  render(() => <SignInCodeForm {...defaults} onSubmit={submitted} />);
  expect(submitted).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole("form"));
  expect(submitted).toHaveBeenCalledExactlyOnceWith("001234");
});
it.each(["verifying", "resending"] as const)(
  "guards conflicting actions during %s while allowing an email change",
  (action) => {
    const [pending, setPending] = createSignal<SignInCodeFormProps["pending"]>();
    const submit = vi.fn(() => setPending("verifying")),
      resend = vi.fn(() => setPending("resending")),
      change = vi.fn();
    render(() => (
      <SignInCodeForm
        {...defaults}
        pending={pending()}
        onSubmit={submit}
        onResend={resend}
        onChangeEmail={change}
      />
    ));
    const verifyButton = screen.getByRole("button", { name: "Verify code" }),
      resendButton = screen.getByRole("button", { name: "Send again" });
    const active = action === "verifying" ? verifyButton : resendButton;
    active.focus();
    if (action === "verifying") fireEvent.submit(screen.getByRole("form"));
    else fireEvent.click(resendButton);
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.click(resendButton);
    expect(submit).toHaveBeenCalledTimes(action === "verifying" ? 1 : 0);
    expect(resend).toHaveBeenCalledTimes(action === "resending" ? 1 : 0);
    expect(active).toHaveFocus();
    expect(active).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(change).toHaveBeenCalledOnce();
    setPending(undefined);
    expect(screen.getByRole("textbox")).toHaveValue("001234");
  },
);
it("lets resend and change email bypass code validation without clearing the caller's draft", () => {
  const resend = vi.fn(),
    change = vi.fn(),
    edited = vi.fn();
  render(() => (
    <SignInCodeForm
      {...defaults}
      code="12"
      codeError="Expired code."
      onCodeChange={edited}
      onResend={resend}
      onChangeEmail={change}
    />
  ));
  fireEvent.click(screen.getByRole("button", { name: "Send again" }));
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
  expect(resend).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledOnce();
  expect(edited).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("12");
});
it("preserves selection and independent feedback while callers update props", () => {
  const [codeError, setCodeError] = createSignal<string>();
  const [requestError, setRequestError] = createSignal<string>();
  const [notice, setNotice] = createSignal<string>();
  const [code, setCode] = createSignal("001234");
  const submitted = vi.fn();
  render(() => (
    <SignInCodeForm
      {...defaults}
      code={code()}
      onSubmit={submitted}
      codeError={codeError()}
      requestError={requestError()}
      notice={notice()}
      onReset={() => setCode("")}
    />
  ));
  const input = screen.getByRole("textbox") as HTMLInputElement;
  input.focus();
  input.setSelectionRange(1, 3);
  setRequestError("Unable to connect.");
  expect(input).not.toHaveAttribute("aria-invalid");
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
  expect(input).toHaveFocus();
  setCodeError("This code has expired.");
  fireEvent.submit(screen.getByRole("form"));
  expect(submitted).not.toHaveBeenCalled();
  expect(input).toHaveAccessibleDescription(
    "Use your most recent code. Error: This code has expired.",
  );
  setCodeError(undefined);
  setRequestError(undefined);
  setNotice("New code available.");
  expect(screen.getByRole("status")).toHaveTextContent("New code available.");
  (screen.getByRole("form") as HTMLFormElement).reset();
  expect(code()).toBe("");
  expect(input).toHaveValue("");
  expect(screen.getByRole("textbox")).toBe(input);
});
it("isolates field identities and native validation between instances", () => {
  render(() => (
    <>
      <SignInCodeForm {...defaults} code="" />
      <SignInCodeForm {...defaults} />
    </>
  ));
  const forms = screen.getAllByRole("form"),
    inputs = screen.getAllByRole("textbox");
  expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
  fireEvent.submit(forms[0]!);
  expect(within(forms[0]!).getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  expect(inputs[1]).not.toHaveAttribute("aria-invalid");
});
const stories = definePreview(preview).meta(meta);
it("clears local validation feedback when starting a resend", () => {
  const resend = vi.fn();
  render(() => <SignInCodeForm {...defaults} code="" onResend={resend} />);
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  fireEvent.click(screen.getByRole("button", { name: "Send again" }));
  expect(resend).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
});
it("runs native validation", async () => {
  await stories.story(Validation).run();
});
it("runs verification recovery", async () => {
  await stories.story(VerifyRecovery).run();
});
it("runs resend failure and recovery", async () => {
  await stories.story(ResendRecovery).run();
});
it("runs changing email while pending", async () => {
  await stories.story(ChangeEmail).run();
});
it("runs responsive composition", async () => {
  await stories.story(Layout).run();
});
