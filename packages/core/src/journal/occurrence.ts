import { Effect, Schema } from "effect";

/** Stable identity for one append within a workspace and log. */
export const Key = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(
  Schema.brand("LogIdempotencyKey"),
);
export type Key = typeof Key.Type;

const component = Schema.String.check(
  Schema.isPattern(/\S/, { title: "nonblank occurrence component" }),
);
export const Parts = Schema.NonEmptyArray(component);
export type Parts = typeof Parts.Type;

/**
 * Encode fact identity without delimiter collisions. This format is a persistence contract:
 * schema versions are deliberately excluded, so a new version cannot silently republish it.
 * @category constructors
 */
export const makeKey = Effect.fn("Occurrence.makeKey")(function* (
  name: string,
  input: ReadonlyArray<string>,
) {
  const factName = yield* Schema.decodeEffect(component)(name);
  const parts = yield* Schema.decodeUnknownEffect(Parts)(input);
  return Key.make(`fact:${JSON.stringify([factName, parts])}`);
});
