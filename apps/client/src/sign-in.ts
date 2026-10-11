import type { SignInCodeError, SignInEmailError } from "@amends-dev/ui/screens/sign-in";
import { Cause, Data, Exit, Option, Schema } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { Accounts, SignIn } from "./api/contracts.ts";
import { useMutation } from "./api/mutation.ts";
import { useSession } from "./provider.tsx";

export type SignInState = Data.TaggedEnum<{
  Email: {
    readonly email: string;
    readonly pending: boolean;
    readonly error: SignInEmailError | undefined;
  };
  Code: {
    readonly email: string;
    readonly code: string;
    readonly pending: "verifying" | "resending" | undefined;
    readonly error: SignInCodeError | undefined;
    /** A new code was sent, until the code changes. */
    readonly resent: boolean;
  };
}>;
export const SignInState = Data.taggedEnum<SignInState>();

export interface SignInController {
  readonly state: Accessor<SignInState>;
  readonly setEmail: (email: string) => void;
  readonly setCode: (code: string) => void;
  /** Send a code to the email, or to the draft, then ask for it. */
  readonly requestCode: (email?: string) => void;
  /** Check the code, or the draft; a match keeps the credential, which remounts the app. */
  readonly verifyCode: (code?: string) => void;
  /** Send another code to the same email, discarding the code typed so far once it is sent. */
  readonly resendCode: () => void;
  /** Back to the email, interrupting whatever is running. */
  readonly changeEmail: () => void;
}

const decodeEmail = Schema.decodeUnknownOption(Accounts.Email);
const isCode = Schema.is(SignIn.Code);
const isRejected = Schema.is(SignIn.Rejected);
/** Why the host refused a code, when it did. */
const rejectionOf = (cause: Cause.Cause<unknown>): SignIn.Rejected["reason"] | undefined => {
  for (const reason of cause.reasons)
    if (Cause.isFailReason(reason) && isRejected(reason.error)) return reason.error.reason;
  return undefined;
};

/**
 * Sign in by email: send a code, then check it. An address goes trimmed and lowercased, as
 * accounts hold it; a code goes as typed, keeping its leading zeros. An action that does not fit the current step, or
 * comes while one runs, does nothing; a failure keeps what was typed for another try.
 */
export function useSignIn(): SignInController {
  const session = useSession();
  const [state, setState] = createSignal<SignInState>(
    SignInState.Email({ email: "", pending: false, error: undefined }),
  );
  const sendCode = useMutation((api, email: string) => api.session.start({ payload: { email } }));
  const checkCode = useMutation((api, input: { readonly email: string; readonly code: string }) =>
    api.session.complete({ payload: input }),
  );
  /** The step, when it is `tag` and nothing runs. */
  const idle = <Tag extends SignInState["_tag"]>(tag: Tag) => {
    const current = state();
    return SignInState.$is(tag)(current) && !current.pending ? current : undefined;
  };
  const askForCode = (email: string, resent: boolean) =>
    setState(SignInState.Code({ email, code: "", pending: undefined, error: undefined, resent }));
  async function requestCode(draft?: string) {
    const step = idle("Email");
    if (!step) return;
    const typed = draft ?? step.email;
    const email = decodeEmail(typed);
    if (Option.isNone(email)) {
      setState(SignInState.Email({ email: typed, pending: false, error: "invalid-email" }));
      return;
    }
    setState(SignInState.Email({ email: typed, pending: true, error: undefined }));
    const exit = await sendCode.run(email.value);
    if (exit === undefined) return;
    if (Exit.isSuccess(exit)) askForCode(email.value, false);
    else setState(SignInState.Email({ email: typed, pending: false, error: "request-failed" }));
  }
  async function verifyCode(draft?: string) {
    const step = idle("Code");
    if (!step) return;
    const code = draft ?? step.code;
    if (!isCode(code)) {
      setState(SignInState.Code({ ...step, code, error: "invalid-code", resent: false }));
      return;
    }
    const verifying = SignInState.Code({
      ...step,
      code,
      pending: "verifying",
      error: undefined,
      resent: false,
    });
    setState(verifying);
    const exit = await checkCode.run({ email: step.email, code });
    if (exit === undefined) return;
    if (Exit.isSuccess(exit)) session.signIn(exit.value);
    else
      setState(
        SignInState.Code({
          ...verifying,
          pending: undefined,
          error: rejectionOf(exit.cause) ?? "verify-failed",
        }),
      );
  }
  async function resendCode() {
    const step = idle("Code");
    if (!step) return;
    const resending = SignInState.Code({
      ...step,
      pending: "resending",
      error: undefined,
      resent: false,
    });
    setState(resending);
    const exit = await sendCode.run(step.email);
    if (exit === undefined) return;
    if (Exit.isSuccess(exit)) askForCode(step.email, true);
    else setState(SignInState.Code({ ...resending, pending: undefined, error: "resend-failed" }));
  }
  return {
    state,
    setEmail: (email) => {
      if (idle("Email")) setState(SignInState.Email({ email, pending: false, error: undefined }));
    },
    setCode: (code) => {
      const step = idle("Code");
      if (step) setState(SignInState.Code({ ...step, code, error: undefined, resent: false }));
    },
    requestCode: (email) => void requestCode(email),
    verifyCode: (code) => void verifyCode(code),
    resendCode: () => void resendCode(),
    changeEmail: () => {
      sendCode.cancel();
      checkCode.cancel();
      setState(SignInState.Email({ email: state().email, pending: false, error: undefined }));
    },
  };
}
