import type { SignIn } from "@amends/gateway/sign-in";
import { Effect } from "effect";
import { ApiClient } from "./client.ts";
export const makeStart = () =>
  ApiClient.runtime.fn(
    Effect.fn("Session.start")(function* (email: SignIn.Email) {
      const client = yield* ApiClient;
      return yield* client.session.start({ payload: { email } });
    }),
  );
export const makeComplete = () =>
  ApiClient.runtime.fn(
    Effect.fn("Session.complete")(function* (payload: { email: SignIn.Email; code: SignIn.Code }) {
      const client = yield* ApiClient;
      return yield* client.session.complete({ payload });
    }),
  );
export * as Session from "./session.ts";
