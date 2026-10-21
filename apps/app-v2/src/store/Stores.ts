/**
 * The stores the person's browser opens: one of each workspace they open, shared by whatever reads or
 * writes it, open from its first reader until a while after its last one stops. A reader names the
 * workspace and the member it acts as; the session names the host and the person.
 */

import type { Identity } from "@amends-dev/core/identity"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as RcMap from "effect/RcMap"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Session from "../session.ts"
import * as Store from "./Store.ts"

/** Whose store, of which workspace, as which member of it. */
class Key extends Data.Class<{
  readonly humanId: Identity.HumanId
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly memberId: MemberId.MemberId
}> {}

/** Why a store could not open: no one is signed in, or the browser could not open its databases. */
export type OpenError = Session.NotSignedIn | Layer.Error<ReturnType<typeof Store.layer>>

/** How the person reads that their replica could not be read. */
export const unreadable = "This browser could not read the workspace’s copy."

/** How the person reads that an action could not be kept. */
export const unwritable = "This browser could not keep that. Try again."

/** How long a store stays open after its last reader or writer let go. */
const lingers = "10 seconds"

export class Stores extends Context.Service<
  Stores,
  {
    /** The person's store of `workspaceId`, as `memberId`, for as long as the scope lasts. */
    readonly open: (
      workspaceId: WorkspaceId.WorkspaceId,
      memberId: MemberId.MemberId
    ) => Effect.Effect<Store.Store["Service"], OpenError, Scope.Scope>
    /** What `from` reads of the store, which stays open for as long as the stream runs. */
    readonly read: <A, E>(
      workspaceId: WorkspaceId.WorkspaceId,
      memberId: MemberId.MemberId,
      from: (store: Store.Store["Service"]) => Stream.Stream<A, E>
    ) => Stream.Stream<A, E | OpenError>
    /** Write to the store with `to`, which stays open for as long as the write takes. */
    readonly write: <E>(
      workspaceId: WorkspaceId.WorkspaceId,
      memberId: MemberId.MemberId,
      to: (store: Store.Store["Service"]) => Effect.Effect<unknown, E>
    ) => Effect.Effect<void, E | OpenError>
  }
>()("@amends-dev/app-v2/store/Stores") {}

/**
 * The stores of the person the session names, opened over the browser's services.
 *
 * @category layers
 */
export const layer = Layer.effect(
  Stores,
  Effect.gen(function* () {
    const session = yield* Session.Session
    const stores = yield* RcMap.make({
      lookup: (key: Key) =>
        Effect.gen(function* () {
          const { token } = yield* session.required
          const built = yield* Layer.build(
            Store.layer({
              apiUrl: session.apiUrl,
              token,
              humanId: key.humanId,
              workspaceId: key.workspaceId,
              memberId: key.memberId
            })
          )
          return Context.get(built, Store.Store)
        }),
      idleTimeToLive: lingers
    })
    const open = (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) =>
      Effect.flatMap(session.required, ({ account }) =>
        RcMap.get(stores, new Key({ humanId: account.id, workspaceId, memberId }))
      )
    return Stores.of({
      open,
      read: (workspaceId, memberId, from) => Stream.unwrap(Effect.map(open(workspaceId, memberId), from)),
      write: (workspaceId, memberId, to) =>
        Effect.asVoid(Effect.scoped(Effect.flatMap(open(workspaceId, memberId), to)))
    })
  })
)

/** Whose store an action is written to: the member, in their workspace. */
export const AsMember = { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId }
export type AsMember = { readonly workspaceId: WorkspaceId.WorkspaceId; readonly memberId: MemberId.MemberId }

/** `input` decoded by `schema`, or `refused`, what the person reads when it does not decode. */
export const decoded = <S extends Schema.Top, Refused>(schema: S, input: S["Encoded"], refused: Refused) =>
  Schema.decodeEffect(schema)(input).pipe(Effect.mapError(() => refused))

/**
 * Writing to a member's store through `stores`: each write ends in `wrote`, or in what `failed`
 * makes of why it could not be kept.
 */
export const writer =
  <Wrote, Failed>(stores: Stores["Service"], wrote: Wrote, failed: (error: string) => Failed) =>
  <E>(member: AsMember, to: (store: Store.Store["Service"]) => Effect.Effect<unknown, E>) =>
    stores.write(member.workspaceId, member.memberId, to).pipe(
      Effect.as(wrote),
      Effect.catchCause(() => Effect.succeed(failed(unwritable)))
    )
