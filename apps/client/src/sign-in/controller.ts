import { Data, Exit } from "effect";
import { createSignal, onCleanup, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  createSignInRequest,
  isSignInEmail,
  isSignInCode,
  signInRejection,
  SignInRequest,
} from "../api/sign-in.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

export type SignInState = Data.TaggedEnum<{
  Email: {
    readonly email: string;
    readonly pending: boolean;
    readonly error: "invalid-email" | "request-failed" | undefined;
  };
  Code: {
    readonly email: string;
    readonly code: string;
    readonly pending: "verifying" | "resending" | undefined;
    readonly error:
      | "invalid-code"
      | "mismatch"
      | "expired"
      | "unknown"
      | "verify-failed"
      | "resend-failed"
      | undefined;
    readonly resent: boolean;
  };
  /** A credential exists; the app's directory guard still owns its validation. */
  SessionPresent: {};
}>;
const SignInState = Data.taggedEnum<SignInState>();

export interface SignInController {
  readonly state: Accessor<SignInState>;
  readonly setEmail: (email: string) => void;
  readonly setCode: (code: string) => void;
  readonly requestCode: (email?: string) => void;
  readonly verifyCode: (code?: string) => void;
  readonly resendCode: () => void;
  readonly changeEmail: () => void;
}

/** Headless email/code flow, local to its Solid owner and credential scope. */
export function useSignIn(): SignInController {
  const session = useSession();
  const [state, setState] = createSignal<SignInState>(
    session.session
      ? SignInState.SessionPresent()
      : SignInState.Email({ email: "", pending: false, error: undefined }),
  );
  let alive = true;
  onCleanup(() => {
    alive = false;
  });
  const current = () => alive && session.isCurrent() && session.session === undefined;
  const request = useRequest(
    createSignInRequest(useApiClient()),
    (exit) => {
      const snapshot = state();
      if (snapshot._tag === "SessionPresent" || !snapshot.pending) return;
      if (Exit.isFailure(exit)) {
        if (snapshot._tag === "Email")
          setState(SignInState.Email({ ...snapshot, pending: false, error: "request-failed" }));
        else
          setState(
            SignInState.Code({
              ...snapshot,
              pending: undefined,
              error:
                snapshot.pending === "verifying"
                  ? (signInRejection(exit.cause) ?? "verify-failed")
                  : "resend-failed",
            }),
          );
        return;
      }
      if (snapshot._tag === "Email")
        setState(
          SignInState.Code({
            email: snapshot.email,
            code: "",
            pending: undefined,
            error: undefined,
            resent: false,
          }),
        );
      else if (snapshot.pending === "resending")
        setState(
          SignInState.Code({
            ...snapshot,
            code: "",
            pending: undefined,
            error: undefined,
            resent: true,
          }),
        );
      // Replacement remounts credential owners. Nothing may touch the old registry afterwards.
      else if (exit.value) session.replace(exit.value);
      else setState(SignInState.Code({ ...snapshot, pending: undefined, error: "verify-failed" }));
    },
    { when: () => session.session === undefined },
  );
  const begin = (next: SignInState, command: SignInRequest) => {
    const previous = state();
    setState(next);
    if (!request.run(command)) setState(previous);
  };
  return {
    state,
    setEmail: (email) => {
      const snapshot = state();
      if (!current() || snapshot._tag !== "Email" || snapshot.pending) return;
      setState(SignInState.Email({ email, pending: false, error: undefined }));
    },
    setCode: (code) => {
      const snapshot = state();
      if (!current() || snapshot._tag !== "Code" || snapshot.pending) return;
      setState(SignInState.Code({ ...snapshot, code, error: undefined, resent: false }));
    },
    requestCode: (email) => {
      const snapshot = state();
      if (!current() || snapshot._tag !== "Email" || snapshot.pending) return;
      const submitted = email ?? snapshot.email;
      if (!isSignInEmail(submitted)) {
        setState(SignInState.Email({ email: submitted, pending: false, error: "invalid-email" }));
        return;
      }
      begin(
        SignInState.Email({ email: submitted, pending: true, error: undefined }),
        SignInRequest.RequestCode({ email: submitted }),
      );
    },
    verifyCode: (code) => {
      const snapshot = state();
      if (!current() || snapshot._tag !== "Code" || snapshot.pending) return;
      const submitted = code ?? snapshot.code;
      if (!isSignInCode(submitted)) {
        setState(
          SignInState.Code({ ...snapshot, code: submitted, error: "invalid-code", resent: false }),
        );
        return;
      }
      begin(
        SignInState.Code({
          ...snapshot,
          code: submitted,
          pending: "verifying",
          error: undefined,
          resent: false,
        }),
        SignInRequest.VerifyCode({ email: snapshot.email, code: submitted }),
      );
    },
    resendCode: () => {
      const snapshot = state();
      if (!current() || snapshot._tag !== "Code" || snapshot.pending) return;
      begin(
        SignInState.Code({ ...snapshot, pending: "resending", error: undefined, resent: false }),
        SignInRequest.RequestCode({ email: snapshot.email }),
      );
    },
    changeEmail: () => {
      const snapshot = state();
      if (!current() || snapshot._tag === "SessionPresent") return;
      request.cancel();
      setState(SignInState.Email({ email: snapshot.email, pending: false, error: undefined }));
    },
  };
}
