import type { Schema } from "effect";

/** A domain fact's contract, before the journal adds publication metadata. */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  PayloadSchema extends Schema.Constraint = Schema.Constraint,
> {
  readonly name: Name;
  readonly version: Version;
  readonly payload: PayloadSchema;
}

/** The payload accepted when publishing this fact. */
export type Payload<F extends Definition> = F["payload"]["Type"];

/** Defines a fact while preserving its name, version, and full payload schema. */
export const make = <
  const Name extends string,
  const Version extends number,
  PayloadSchema extends Schema.Constraint,
>(
  name: Name,
  options: {
    readonly version: Version;
    readonly payload: PayloadSchema;
  },
): Definition<Name, Version, PayloadSchema> => ({
  name,
  version: options.version,
  payload: options.payload,
});

export * as Fact from "./fact.ts";
