/**
 * The identity of one occurrence of an append, which makes it idempotent: a retry under the same
 * key, scoped to the workspace and log, returns the original entries. A fact's `occurrence` rule
 * names an occurrence with stable parts, such as a record's ID, and the journal turns the fact's
 * name and those parts into a key, so a retry returns the original event. The key's encoding is a
 * persistence contract.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

/**
 * Stable identity for one append within a workspace and log, which `Store` and `Log` take as an
 * append's `idempotencyKey`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Key = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(Schema.brand("LogIdempotencyKey"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Key = typeof Key.Type

const component = Schema.String.check(Schema.isPattern(/\S/, { title: "nonblank occurrence component" }))

/**
 * The stable parts that name an occurrence, as a fact's `occurrence` rule returns them: at least
 * one, each with a character other than whitespace.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Parts = Schema.NonEmptyArray(component)

/**
 * @category schemas
 * @since 0.1.0
 */
export type Parts = typeof Parts.Type

/**
 * The key of the occurrence that `input`, its parts, names for the fact `name`: `fact:` followed by
 * the JSON of the name and the parts, so no delimiter collides. This format is a persistence
 * contract: schema versions are deliberately excluded, so a new version cannot silently republish
 * it. Use it to look up an occurrence before the rest of its payload exists;
 * `Fact.makeOccurrenceKey` derives the same key from a payload.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeKey = Effect.fnUntraced(function* (name: string, input: ReadonlyArray<string>) {
  const factName = yield* Schema.decodeEffect(component)(name)
  const parts = yield* Schema.decodeUnknownEffect(Parts)(input)
  return Key.make(`fact:${JSON.stringify([factName, parts])}`)
})
