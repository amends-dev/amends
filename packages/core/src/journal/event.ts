import { Effect, Schema } from "effect";
import { Codec } from "./codec.ts";
import { Commit } from "./commit.ts";
import { Entry } from "./entry.ts";
import type { Fact } from "./fact.ts";
import type { Log } from "./log.ts";

/** Wraps a fact's name, version, and encoded payload for the domain journal's log. */
export const Envelope = Schema.Struct({
  name: Schema.String,
  version: Schema.Finite,
  payload: Schema.Uint8Array,
});
export interface Envelope extends Schema.Schema.Type<typeof Envelope> {}

export class FactMismatch extends Schema.TaggedError<FactMismatch>()("Journal.FactMismatch", {
  name: Schema.String,
  version: Schema.Finite,
}) {}

export const Id = Entry.Id;
export type Id = typeof Id.Type;

export const CommitId = Commit.Id;
export type CommitId = typeof CommitId.Type;

/** A published fact carries the metadata of its underlying log entry. */
export const Metadata = Entry.Metadata;

export interface Metadata extends Schema.Schema.Type<typeof Metadata> {}

export type Type<F extends Fact.Definition> = ReturnType<
  typeof makeSchema<F["name"], F["version"], F["payload"]>
>["Type"];

/**
 * Construct the event schema for one fact's name, version, and payload contract.
 *
 * @category constructors
 */
export const makeSchema = <
  const Name extends string,
  const Version extends number,
  PayloadSchema extends Schema.Constraint,
>(
  fact: Fact.Definition<Name, Version, PayloadSchema>,
) =>
  Schema.Struct({
    ...Metadata.fields,
    name: Schema.Literal(fact.name),
    version: Schema.Literal(fact.version),
    payload: fact.payload,
  });

/** Decode a recorded fact using its matching versioned definition. */
export const decode = Effect.fn("Event.decode")(function* <F extends Fact.Definition>(
  fact: F,
  entry: Log.Entry<Envelope>,
) {
  if (entry.payload.name !== fact.name || entry.payload.version !== fact.version) {
    return yield* new FactMismatch({ name: fact.name, version: fact.version });
  }
  const payload = yield* Codec.make(fact).decode(entry.payload.payload);
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(makeSchema<F["name"], F["version"], F["payload"]>(fact)),
  )({ ...entry, name: fact.name, version: fact.version, payload });
});

export * as Event from "./event.ts";
