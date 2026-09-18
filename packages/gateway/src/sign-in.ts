import { Identity } from "@amends/core/identity";
import { Context, Schema } from "effect";
import type { Effect } from "effect";

export const Email = Schema.String.check(
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { title: "email address" }),
);
export type Email = typeof Email.Type;

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
   * Send a one-time code to the address. Unknown addresses are accepted: the
   * same step creates the identity, and one address is one identity.
   */
  readonly start: (email: Email) => Effect.Effect<void>;
  /** Exchange a delivered code for a session. A code works once. */
  readonly complete: (email: Email, code: Code) => Effect.Effect<Session, Rejected>;
}

/** The ingress that produces authenticated humans; hosts own delivery and token issuance. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/sign-in/Service",
) {}

export * as SignIn from "./sign-in.ts";
