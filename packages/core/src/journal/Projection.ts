/**
 * A projection keeps a read model from a log's facts: a named, versioned definition whose
 * handlers, one for each fact version it subscribes to, write its domain store. A live projection
 * runs inside each publication, in the publishing commit; one that is not live is rebuilt from
 * the log by its `Runner`, in checkpointed batches, until it has caught up and goes live. Domains
 * declare theirs with `make` and `.on(...)` in a `*Projection` module, and `Journal.layer`
 * registers them. Handlers must be safe to replay: they perform no external actions and append
 * nothing.
 *
 * @since 0.1.0
 */

import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Checkpoint from "./Checkpoint.ts"
import * as Entry from "./Entry.ts"
import * as Event from "./Event.ts"
import type * as Fact from "./Fact.ts"
import type * as Log from "./Log.ts"
import * as Store from "./Store.ts"
import type * as StoreError from "./StoreError.ts"
import * as Transaction from "./Transaction.ts"

/**
 * The decoded event supplied to a handler for this fact.
 *
 * @category models
 * @since 0.1.0
 */
export type Input<F extends Fact.Definition> = Event.Type<F>

/**
 * One fact version a projection handles: its definition, with the decoder and handler that
 * `Definition.on` built for it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Subscription<E, R> {
  /** The fact, at the version this subscription handles. */
  readonly fact: Fact.Definition
  /** Validates a decoded event and applies it within the current transaction. */
  readonly apply: (event: unknown) => Effect.Effect<void, E | Schema.SchemaError, R | Store.Transaction>
  /** Decode this fact version once before dispatching to its handlers. */
  readonly decode: (
    entry: Log.Entry<Event.Envelope>
  ) => Effect.Effect<unknown, Schema.SchemaError | Event.FactMismatch, R>
}

/**
 * A versioned read-model definition with subscriptions in registration order.
 *
 * @category models
 * @since 0.1.0
 */
export interface Definition<Name extends string = string, Version extends number = number, E = never, R = never> {
  readonly name: Name
  /**
   * Its read model's interpretation, apart from fact versions. A new version rebuilds from the
   * log's beginning, with progress of its own, into a store the domain and host supply.
   */
  readonly version: Version
  readonly subscriptions: ReadonlyArray<Subscription<E, R>>
  /**
   * Adds `handle` for `fact` at its version and returns a new definition. Register every
   * historical version of a fact the projection needs; an unregistered version of a subscribed
   * name fails with `UnsupportedFactVersion`.
   */
  readonly on: <F extends Fact.Definition, E2, R2>(
    fact: F,
    handle: (event: Input<NoInfer<F>>) => Effect.Effect<void, E2, R2>
  ) => Definition<Name, Version, E | E2, R | R2 | F["payload"]["DecodingServices"]>
}

const makeDefinition = <Name extends string, Version extends number, E, R>(
  name: Name,
  version: Version,
  subscriptions: ReadonlyArray<Subscription<E, R>>
): Definition<Name, Version, E, R> => ({
  name,
  version,
  subscriptions,
  on<F extends Fact.Definition, E2, R2>(fact: F, handle: (event: Input<NoInfer<F>>) => Effect.Effect<void, E2, R2>) {
    const validate = Schema.decodeUnknownEffect(
      Schema.toType(Event.makeSchema<F["name"], F["version"], F["payload"]>(fact))
    )
    const apply = Effect.fn(`${name}.project.${fact.name}`)(function* (event: unknown) {
      yield* Store.Transaction
      const input = yield* validate(event)
      yield* Transaction.withoutAppends(handle(input), `Projection ${name} cannot publish new log entries`)
    })

    const decode = Effect.fn(`${name}.decode.${fact.name}`)(function* (entry: Log.Entry<Event.Envelope>) {
      return yield* Transaction.withoutAppends(
        Event.decode(fact, entry),
        `Projection ${name} cannot publish new log entries`
      )
    })

    return makeDefinition<Name, Version, E | E2, R | R2 | F["payload"]["DecodingServices"]>(name, version, [
      ...subscriptions,
      { fact, apply, decode }
    ])
  }
})

