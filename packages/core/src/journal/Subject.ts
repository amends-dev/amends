import { Schema } from "effect";

const Kind = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/));

/** A namespaced entity key within a workspace, independent of authorization targets. */
export const Value = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*:.+$/s)).pipe(
  Schema.brand("FactSubject"),
);
export type Value = typeof Value.Type;

/** Construct an unambiguous entity key; IDs may themselves contain colons. @category constructors */
export const make = (kind: string, id: string): Value =>
  Value.make(`${Kind.make(kind)}:${Schema.NonEmptyString.make(id)}`);
