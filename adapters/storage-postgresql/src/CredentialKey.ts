/**
 * Sealing connections' credentials with the host's credential key: AES-256-GCM with a random
 * nonce per secret, and the row's identity as additional data, so a sealed value opens only as the
 * credential it was stored as. `PostgresWorkspaceStorage.make` imports the key from the host's
 * `credentialKey` option once, failing the host's start on a malformed one, and provides it to
 * every workspace's `ConnectionCredentials` store as `CredentialKey`.
 *
 * @since 0.1.0
 */
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Base64 from "effect/encoding/Base64";
import type * as Option from "effect/Option";

/**
 * The key is malformed, or a secret failed to seal or open.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Data.TaggedError("CredentialKey.Failure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * The imported key, which seals a secret and opens it again. A sealed value is text: a version
 * tag, the nonce, and the ciphertext.
 *
 * @category models
 * @since 0.1.0
 */
export interface Cipher {
  /** Seal `secret`, bound to `binding`: only the same binding opens it. */
  readonly seal: (secret: string, binding: string) => Effect.Effect<string, Failure>;
  /** Open what `seal` returned for the same binding; anything else fails. */
  readonly open: (sealed: string, binding: string) => Effect.Effect<string, Failure>;
}

/**
 * The host's credential key, when it configured one; none means the host stores no credentials.
 *
 * @category services
 * @since 0.1.0
 */
export class CredentialKey extends Context.Service<CredentialKey, Option.Option<Cipher>>()(
  "@amends-dev/storage-postgresql/CredentialKey",
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
 * @since 0.1.0
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

/**
 * Provides `CredentialKey` with the key the host imported, or none.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (key: Option.Option<Cipher>) => Layer.succeed(CredentialKey, key);
