import { CoreError } from "@amends-dev/core/error"
import { Turn, TurnId } from "@amends-dev/core/turn"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as ApiErrors from "@amends-dev/http/ApiErrors"
import type { TurnProblem } from "@amends-dev/ui/screens/turns"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { isUnauthorized, perClient, type ApiClient, type WorkspaceApi } from "../api/client.ts"
import { command } from "../api/failures.ts"
import { itemKeys, workspaceKey } from "../api/keys.ts"
import { retryDelay } from "../api/retry.ts"
import { watchWake } from "../live/wake.ts"
import { drafted, type Drafts } from "./drafts.ts"

export { Turn }

/**
 * The turns the change feed delivered to the reader in one workspace, each as they see it now, and
 * how many it has delivered in all. The count only grows while the client runs, so a read can say
 * which deliveries it covers: those it began after.
 */
interface DeliveredTurns {
  readonly count: number
  readonly turns: ReadonlyMap<string, { readonly turn: Turn.View; readonly delivery: number }>
}
const deliveredTurnsOf = Atom.family((_workspaceId: string) =>
  Atom.make<DeliveredTurns>({ count: 0, turns: new Map() }).pipe(Atom.keepAlive)
)
/** Note a turn as the change feed delivered it, as the reader sees it now. */
export const deliverTurn = (registry: AtomRegistry.AtomRegistry, workspaceId: string, turn: Turn.View) =>
  registry.update(deliveredTurnsOf(workspaceId), ({ count, turns }) => ({
    count: count + 1,
    turns: new Map(turns).set(turn.id, { turn, delivery: count + 1 })
  }))
/** Oldest first, as the workspace's active turns are listed. */
const byCreated = (left: Turn.View, right: Turn.View) =>
  DateTime.toEpochMillis(left.createdAt) - DateTime.toEpochMillis(right.createdAt) ||
  left.acceptedThroughSequence - right.acceptedThroughSequence ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
/**
 * The active turns as they show with the turns the change feed delivered after the read, which
 * covered `covered` deliveries: each delivered turn in place of the one read, those that started
 * since added, and those that ended dropped, oldest first.
 */
export const withDeliveredTurns = (
  active: ReadonlyArray<Turn.View>,
  covered: number,
  delivered: DeliveredTurns
): ReadonlyArray<Turn.View> => {
  const turns = new Map(active.map((turn) => [turn.id as string, turn]))
  for (const [id, { turn, delivery }] of delivered.turns) if (delivery > covered) turns.set(id, turn)
  return [...turns.values()].filter((turn) => Turn.active(turn.status)).toSorted(byCreated)
}
/** A turn as it shows with what the change feed delivered of it after the read that covered `covered`. */
export const turnWith = (turn: Turn.View, covered: number, delivered: DeliveredTurns): Turn.View => {
  const later = delivered.turns.get(turn.id)
  return later !== undefined && later.delivery > covered ? later.turn : turn
}

const activeTurnsOf = perClient((client: ApiClient, workspaceId: string) => {
  const delivered = deliveredTurnsOf(workspaceId)
  const read = client.runtime
    .atom(
      Effect.fnUntraced(function* (get) {
        const api = yield* client
        // Whatever the change feed delivers from now on may be missing from what this reads.
        const covered = get.once(delivered).count
        return { active: yield* api.turns.listActive({ query: { limit: 100 } }), covered }
      })
    )
    .pipe(Atom.withReactivity([workspaceKey(workspaceId, "active-turns")]))
  return Atom.readable(
    (get) => AsyncResult.map(get(read), ({ active, covered }) => withDeliveredTurns(active, covered, get(delivered))),
    (refresh) => refresh(read)
  )
})
/**
 * The workspace's active turns in threads the reader may open, for marks where agents are at work,
 * with what the change feed delivered. Undefined for an invalid workspace ID.
 */
export const activeTurnsRead = (client: ApiClient, workspaceId: string) =>
  Option.isSome(Schema.decodeOption(WorkspaceId.WorkspaceId)(workspaceId))
    ? activeTurnsOf(client, workspaceId)
    : undefined

