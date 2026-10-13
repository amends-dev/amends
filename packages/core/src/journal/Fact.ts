/**
 * A fact is a versioned statement a domain records about what changed, such as `thread.created`.
 * Its definition names it, gives its payload schema a version, and declares pure rules the journal
 * applies to each payload: the subject it changes, an optional occurrence identity that makes
 * publication idempotent, and an optional audience. Domains declare facts with `make` in their
 * `*Facts` modules and publish them with `Journal.publish`; projections handle them.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Audience from "./Audience.ts"
import * as Occurrence from "./Occurrence.ts"
import * as Subject from "./Subject.ts"

/**
 * A domain fact's contract, before the journal adds publication metadata. Definitions registered
 * under one name and version must share their payload schema and their subject and occurrence
 * rules; the journal checks that they are the same values.
 *
 * @category models
 * @since 0.1.0
 */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  PayloadSchema extends Schema.Constraint = Schema.Constraint
> {
  /** The fact's name, such as `thread.created`, which its occurrence keys include. */
  readonly name: Name
  /** The version of its payload schema; projections register each version they handle. */
  readonly version: Version
  /** What the fact records, encoded to bytes by `Codec.make`. */
  readonly payload: PayloadSchema
  /** Pure, deterministic entity identity, derived from the validated payload. */
  subject(payload: PayloadSchema["Type"]): Subject.Subject
  /** Pure, deterministic identity of this occurrence; null leaves this payload repeatable. */
  occurrence?(payload: PayloadSchema["Type"]): ReadonlyArray<string> | null
  /**
   * Pure, deterministic delivery scopes of this payload: who may learn of the fact beyond the
   * projections that apply it. Omitted, the fact stays internal.
   */
  audience?(payload: PayloadSchema["Type"]): ReadonlyArray<Audience.Scope>
}

/**
 * The payload of fact `F`, as `Journal.publish` accepts it and the fact's rules receive it.
 *
 * @category models
 * @since 0.1.0
 */
export type Payload<F extends Definition> = F["payload"]["Type"]

/**
 * Declares a fact: its name, and in `options` its version, payload schema, subject rule, and
 * optionally its occurrence and audience rules. The definition is frozen, and its literal name and
 * version stay in its type.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <const Name extends string, const Version extends number, PayloadSchema extends Schema.Constraint>(
  name: Name,
  options: {
    readonly version: Version
    readonly payload: PayloadSchema
    readonly subject: (payload: NoInfer<PayloadSchema["Type"]>) => Subject.Subject
    readonly occurrence?: (payload: NoInfer<PayloadSchema["Type"]>) => ReadonlyArray<string> | null
    readonly audience?: (payload: NoInfer<PayloadSchema["Type"]>) => ReadonlyArray<Audience.Scope>
  }
): Readonly<Definition<Name, Version, PayloadSchema>> =>
  Object.freeze({
    name,
    version: options.version,
    payload: options.payload,
    subject: options.subject,
    ...(options.occurrence === undefined ? {} : { occurrence: options.occurrence }),
    ...(options.audience === undefined ? {} : { audience: options.audience })
  })

/**
 * The idempotency key of publishing `payload` as `fact`, or null when the fact declares no
 * occurrence rule or its rule returns null for this payload. The payload is checked against the
 * fact's schema before the rule runs. Use it to look up an occurrence with `getAppend` before
 * publishing.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeOccurrenceKey = Effect.fnUntraced(function* <F extends Definition>(
  fact: F,
  payload: Payload<NoInfer<F>>
) {
  if (fact.occurrence === undefined) return null
  const validated = yield* Schema.decodeUnknownEffect(Schema.toType(fact.payload))(payload)
  const parts = fact.occurrence(validated)
  return parts === null ? null : yield* Occurrence.makeKey(fact.name, parts)
})

/**
 * The subject `fact` declares for `payload`, after checking the payload against the fact's schema
 * and the subject against `Subject.Subject`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeSubject = Effect.fnUntraced(function* <F extends Definition>(fact: F, payload: Payload<NoInfer<F>>) {
  const validated = yield* Schema.decodeUnknownEffect(Schema.toType(fact.payload))(payload)
  return yield* Schema.decodeEffect(Subject.Subject)(fact.subject(validated))
})

/**
 * The audience `fact` declares for `payload`, after checking the payload against the fact's schema
 * and the scopes against `Audience.Audience`, which requires them distinct. A fact that declares none
 * is internal: `Audience.internal`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeAudience = Effect.fnUntraced(function* <F extends Definition>(fact: F, payload: Payload<NoInfer<F>>) {
  if (fact.audience === undefined) return Audience.internal
  const validated = yield* Schema.decodeUnknownEffect(Schema.toType(fact.payload))(payload)
  return yield* Schema.decodeEffect(Audience.Audience)(fact.audience(validated))
})