/**
 * Starts a projection definition. Each on call returns a new definition.
 * Handlers update transaction-participating domain stores using event data;
 * they must remain safe to replay without external actions or new publications.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <const Name extends string, const Version extends number>(
  name: Name,
  options: { readonly version: Version }
): Definition<Name, Version> => makeDefinition<Name, Version, never, never>(name, options.version, [])

/**
 * A registered projection is not live on the journal's log, so a commit that published would
 * leave it behind; the publication rolls back. `journal.replay` rebuilds it, and then the command
 * can be retried.
 *
 * @category errors
 * @since 0.1.0
 */
export class Behind extends Schema.TaggedError<Behind>()("Projection.Behind", {
  key: Checkpoint.Key
}) {}

/**
 * A version live on the log that this journal does not run, so its commits would skip it.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unregistered extends Schema.TaggedError<Unregistered>()("Projection.Unregistered", {
  key: Checkpoint.Key
}) {}

/**
 * A projection's progress cannot be followed: its checkpoint names no entry of the log or splits a
 * committed batch, or the log returned an empty batch or lacks its head batch.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidCheckpoint extends Schema.TaggedError<InvalidCheckpoint>()("Projection.InvalidCheckpoint", {
  key: Checkpoint.Key,
  message: Schema.String
}) {}

/**
 * A projection subscribes to a fact's name, but not at the version an entry records.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnsupportedFactVersion extends Schema.TaggedError<UnsupportedFactVersion>()(
  "Projection.UnsupportedFactVersion",
  { key: Checkpoint.Key, name: Schema.String, version: Schema.Finite }
) {}

/**
 * A journal was given the same projection version twice.
 *
 * @category errors
 * @since 0.1.0
 */
export class Duplicate extends Schema.TaggedError<Duplicate>()("Projection.Duplicate", {
  key: Checkpoint.Key
}) {}

/**
 * An expected decoder or handler failure, preserving its original error in `cause`, with the
 * projection, the entry it failed at, and the phase, `decode` or `apply`.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("Projection.Failure", {
  key: Checkpoint.Key,
  cursor: Checkpoint.Cursor,
  phase: Schema.Literals(["decode", "apply"]),
  cause: Schema.Defect()
}) {}

/**
 * What applying, rebuilding, or registering a projection can fail with, including the commit's
 * own errors.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | Transaction.Error
  | Schema.SchemaError
  | Event.FactMismatch
  | Behind
  | Unregistered
  | InvalidCheckpoint
  | UnsupportedFactVersion
  | Failure

/**
 * Whether a live version is this key's projection at this key's version.
 *
 * @category utils
 * @since 0.1.0
 */
export const isVersion = (key: Checkpoint.Key) => (live: Checkpoint.LiveVersion) =>
  live.name === key.name && live.version === key.version

/**
 * Runs one projection on one log: applies each new event in the publishing commit while the
 * projection is live, and rebuilds it from the log while it is not. `makeRunner` builds one, and
 * `Journal` builds one for each registered projection.
 *
 * @category models
 * @since 0.1.0
 */
export interface Runner {
  /** The log, name, and version its progress is kept under. */
  readonly key: Checkpoint.Key
  /** Whether this projection handles facts of this name, at any version. */
  readonly subscribes: (name: string) => boolean
  /** Rebuild progress: the last applied entry. None before a rebuild starts. */
  readonly checkpoint: Effect.Effect<Option.Option<Checkpoint.Cursor>, StoreError.StoreError | Schema.SchemaError>
  /**
   * Rebuild one step: apply the next source batch and checkpoint it in one transaction. When
   * no batch is pending, mark the projection live in that transaction instead and return None;
   * a projection that is already live returns None without applying anything.
   */
  readonly step: Effect.Effect<Option.Option<Checkpoint.Cursor>, Error>
  /** Rebuild until live. Each step commits independently unless already in a commit. */
  readonly replay: Effect.Effect<void, Error>
  /**
   * Live path: apply a newly appended, decoded event of the current commit. Records no
   * progress; the journal applies only projections that are live.
   */
  readonly apply: (entry: Log.Entry<Event.Envelope>, event: unknown) => Effect.Effect<void, Error, Store.Transaction>
}

