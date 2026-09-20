import { Effect, Schema } from "effect";
import { Occurrence } from "./occurrence.ts";

/** A domain fact's contract, before the journal adds publication metadata. */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  PayloadSchema extends Schema.Constraint = Schema.Constraint,
> {
  readonly name: Name;
  readonly version: Version;
  readonly payload: PayloadSchema;
  /** Pure, deterministic identity of this occurrence; null leaves this payload repeatable. */
  occurrence?(payload: PayloadSchema["Type"]): ReadonlyArray<string> | null;
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
    readonly occurrence?: (payload: NoInfer<PayloadSchema["Type"]>) => ReadonlyArray<string> | null;
  },
): Readonly<Definition<Name, Version, PayloadSchema>> =>
  Object.freeze({
    name,
    version: options.version,
    payload: options.payload,
    ...(options.occurrence === undefined ? {} : { occurrence: options.occurrence }),
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

export * as Fact from "./fact.ts";
