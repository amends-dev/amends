/**
 * Request keys, which make a request safe to send again and let whoever sends it know the IDs of
 * what it creates. A key names one logical request of one member. A protocol runs the operation
 * the request asks for inside `withKey`, which makes it the `Current` request; every record the
 * operation creates then takes `newId`'s ID, derived from the key, the record's kind, and what
 * tells it apart from others of its kind in the request. A retry names the records its first
 * attempt created, so a creating operation finds them and returns what it created, and a browser
 * that wrote the request computes them beforehand with the same functions. Outside a request a
 * record's ID is new. A record with an identity of its own, such as a direct group, derives its
 * ID from that with `derivedId`.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Actor from "../identity/Actor.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * A key the client chooses once for one logical request, such as a UUID, and repeats on every
 * retry of that request. A member's keys are independent of other members'. A key names one
 * request: sent with another, it finds what the first created where their records coincide.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Key = Schema.NonEmptyString.check(Schema.isTrimmed(), Schema.isMaxLength(200)).pipe(
  Schema.brand("RequestKey")
)
/**
 * @category schemas
 * @since 0.1.0
 */
export type Key = typeof Key.Type

/**
 * The request being run: whose it is, in which workspace, and its key. `withKey` provides it
 * around an operation; a browser provides it to compute the IDs of what a request it wrote will
 * create.
 *
 * @category services
 * @since 0.1.0
 */
export class Current extends Context.Service<
  Current,
  {
    readonly workspaceId: WorkspaceId.WorkspaceId
    readonly memberId: MemberId.MemberId
    readonly key: Key
  }
>()("@amends-dev/core/request/Request/Current") {}

/**
 * Run `effect` as the acting member's request `key`, so what it creates takes IDs derived from the
 * key. Without a key it runs as no request, and what it creates takes new IDs.
 *
 * @category combinators
 * @since 0.1.0
 */
export const withKey =
  (key: Key | undefined) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Actor.Actor> =>
    key === undefined
      ? effect
      : Effect.provideServiceEffect(
          effect,
          Current,
          Effect.map(Effect.service(Actor.Actor), ({ workspaceId, memberId }) =>
            Current.of({ workspaceId, memberId, key })
          )
        )

// Every runtime a host runs on has the WHATWG `TextEncoder`, which no type this package includes
// declares, and Effect exports no encoder of its own.
declare const TextEncoder: new () => { readonly encode: (text: string) => Uint8Array }
const encoder = new TextEncoder()

/**
 * The ID derived from `parts`, the same for the same parts and unpredictable without them:
 * SHA-256 of the parts, formatted as a UUID (version 8).
 *
 * @category constructors
 * @since 0.1.0
 */
export const derivedId = Effect.fnUntraced(function* (parts: ReadonlyArray<string>) {
  const crypto = yield* Crypto.Crypto
  const bytes = (yield* crypto.digest("SHA-256", encoder.encode(JSON.stringify(parts)))).slice(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Hex.encode(bytes)
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
})

/**
 * The ID of a record the current request creates: derived from the request, the record's `kind`,
 * and the `parts` that tell it apart from others of its kind in the request, so a retry and the
 * browser that wrote the request name the same record. Outside a request, a new ID.
 *
 * @category constructors
 * @since 0.1.0
 */
export const newId = Effect.fnUntraced(function* (kind: string, parts: ReadonlyArray<string>) {
  const current = yield* Effect.serviceOption(Current)
  if (Option.isNone(current)) return yield* (yield* Crypto.Crypto).randomUUIDv4()
  const { workspaceId, memberId, key } = current.value
  return yield* derivedId([kind, workspaceId, memberId, key, ...parts])
})
