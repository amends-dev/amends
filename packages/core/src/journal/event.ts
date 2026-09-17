import { Schema } from "effect";
import { Commit } from "./commit.ts";
import { Entry } from "./entry.ts";
import type { Fact } from "./fact.ts";

export const Id = Entry.Id;
export type Id = typeof Id.Type;

export const CommitId = Commit.Id;
export type CommitId = typeof CommitId.Type;

/** A published fact carries the metadata of its underlying log entry. */
export const Metadata = Entry.Metadata;

export interface Metadata extends Schema.Schema.Type<typeof Metadata> {}

export type Type<F extends Fact.Definition> = ReturnType<
  typeof schema<F["name"], F["version"], F["payload"]>
>["Type"];

/** Builds the event schema for one fact's name, version, and payload contract. */
export const schema = <
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

export * as Event from "./event.ts";
