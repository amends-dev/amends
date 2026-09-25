import { Cause, Data, Effect, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { SignIn } from "./contracts.ts";
import { requestAtom } from "./request.ts";

export const isSignInEmail = Schema.is(SignIn.Email);
export const isSignInCode = Schema.is(SignIn.Code);

export type SignInRequest = Data.TaggedEnum<{
  RequestCode: { readonly email: string };
  VerifyCode: { readonly email: string; readonly code: string };
}>;
export const SignInRequest = Data.taggedEnum<SignInRequest>();

const isRejected = Schema.is(SignIn.Rejected);
export function signInRejection(
  cause: Cause.Cause<unknown>,
): SignIn.Rejected["reason"] | undefined {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason) && isRejected(reason.error)) return reason.error.reason;
  }
  return undefined;
}

/** One request atom per controller: requesting a code answers nothing, verifying a session. */
export const createSignInRequest = (client: ApiClient) =>
  requestAtom(client, (request: SignInRequest) =>
    Effect.gen(function* () {
      const api = yield* client;
      if (request._tag === "VerifyCode")
        return yield* api.session.complete({
          payload: { email: request.email, code: request.code },
        });
      yield* api.session.start({ payload: { email: request.email } });
      return undefined;
    }),
  );
