import { Effect, Schema } from "effect";
import * as Audience from "./audience.ts";
import * as Occurrence from "./occurrence.ts";
import * as Subject from "./subject.ts";

/** A domain fact's contract, before the journal adds publication metadata. */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  PayloadSchema extends Schema.Constraint = Schema.Constraint,
> {
  readonly name: Name;
  readonly version: Version;
  readonly payload: PayloadSchema;
  /** Pure, deterministic entity identity, derived from the validated payload. */
  subject(payload: PayloadSchema["Type"]): Subject.Value;
  /** Pure, deterministic identity of this occurrence; null leaves this payload repeatable. */
  occurrence?(payload: PayloadSchema["Type"]): ReadonlyArray<string> | null;
  /**
   * Pure, deterministic delivery scopes of this payload: who may learn of the fact beyond the
   * projections that apply it. Omitted, the fact stays internal.
   */
  audience?(payload: PayloadSchema["Type"]): ReadonlyArray<Audience.Scope>;
}

/** The payload accepted when publishing this fact. */
export type Payload<F extends Definition> = F["payload"]["Type"];

/**
 * Construct a fact definition while preserving its name, version, and full payload schema.
 *
 * @category constructors
 */
export const make = <
  const Name extends string,
  const Version extends number,
  PayloadSchema extends Schema.Constraint,
>(
  name: Name,
  options: {
    readonly version: Version;
    readonly payload: PayloadSchema;
    readonly subject: (payload: NoInfer<PayloadSchema["Type"]>) => Subject.Value;
    readonly occurrence?: (payload: NoInfer<PayloadSchema["Type"]>) => ReadonlyArray<string> | null;
    readonly audience?: (payload: NoInfer<PayloadSchema["Type"]>) => ReadonlyArray<Audience.Scope>;
  },
): Readonly<Definition<Name, Version, PayloadSchema>> =>
  Object.freeze({
    name,
    version: options.version,
    payload: options.payload,
    subject: options.subject,
    ...(options.occurrence === undefined ? {} : { occurrence: options.occurrence }),
    ...(options.audience === undefined ? {} : { audience: options.audience }),
  });

/**
 * Validate the decoded payload before invoking its occurrence rule, if declared.
 * @category constructors
 */
export const makeOccurrenceKey = Effect.fn("Fact.makeOccurrenceKey")(function* <
  F extends Definition,
>(fact: F, payload: Payload<NoInfer<F>>) {
  if (fact.occurrence === undefined) return null;
  const validated = yield* Schema.decodeUnknownEffect(Schema.toType(fact.payload))(payload);
  const parts = fact.occurrence(validated);
  return parts === null ? null : yield* Occurrence.makeKey(fact.name, parts);
});

/** Validate the payload and its declared subject. @category constructors */
export const makeSubject = Effect.fn("Fact.makeSubject")(function* <F extends Definition>(
  fact: F,
  payload: Payload<NoInfer<F>>,
) {
  const validated = yield* Schema.decodeUnknownEffect(Schema.toType(fact.payload))(payload);
  return yield* Schema.decodeEffect(Subject.Value)(fact.subject(validated));
});

/**
 * Validate the payload and its declared audience; a fact that declares none is internal.
 * @category constructors
 */
export const makeAudience = Effect.fn("Fact.makeAudience")(function* <F extends Definition>(
  fact: F,
  payload: Payload<NoInfer<F>>,
) {
  if (fact.audience === undefined) return Audience.internal;
  const validated = yield* Schema.decodeUnknownEffect(Schema.toType(fact.payload))(payload);
  return yield* Schema.decodeEffect(Audience.Value)(fact.audience(validated));
});