const turnOf = perClient((client: ApiClient, key: string) => {
  const [workspaceId = "", turnId = ""] = key.split("\u0000")
  const delivered = deliveredTurnsOf(workspaceId)
  const read = client.runtime
    .atom(
      Effect.fnUntraced(function* (get) {
        const api = yield* client
        const covered = get.once(delivered).count
        return { turn: yield* api.turns.get({ params: { turnId: TurnId.TurnId.make(turnId) } }), covered }
      })
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "turns", turnId)))
  return Atom.readable(
    (get) => AsyncResult.map(get(read), ({ turn, covered }) => turnWith(turn, covered, get(delivered))),
    (refresh) => refresh(read)
  )
})
/**
 * A turn as the reader sees it, following its facts: where it stands and what they may do with it,
 * with what the change feed delivered. Its log is followed apart, by `turnLogFeed`. Undefined for
 * invalid IDs.
 */
export const turnRead = (client: ApiClient, workspaceId: string, turnId: string) =>
  Option.isSome(Schema.decodeOption(WorkspaceId.WorkspaceId)(workspaceId)) &&
  Option.isSome(Schema.decodeOption(TurnId.TurnId)(turnId))
    ? turnOf(client, `${workspaceId}\u0000${turnId}`)
    : undefined

/** A stop or retry of one turn. */
export interface TurnCommand {
  readonly kind: "stop" | "retry"
  readonly turnId: string
}
/** Stop or retry a turn, answering with the turn it acted on, or for a retry, the new turn. */
export const controlTurn = (api: WorkspaceApi, input: TurnCommand) =>
  Effect.gen(function* () {
    const params = { turnId: yield* command(TurnId.TurnId)(input.turnId) }
    return input.kind === "stop" ? yield* api.turns.cancel({ params }) : yield* api.turns.retry({ params })
  })

const refusals = {
  active: "still-running",
  completed: "replied",
  superseded: "superseded",
  departed: "departed"
} as const satisfies Record<Turn.NotRetryableReason, TurnProblem>

/**
 * What a turn command was refused for, if the host refused it: the turn already finished, so there
 * is nothing to stop, or it cannot run again because it is still active, it replied, a later turn
 * followed it, or its agent no longer takes part in the thread.
 */
export const turnRefusal = (cause: Cause.Cause<unknown>): TurnProblem | undefined => {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue
    if (!Schema.is(ApiErrors.Conflict)(reason.error)) continue
    const refusal = reason.error.reason
    if (CoreError.ConflictReason.isAnyOf(["TurnNotActive"])(refusal)) return "finished"
    if (CoreError.ConflictReason.isAnyOf(["NotRetryable"])(refusal)) return refusals[refusal.reason]
  }
  return undefined
}

/**
 * A turn's log as following it holds it: its items, the response being written, whether the turn
 * ended with every item delivered, and how following it stands.
 */
export interface TurnLogFeed {
  /** The log's items, oldest first, once following it opened. */
  readonly items: ReadonlyArray<Turn.LogItem> | undefined
  /** The response being written, by part, as its drafts carried it. */
  readonly drafts: Drafts
  /** The turn ended and every item arrived: nothing more follows. */
  readonly ended: boolean
  /**
   * Opening the first subscription, following, reconnecting after a drop, or stopped: the turn is
   * gone to the reader, they may no longer read its thread, or their credentials were rejected.
   */
  readonly connection: "connecting" | "live" | "reconnecting" | "gone" | "denied" | "unauthorized"
  /** When the log last arrived. */
  readonly updatedAt: Date | undefined
}

const initial: TurnLogFeed = {
  items: undefined,
  drafts: new Map(),
  ended: false,
  connection: "connecting",
  updatedAt: undefined
}

/** The reader can no longer see the turn: it is not theirs to read, or they left the workspace. */
const gone = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) &&
      (Schema.is(ApiErrors.NotFound)(reason.error) ||
        (Schema.is(ApiErrors.Denied)(reason.error) &&
          CoreError.DeniedReason.isAnyOf(["NotMember"])(reason.error.reason)))
  )

