import { useSignIn } from "@amends/client";
import { SignInCodeForm, SignInEmailForm } from "@amends/ui/features/sign-in";
import { createEffect, createMemo, on, Show } from "solid-js";

export interface SignInProps {
  /** Describe this host's delivery method. Omit for the form's neutral guidance. */
  readonly deliveryHint?: string;
  readonly headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

const codeErrors = {
  "invalid-code": "Enter all six digits.",
  mismatch: "That code doesn't match. Check it and try again.",
  expired: "This code has expired. Request a new one.",
  unknown: "This code is no longer available. Request a new one.",
  "verify-failed": undefined,
  "resend-failed": undefined,
} as const;
const requestErrors = {
  "invalid-code": undefined,
  mismatch: undefined,
  expired: undefined,
  unknown: undefined,
  "verify-failed": "We couldn't verify your code. Try again.",
  "resend-failed": "We couldn't request a new code. Try again.",
} as const;

/** Mount inside ClientProvider. The app owns session validation and navigation. */
export function SignIn(props: SignInProps) {
  const flow = useSignIn();
  let emailForm: HTMLFormElement | undefined;
  let codeForm: HTMLFormElement | undefined;
  const email = createMemo(() => {
    const state = flow.state();
    return state._tag === "Email" ? state : undefined;
  });
  const code = createMemo(() => {
    const state = flow.state();
    return state._tag === "Code" ? state : undefined;
  });
  const codeError = createMemo(() => {
    const error = code()?.error;
    return error ? codeErrors[error] : undefined;
  });
  const requestError = createMemo(() => {
    const error = code()?.error;
    return error ? requestErrors[error] : undefined;
  });
  createEffect(
    on(
      () => flow.state()._tag,
      (step, previous) => {
        if (previous === undefined) return;
        const form = step === "Email" ? emailForm : step === "Code" ? codeForm : undefined;
        form?.querySelector("input")?.focus();
      },
    ),
  );
  return (
    <>
      <Show when={email()}>
        <SignInEmailForm
          ref={(form) => {
            emailForm = form;
          }}
          email={email()?.email ?? ""}
          pending={email()?.pending}
          emailError={
            email()?.error === "invalid-email" ? "Enter a valid email address." : undefined
          }
          requestError={
            email()?.error === "request-failed"
              ? "We couldn't request a code. Try again."
              : undefined
          }
          onEmailChange={flow.setEmail}
          onSubmit={flow.requestCode}
          headingAs={props.headingAs}
        />
      </Show>
      <Show when={code()}>
        <SignInCodeForm
          ref={(form) => {
            codeForm = form;
          }}
          email={code()?.email ?? ""}
          code={code()?.code ?? ""}
          pending={code()?.pending}
          codeError={codeError()}
          requestError={requestError()}
          notice={code()?.resent ? "A new code is available. Use the latest code." : undefined}
          onCodeChange={flow.setCode}
          onSubmit={flow.verifyCode}
          onResend={flow.resendCode}
          onChangeEmail={flow.changeEmail}
          deliveryHint={props.deliveryHint}
          headingAs={props.headingAs}
        />
      </Show>
    </>
  );
}