const toCursor = (entry: Log.Entry<Event.Envelope>): Checkpoint.Cursor => ({
  position: entry.position,
  commitId: entry.commitId,
  index: entry.index,
  entryId: entry.id
})

/**
 * Replace a log's live versions in the current transaction. A version leaving the set was live,
 * so it applied every commit through the log's head: its progress moves to the head's last
 * entry, and rebuilding it later applies only the commits it missed, never earlier ones again.
 *
 * @category utils
 * @since 0.1.0
 */
export const replaceLive = Effect.fnUntraced(function* (
  checkpoint: Checkpoint.Checkpoint["Service"],
  log: Log.Reader<typeof Event.Envelope>,
  current: ReadonlyArray<Checkpoint.LiveVersion>,
  next: ReadonlyArray<Checkpoint.LiveVersion>
) {
  const leaving = current.filter(
    (version) => !next.some((kept) => kept.name === version.name && kept.version === version.version)
  )
  const head = leaving.length === 0 ? Option.none() : yield* log.head
  if (Option.isSome(head)) {
    // Positions only advance, so the first batch after the position before the head is its batch.
    const [batch] = yield* log.read(
      head.value === 0 ? { limit: 1 } : { after: Entry.Position.make(head.value - 1), limit: 1 }
    )
    const last = batch?.entries.at(-1)
    for (const version of leaving) {
      const key = { logId: log.id, name: version.name, version: version.version }
      if (batch?.position !== head.value || last === undefined)
        return yield* new InvalidCheckpoint({ key, message: "The log's head batch is missing" })
      yield* checkpoint.set(key, toCursor(last))
    }
  }
  yield* checkpoint.setLive(log.id, next)
})

