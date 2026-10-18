/**
 * The workspace's commits as replicas read them: each commit with the records it changed, read once
 * for every member following the workspace. One reader follows the journal while anyone does, and
 * each member's stream filters what it reads by what that member may see. A stream that starts
 * later reads the commits before it joined from the journal itself.
 *
 * @since 0.1.0
 */

import type * as Entry from "@amends-dev/log/Entry"
import type * as Log from "@amends-dev/log/Log"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as PubSub from "effect/PubSub"
import * as RcRef from "effect/RcRef"
import * as Ref from "effect/Ref"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as Event from "../journal/Event.ts"
import * as Journal from "../journal/Journal.ts"
import * as ReplicaQuery from "./ReplicaQuery.ts"
import type * as ReplicaRecord from "./ReplicaRecord.ts"
import type * as ReplicaVisibility from "./ReplicaVisibility.ts"

/**
 * One commit as replicas read it: its position and entries, the records it changed as stored when
 * it was read, and the groups and threads they belong to.
 *
 * @category models
 * @since 0.1.0
 */
export interface Commit {
  readonly position: Entry.Position
  readonly entries: ReadonlyArray<Log.Entry<Event.Envelope>>
  readonly records: ReadonlyArray<ReplicaRecord.ReplicaRecord>
  readonly places: ReplicaVisibility.Places
}

/**
 * What following the workspace fails with: the replica's reads, and the journal's.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = ReplicaQuery.Error | Log.TailError

/**
 * The commits replicas read, which only core's replica operations call.
 *
 * @category services
 * @since 0.1.0
 */
export class ReplicaCommits extends Context.Service<
  ReplicaCommits,
  {
    /**
     * Every commit after the journal's head as it stands now, as each lands, for as long as the
     * scope lasts, with that head: the commits up to it are read with `read`.
     */
    readonly follow: Effect.Effect<
      { readonly after: Option.Option<Entry.Position>; readonly commits: Stream.Stream<Commit, Error> },
      Log.ReadError,
      Scope.Scope
    >
    /** The commits after `after` through `through`, read from the journal. */
    readonly read: (
      after: Option.Option<Entry.Position>,
      through: Option.Option<Entry.Position>
    ) => Stream.Stream<Commit, Error>
  }
>()("@amends-dev/core/replica/ReplicaCommits") {}

/** How many commits one read of the journal takes. */
const commitPage = 100

/**
 * Builds the reader over the journal and the replica's reads. It follows the journal while any
 * stream does, and stops when the last one ends.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const journal = yield* Journal.Journal
  const replicaQuery = yield* ReplicaQuery.ReplicaQuery

  const readCommit = Effect.fnUntraced(function* (batch: Log.Batch<Event.Envelope>) {
    const records = yield* replicaQuery.readRecords(yield* replicaQuery.keysChangedBy(batch.entries))
    return { position: batch.position, entries: batch.entries, records, places: yield* replicaQuery.placesOf(records) }
  })

  /**
   * The journal followed from its head: every commit published as it lands, after the position it
   * follows is recorded, so a stream that joins in between reads it twice rather than not at all.
   */
  const live = yield* RcRef.make({
    acquire: Effect.gen(function* () {
      const commits = yield* PubSub.unbounded<Commit>()
      const stopped = yield* Deferred.make<never, Error>()
      const head = yield* journal.log.head
      const published = yield* Ref.make(head)
      yield* journal.log
        .tail(
          Option.match(head, {
            onNone: () => ({ limit: commitPage }),
            onSome: (after) => ({ after, limit: commitPage })
          })
        )
        .pipe(
          Stream.mapEffect(readCommit),
          Stream.runForEach((commit) =>
            Ref.set(published, Option.some(commit.position)).pipe(Effect.andThen(PubSub.publish(commits, commit)))
          ),
          Effect.catchCause((cause) => Deferred.failCause(stopped, cause)),
          Effect.forkScoped
        )
      return { commits, stopped, published }
    })
  })

  const follow = Effect.gen(function* () {
    const { commits, stopped, published } = yield* RcRef.get(live)
    const subscription = yield* PubSub.subscribe(commits)
    const after = yield* Ref.get(published)
    return {
      after,
      commits: Stream.fromSubscription(subscription).pipe(
        Stream.filter((commit) => Option.isNone(after) || commit.position > after.value),
        Stream.interruptWhen(Deferred.await(stopped))
      )
    }
  })

  const read = (after: Option.Option<Entry.Position>, through: Option.Option<Entry.Position>) =>
    Option.isNone(through)
      ? Stream.empty
      : journal.log
          .stream(
            Option.match(after, {
              onNone: () => ({ limit: commitPage }),
              onSome: (position) => ({ after: position, limit: commitPage })
            })
          )
          .pipe(
            Stream.takeWhile((batch) => batch.position <= through.value),
            Stream.mapEffect(readCommit)
          )

  return ReplicaCommits.of({ follow, read })
})

/**
 * Provide the reader over the journal and the replica's reads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReplicaCommits, make)
