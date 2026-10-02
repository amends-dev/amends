import { Crypto, Effect, Result, Schema } from "effect";
import { Hex } from "effect/encoding";

/**
 * A key the client chooses once for one logical request, such as a UUID, and repeats on every
 * retry of that request. A member's keys are independent of other members', and each creating
 * operation has its own.
 */
export const Key = Schema.NonEmptyString.check(Schema.isTrimmed(), Schema.isMaxLength(200)).pipe(
  Schema.brand("RequestKey"),
);
export type Key = typeof Key.Type;

/** What a creating operation accepts besides its input. */
export interface Options {
  /** Without a key, every call creates anew; with one, a retry returns the first call's result. */
  readonly requestKey?: Key | undefined;
}

/** A string's UTF-8 bytes; hex encoding reads strings as UTF-8, and valid hex always decodes. */
const utf8 = (text: string) => Result.getOrThrow(Hex.decode(Hex.encode(text)));

/**
 * The ID a keyed request gives the record it creates, derived from parts naming the operation,
 * who asked, and the key: a retry names the same record, so finding it answers the retry, and
 * nobody without the key can predict it. Formatted as a UUID (version 8).
 */
export const derivedId = Effect.fnUntraced(function* (parts: ReadonlyArray<string>) {
  const crypto = yield* Crypto.Crypto;
  const bytes = (yield* crypto.digest("SHA-256", utf8(JSON.stringify(parts)))).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Hex.encode(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
});

/**
 * The ID a creating request gives its record: new each time without a key, or derived from the
 * parts naming the operation and requester and from the key, so a retry names the record its first
 * attempt created and returns it.
 */
export const idFor = Effect.fnUntraced(function* (
  key: Key | undefined,
  parts: ReadonlyArray<string>,
) {
  if (key === undefined) return yield* (yield* Crypto.Crypto).randomUUIDv4;
  return yield* derivedId([...parts, key]);
});

export * as Request from "./request.ts";
