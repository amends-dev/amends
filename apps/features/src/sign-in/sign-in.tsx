import { useSignIn } from "@amends/client";
import { SignInCodeForm, SignInEmailForm } from "@amends/ui/features/sign-in";
import {
  createContext,
  createEffect,
  createMemo,
  on,
  Show,
  useContext,
  type ParentProps,
} from "solid-js";

export type RootProps = ParentProps;
export interface EmailFormProps {
  readonly headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}
export interface CodeFormProps extends EmailFormProps {
  /** Describe this host's delivery method. Omit for neutral guidance. */
  readonly deliveryHint?: string;
}
const Context = createContext<{
  flow: ReturnType<typeof useSignIn>;
  forms: Partial<Record<"Email" | "Code", HTMLFormElement>>;
}>();
function context() {
  const value = useContext(Context);
  if (!value) throw new Error("SignIn parts require SignIn.Root.");
  return value;
}

/** One flow per owner. Mount inside ClientProvider; the app owns layout and navigation. */
export function Root(props: RootProps) {
  const flow = useSignIn();
  const forms: Partial<Record<"Email" | "Code", HTMLFormElement>> = {};
  createEffect(
    on(
      () => flow.state()._tag,
      (step, previous) => {
        if (previous === undefined || step === "SessionPresent") return;
        forms[step]?.querySelector("input")?.focus();
      },
    ),
  );
  return <Context.Provider value={{ flow, forms }}>{props.children}</Context.Provider>;
}

/** Connected email step; mounts its UI only while the flow requests an address. */
export function EmailForm(props: EmailFormProps) {
  const { flow, forms } = context();
  const email = createMemo(() => {
    const state = flow.state();
    return state._tag === "Email" ? state : undefined;
  });
  return (
    <Show when={email()}>
      <SignInEmailForm
        ref={(form) => {
          forms.Email = form;
        }}
        email={email()?.email ?? ""}
        pending={email()?.pending}
        emailError={email()?.error === "invalid-email" ? "Enter a valid email address." : undefined}
        requestError={
          email()?.error === "request-failed" ? "We couldn't request a code. Try again." : undefined
        }
        onEmailChange={flow.setEmail}
        onSubmit={flow.requestCode}
        headingAs={props.headingAs}
      />
    </Show>
  );
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

/** Connected verification step; shares the Root's controller with EmailForm. */
export function CodeForm(props: CodeFormProps) {
  const { flow, forms } = context();
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
  return (
    <Show when={code()}>
      <SignInCodeForm
        ref={(form) => {
          forms.Code = form;
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
  );
}