/**
 * Construct a runner from a definition, its dependencies, and its host-owned checkpoint store.
 * Invocation context takes precedence, preserving the current transaction and
 * scope. A new version needs a fresh target or a domain-managed migration.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeRunner = Effect.fnUntraced(function* <E, R>(options: {
  readonly definition: Definition<string, number, E, R>
  readonly log: Log.Reader<typeof Event.Envelope>
}) {
  const checkpoint = yield* Checkpoint.Checkpoint
  const transaction = yield* Transaction.Transaction
  const services = yield* Effect.context<Transaction.Remaining<R>>()
  const { definition, log } = options
  const key = yield* Schema.decodeEffect(Checkpoint.Key)({
    logId: log.id,
    name: definition.name,
    version: definition.version
  })
  const byName = new Map<string, Map<number, Array<Subscription<E, R>>>>()
  for (const subscription of definition.subscriptions) {
    const { fact } = subscription
    let versions = byName.get(fact.name)
    if (versions === undefined) {
      versions = new Map()
      byName.set(fact.name, versions)
    }
    const handlers = versions.get(fact.version) ?? []
    if (handlers.some((handler) => handler.fact.payload !== fact.payload)) {
      return yield* new Event.FactMismatch({ name: fact.name, version: fact.version })
    }
    versions.set(fact.version, [...handlers, subscription])
  }

  const progress = checkpoint.get(key).pipe(Effect.flatMap(Schema.decodeEffect(Schema.Option(Checkpoint.Cursor))))
  const readNextEntries = Effect.fnUntraced(function* (previous: Option.Option<Checkpoint.Cursor>) {
    const storeTransaction = yield* Store.Transaction
    if (Option.isSome(previous)) {
      const cursor = previous.value
      const batch = yield* log.get(cursor.commitId)
      if (
        Option.isNone(batch) ||
        batch.value.position !== cursor.position ||
        batch.value.entries[cursor.index]?.id !== cursor.entryId
      ) {
        return yield* new InvalidCheckpoint({
          key,
          message: "Checkpoint does not identify a source entry"
        })
      }
      const remaining = batch.value.entries.slice(cursor.index + 1)
      if (remaining.length > 0) {
        if (batch.value.commit.id !== storeTransaction.id) {
          return yield* new InvalidCheckpoint({
            key,
            message: "Checkpoint splits a committed source batch"
          })
        }
        return Option.some(remaining)
      }
    }
    const batches = yield* log.read(
      Option.isSome(previous) ? { after: previous.value.position, limit: 1 } : { limit: 1 }
    )
    return Option.map(Array.head(batches), (batch) => batch.entries)
  })
  const handlersFor = Effect.fnUntraced(function* (entry: Log.Entry<Event.Envelope>) {
    const versions = byName.get(entry.payload.name)
    if (versions === undefined) return []
    const handlers = versions.get(entry.payload.version)
    if (handlers === undefined) {
      return yield* new UnsupportedFactVersion({
        key,
        name: entry.payload.name,
        version: entry.payload.version
      })
    }
    return handlers
  })

  // Supply static requirements only after entering the operation's transaction.
  // The invocation's context must win over any context present during binding.
  const provideServices = Effect.fnUntraced(function* <A, E2>(program: Effect.Effect<A, E2, R | Store.Transaction>) {
    const storeTransaction = yield* Store.Transaction
    return yield* program.pipe(
      Effect.scoped,
      Effect.provideService(Store.Transaction, storeTransaction),
      Effect.updateContext((current: Context.Context<never>) => Context.merge(services, current))
    )
  })
  const toFailure = (entry: Log.Entry<Event.Envelope>, phase: Failure["phase"]) => (cause: unknown) =>
    new Failure({ key, cursor: toCursor(entry), phase, cause })

  const apply = Effect.fn("Projection.apply")(function* (entry: Log.Entry<Event.Envelope>, event: unknown) {
    const storeTransaction = yield* Store.Transaction
    yield* transaction.operation(
      provideServices(
        Effect.gen(function* () {
          if (entry.logId !== log.id || entry.commitId !== storeTransaction.id)
            return yield* new Transaction.Foreign({})
          for (const handler of yield* handlersFor(entry))
            yield* handler.apply(event).pipe(Effect.mapError(toFailure(entry, "apply")))
        })
      )
    )
  })
  const step = transaction
    .operation(
      provideServices(
        Effect.gen(function* () {
          const live = yield* checkpoint.listLive(log.id)
          if (live.some(isVersion(key))) return Option.none<Checkpoint.Cursor>()
          const pending = yield* readNextEntries(yield* progress)
          if (Option.isNone(pending)) {
            // Caught up with every commit: from this one on, commits apply the projection.
            yield* replaceLive(checkpoint, log, live, [
              ...live.filter(({ name }) => name !== key.name),
              { name: key.name, version: key.version }
            ])
            return Option.none<Checkpoint.Cursor>()
          }
          for (const entry of pending.value) {
            const handlers = yield* handlersFor(entry)
            const first = Array.head(handlers)
            if (Option.isSome(first)) {
              const event = yield* first.value.decode(entry).pipe(Effect.mapError(toFailure(entry, "decode")))
              for (const handler of handlers)
                yield* handler.apply(event).pipe(Effect.mapError(toFailure(entry, "apply")))
            }
          }
          const last = Array.last(pending.value)
          if (Option.isNone(last)) {
            return yield* new InvalidCheckpoint({ key, message: "Source returned an empty batch" })
          }
          const cursor = toCursor(last.value)
          yield* checkpoint.set(key, cursor)
          return Option.some(cursor)
        })
      )
    )
    .pipe(Effect.withSpan("Projection.step"))
  const replay = Effect.gen(function* () {
    while (Option.isSome(yield* step)) {
      // Each step commits its batch and progress; the last marks the projection live.
    }
  }).pipe(Effect.withSpan("Projection.replay"))

  const runner: Runner = {
    key,
    subscribes: (name) => byName.has(name),
    checkpoint: progress,
    step,
    replay,
    apply
  }
  return runner
})
