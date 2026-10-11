/**
 * Sealing connections' credentials with the host's credential key: AES-256-GCM with a random
 * nonce per secret, and the row's identity as additional data, so a sealed value opens only as the
 * credential it was stored as.
 */
import { Context, Data, Effect, Layer, Redacted, Result } from "effect";
import { Base64 } from "effect/encoding";
import type { Option } from "effect";

/** The key is malformed, or a secret failed to seal or open. */
export class Failure extends Data.TaggedError("CredentialKey.Failure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface Cipher {
  readonly seal: (secret: string, binding: string) => Effect.Effect<string, Failure>;
  readonly open: (sealed: string, binding: string) => Effect.Effect<string, Failure>;
}

/** The host's credential key, when it configured one. */
export class CredentialKey extends Context.Service<CredentialKey, Option.Option<Cipher>>()(
  "@amends-dev/storage-postgresql/credential-key/Service",
) {}

const version = "v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const asFailure = (cause: unknown) =>
  cause instanceof Failure
    ? cause
    : new Failure({ message: cause instanceof Error ? cause.message : String(cause), cause });
const bytes = (base64: string) =>
  Result.getOrThrowWith(
    Base64.decode(base64),
    () => new Failure({ message: "The credential key must be base64" }),
  );

/**
 * Import a base64-encoded 32-byte key, failing for anything else.
 *
 * @category constructors
 */
export const make = (key: Redacted.Redacted<string>): Effect.Effect<Cipher, Failure> =>
  Effect.tryPromise({
    try: async () => {
      const raw = bytes(Redacted.value(key));
      if (raw.length !== 32)
        throw new Failure({ message: "The credential key must be 32 bytes, encoded as base64" });
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    },
    catch: asFailure,
  }).pipe(
    Effect.map((cryptoKey) => ({
      seal: (secret, binding) =>
        Effect.tryPromise({
          try: async () => {
            const nonce = crypto.getRandomValues(new Uint8Array(12));
            const sealed = await crypto.subtle.encrypt(
              { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(binding) },
              cryptoKey,
              encoder.encode(secret),
            );
            return `${version}:${Base64.encode(nonce)}:${Base64.encode(new Uint8Array(sealed))}`;
          },
          catch: asFailure,
        }),
      open: (sealed, binding) =>
        Effect.tryPromise({
          try: async () => {
            const [tag, nonce, data] = sealed.split(":");
            if (tag !== version || nonce === undefined || data === undefined)
              throw new Failure({ message: "Unrecognized sealed credential" });
            const opened = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: bytes(nonce), additionalData: encoder.encode(binding) },
              cryptoKey,
              bytes(data),
            );
            return decoder.decode(opened);
          },
          catch: asFailure,
        }),
    })),
  );

/** @category layers */
export const layer = (key: Option.Option<Cipher>) => Layer.succeed(CredentialKey, key);
