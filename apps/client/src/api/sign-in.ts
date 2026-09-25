import { Cause, Data, Effect, type Exit, Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { SignIn, type Session } from "./contracts.ts";

export const isSignInEmail = Schema.is(SignIn.Email);
export const isSignInCode = Schema.is(SignIn.Code);

export type SignInRequest = Data.TaggedEnum<{
  RequestCode: { readonly attempt: number; readonly email: string };
  VerifyCode: { readonly attempt: number; readonly email: string; readonly code: string };
}>;
export const SignInRequest = Data.taggedEnum<SignInRequest>();
interface SignInResponse {
  readonly attempt: number;
  readonly exit: Exit.Exit<Session | undefined, unknown>;
}

const isRejected = Schema.is(SignIn.Rejected);
export function signInRejection(
  cause: Cause.Cause<unknown>,
): SignIn.Rejected["reason"] | undefined {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason) && isRejected(reason.error)) return reason.error.reason;
  }
  return undefined;
}

/** One request atom per controller, sharing only the credential-scoped API runtime. */
export const createSignInRequest = (client: ApiClient) =>
  client.runtime
    .fn<SignInRequest>()(
      Effect.fn("Client.SignIn.request")(function* (request): Effect.fn.Return<
        SignInResponse,
        never,
        ApiClient["Identifier"]
      > {
        const api = yield* client;
        if (request._tag === "VerifyCode") {
          const exit = yield* Effect.exit(
            api.session.complete({ payload: { email: request.email, code: request.code } }),
          );
          return { attempt: request.attempt, exit };
        }
        const exit = yield* Effect.exit(
          api.session.start({ payload: { email: request.email } }).pipe(Effect.as(undefined)),
        );
        return { attempt: request.attempt, exit };
      }),
    )
    .pipe(Atom.setIdleTTL(0));
