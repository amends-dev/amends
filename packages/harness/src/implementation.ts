import { Schema } from "effect";
import { Harness } from "./harness.ts";

/**
 * Where a harness's loop can run: in the amends process, where any sandbox is only where its tools
 * act, or as a program inside a sandbox, which amends starts and talks to over a port.
 */
export const Placement = Schema.Literals(["in-process", "in-sandbox"]);
export type Placement = typeof Placement.Type;

/**
 * How a harness reaches a model. `LanguageModel` takes Effect AI model access from a connection's
 * implementation, so any model connection this host installed works; `Interfaces` means the
 * harness speaks these provider interfaces itself, such as `anthropic-messages`.
 */
export const ModelAccess = Schema.TaggedUnion({
  LanguageModel: {},
  Interfaces: { interfaces: Schema.NonEmptyArray(Schema.NonEmptyString) },
});
export type ModelAccess = typeof ModelAccess.Type;

/**
 * What a harness implementation declares about itself: the data a host registers in its catalog
 * and core checks environments and model selections against.
 */
export const Declaration = Schema.Struct({
  id: Harness.Name,
  name: Schema.NonEmptyString,
  description: Schema.String,
  placement: Schema.NonEmptyArray(Placement),
  models: ModelAccess,
  /** Reasoning levels it can request, if any; an agent asking for another is incompatible. */
  reasoning: Schema.optionalKey(Schema.NonEmptyArray(Schema.NonEmptyString)),
});
export interface Declaration extends Schema.Schema.Type<typeof Declaration> {}

export * as HarnessImplementation from "./implementation.ts";
