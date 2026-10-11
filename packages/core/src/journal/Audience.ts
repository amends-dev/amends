import { Schema } from "effect";

const Kind = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/));

/**
 * One delivery scope: every member of the workspace, or the readers of one kind and ID, such as
 * a group or a member. The journal records what each fact declares; a consumer decides which
 * scopes each reader holds.
 */
export const Scope = Schema.String.check(
  Schema.isPattern(/^(?:workspace|[a-z][a-z0-9-]*:.+)$/s),
).pipe(Schema.brand("AudienceScope"));
export type Scope = typeof Scope.Type;

/** Every member of the workspace. */
export const workspace: Scope = Scope.make("workspace");

/** The readers of one kind and ID, such as `group:<id>`; IDs may contain colons. @category constructors */
export const make = (kind: string, id: string): Scope =>
  Scope.make(`${Kind.make(kind)}:${Schema.NonEmptyString.make(id)}`);

/**
 * Who may learn of a fact beyond the projections that apply it: a reader holding any one of
 * these scopes. An empty audience keeps the fact internal.
 */
export const Value = Schema.UniqueArray(Scope);
export type Value = typeof Value.Type;

/** No reader: the fact stays internal. */
export const internal: Value = [];
