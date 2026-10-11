import { Identity } from "@amends-dev/core/identity";
import { Context, Schema } from "effect";
import type { Effect } from "effect";
import type { Accounts } from "./accounts.ts";

export const Code = Schema.String.check(Schema.isPattern(/^\d{6}$/, { title: "six-digit code" }));
export type Code = typeof Code.Type;

/** A credential the host accepts and its human ID; JSON retains the existing identity field. */
export const Session = Schema.Struct({ token: Schema.NonEmptyString, humanId: Identity.HumanId })
  .pipe(Schema.encodeKeys({ humanId: "identity" }))
  .annotate({ identifier: "SignInSession" });
export interface Session extends Schema.Schema.Type<typeof Session> {}

export class Rejected extends Schema.TaggedError<Rejected>()("SignIn.Rejected", {
  reason: Schema.Literals(["unknown", "mismatch", "expired"]),
}) {}

export interface Interface {
  /**
   * Send a one-time code to the address. Unknown addresses are accepted: completing
   * sign-in finds or creates the address's account.
   */
  readonly start: (email: Accounts.Email) => Effect.Effect<void>;
  /** Exchange a delivered code for a session as the address's account. A code works once. */
  readonly complete: (email: Accounts.Email, code: Code) => Effect.Effect<Session, Rejected>;
}

/** The ingress that produces authenticated humans; hosts own delivery and token issuance. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/gateway/sign-in/Service",
) {}

export * as SignIn from "./sign-in.ts";