/** The reader is in the turn's thread's group, but may no longer read the thread. */
const denied = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) &&
      Schema.is(ApiErrors.Denied)(reason.error) &&
      CoreError.DeniedReason.isAnyOf(["NotGranted"])(reason.error.reason)
  )

/** The items with each change put in its place. */
const changed = (
  items: ReadonlyArray<Turn.LogItem>,
  changes: ReadonlyArray<Turn.LogChange>
): ReadonlyArray<Turn.LogItem> => {
  const next = [...items]
  for (const { index, item } of changes) next[index] = item
  return next
}

/**
 * Follow one turn's log, emitting what it holds as it changes. Each subscription opens with the
 * items as they stand, so reconnecting after a drop replaces them; drafts carry on, and a part
 * that missed text while disconnected waits for its block. Following stops once the turn ended
 * and its last items arrived, or when the turn is gone to the reader.
 */
const run = Effect.fnUntraced(function* (
  client: ApiClient,
  turnId: string,
  states: Queue.Queue<TurnLogFeed, Cause.Done>
) {
  const api = yield* client
  let state = initial
  const set = (next: Partial<TurnLogFeed>) => {
    state = { ...state, ...next }
    Queue.offerUnsafe(states, state)
  }
  const turn = Schema.decodeOption(TurnId.TurnId)(turnId)
  if (Option.isNone(turn)) return set({ connection: "gone" })
  const params = { turnId: turn.value }
  const wake = yield* Queue.sliding<void>(1)
  yield* Effect.acquireRelease(
    Effect.sync(() => watchWake(window, () => Queue.offerUnsafe(wake, undefined))),
    (stop) => Effect.sync(stop)
  )
  let attempt = 0
  const receive = (message: Turn.LogMessage) =>
    Effect.sync(() => {
      Turn.LogMessage.match(message, {
        Opened: (message) => {
          attempt = 0
          return set({ items: message.items, connection: "live", updatedAt: new Date() })
        },
        Changed: (message) =>
          set({
            items: changed(state.items ?? [], message.changes),
            updatedAt: new Date()
          }),
        Drafted: (message) => set({ drafts: drafted(state.drafts, { ...message, turnId }) }),
        Ended: () => set({ ended: true, drafts: new Map() })
      })
    })
  while (true) {
    yield* Queue.clear(wake)
    const following = api.turns.watchLog({ params }).pipe(Effect.flatMap(Stream.runForEach(receive)))
    const outcome = yield* Effect.raceFirst(Effect.exit(following), Queue.take(wake).pipe(Effect.as("wake" as const)))
    if (state.ended) return
    // The page woke while following: the connection may be dead without knowing it.
    if (outcome === "wake") continue
    const cause = Exit.isFailure(outcome) ? outcome.cause : Cause.empty
    if (isUnauthorized(cause)) return set({ connection: "unauthorized" })
    if (gone(cause)) return set({ connection: "gone" })
    if (denied(cause)) return set({ connection: "denied" })
    attempt += 1
    set({ connection: "reconnecting" })
    yield* Effect.raceFirst(Effect.flatMap(retryDelay(attempt, cause), Effect.sleep), Queue.take(wake))
  }
})

const makeFamily = (client: ApiClient) =>
  Atom.family((turnId: string) =>
    client.runtime.atom(
      Stream.callback((states: Queue.Queue<TurnLogFeed, Cause.Done>) => run(client, turnId, states), {
        bufferSize: 1,
        strategy: "sliding"
      })
    )
  )
const families = new WeakMap<ApiClient, ReturnType<typeof makeFamily>>()
/** Follow one turn's log through its workspace's client, while any consumer is mounted. */
export const turnLogFeed = (client: ApiClient, turnId: string) => {
  let family = families.get(client)
  if (!family) {
    family = makeFamily(client)
    families.set(client, family)
  }
  return family(turnId)
}
