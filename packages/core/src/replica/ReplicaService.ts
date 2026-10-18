/**
 * A member's replica as the workspace changes: the copy of what they may see that their browser
 * keeps, and how their own requests ended. Their stream starts after the last position their
 * replica holds, or with a reset and everything they may see, and then each commit's changes follow
 * as it lands, read once for everyone following the workspace by `ReplicaCommits`.
 *
 * Within a commit, what changed reaches them when they may see it as the workspace stands after it,
 * so nothing reaches them after they lost access to it. What changes their access changes the
 * replica too: joining a group sends what it holds, leaving one drops it and sends again what of it
 * they still see, and any change to their grants resets the replica. Their stream ends once they are
 * no longer a member.
 *
 * @since 0.1.0
 */

import * as Entry from "@amends-dev/log/Entry"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as AssignmentFacts from "../authorization/AssignmentFacts.ts"
import * as Authorization from "../authorization/Authorization.ts"
import * as RoleFacts from "../authorization/RoleFacts.ts"
import * as CoreError from "../error/CoreError.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts"
import * as Actor from "../identity/Actor.ts"
import * as Identity from "../identity/Identity.ts"
import * as Event from "../journal/Event.ts"
import * as Operation from "../operation/Operation.ts"
import * as RequestFacts from "../request/RequestFacts.ts"
import * as MemberFacts from "../workspace/MemberFacts.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceFacts from "../workspace/WorkspaceFacts.ts"
import * as ReplicaChange from "./ReplicaChange.ts"
import * as ReplicaCommits from "./ReplicaCommits.ts"
import * as ReplicaQuery from "./ReplicaQuery.ts"
import * as ReplicaRecord from "./ReplicaRecord.ts"
import * as ReplicaVisibility from "./ReplicaVisibility.ts"

/**
 * What following a replica can fail with as it starts: someone who is not an active person in the
 * workspace, and storage.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * The replica operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class ReplicaService extends Context.Service<
  ReplicaService,
  {
    /**
     * The acting person's replica as it changes, a batch for each commit after `after`, the
     * position of the last batch it holds, then for each commit as it lands. Without a position,
     * or with one past what the journal holds, it starts with a reset and everything they may see.
     * The stream fails with `Denied` once they are no longer a member, and with `Unavailable` when
     * following stops short, to be followed again from the last position held.
     */
    readonly changes: (
      after: Option.Option<Entry.Position>
    ) => Effect.Effect<
      Stream.Stream<ReplicaChange.Batch, CoreError.Denied | CoreError.Unavailable>,
      Error,
      Actor.Actor | Scope.Scope
    >
  }
>()("@amends-dev/core/replica/ReplicaService") {}

/** How many records one batch of a snapshot carries. */
const snapshotBatch = 500

/**
 * What a commit changed about one member's access, and how their own requests ended in it.
 *
 * @category models
 * @since 0.1.0
 */
export interface AccessChanges {
  /** They are no longer a member of the workspace. */
  readonly removed: boolean
  /** Their grants may have changed: an assignment of theirs, a role's permissions, or the workspace's owner. */
  readonly grantsChanged: boolean
  readonly joined: ReadonlyArray<GroupId.GroupId>
  readonly left: ReadonlyArray<GroupId.GroupId>
  readonly outcomes: ReadonlyArray<ReplicaChange.ReplicaChange>
}

/** The facts that change someone's grants, whosever they are. */
const grantFacts = new Set<string>([
  RoleFacts.PermissionsChanged.name,
  RoleFacts.BuiltinsRevised.name,
  WorkspaceFacts.OwnershipTransferred.name
])

/**
 * Builds the replica operations over the replica's reads and its shared reader.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const replicaQuery = yield* ReplicaQuery.ReplicaQuery
  const replicaCommits = yield* ReplicaCommits.ReplicaCommits

  /** What `entries` change about `memberId`'s access, and how their requests ended there. */
  const readAccessChanges = Effect.fnUntraced(function* (
    entries: ReplicaCommits.Commit["entries"],
    memberId: MemberId.MemberId
  ) {
    let removed = false
    let grantsChanged = false
    const joined: Array<GroupId.GroupId> = []
    const left: Array<GroupId.GroupId> = []
    const outcomes: Array<ReplicaChange.ReplicaChange> = []
    const { cases } = ReplicaChange.ReplicaChange
    for (const entry of entries) {
      const name = entry.payload.name
      if (grantFacts.has(name)) grantsChanged = true
      else if (name === MemberFacts.Removed.name)
        removed ||= (yield* Event.decode(MemberFacts.Removed, entry)).payload.memberId === memberId
      else if (name === AssignmentFacts.Created.name)
        grantsChanged ||= (yield* Event.decode(AssignmentFacts.Created, entry)).payload.memberId === memberId
      else if (name === AssignmentFacts.Revoked.name)
        grantsChanged ||= (yield* Event.decode(AssignmentFacts.Revoked, entry)).payload.memberId === memberId
      else if (name === GroupMembershipFacts.Added.name) {
        const { payload } = yield* Event.decode(GroupMembershipFacts.Added, entry)
        if (payload.memberId === memberId) joined.push(payload.groupId)
      } else if (name === GroupMembershipFacts.Removed.name) {
        const { payload } = yield* Event.decode(GroupMembershipFacts.Removed, entry)
        if (payload.memberId === memberId) left.push(payload.groupId)
      } else if (name === RequestFacts.Completed.name) {
        const { payload } = yield* Event.decode(RequestFacts.Completed, entry)
        if (payload.memberId === memberId) outcomes.push(cases.Completed.make({ key: payload.key }))
      } else if (name === RequestFacts.Rejected.name) {
        const { payload } = yield* Event.decode(RequestFacts.Rejected, entry)
        if (payload.memberId === memberId)
          outcomes.push(cases.Rejected.make({ key: payload.key, error: payload.error }))
      }
    }
    return { removed, grantsChanged, joined, left, outcomes } satisfies AccessChanges
  })

  /** `records` as changes, in batches of at most `snapshotBatch`, all at `position`. */
  const batchesOf = (
    position: Entry.Position,
    records: Stream.Stream<ReplicaRecord.ReplicaRecord, ReplicaQuery.Error>,
    first: ReadonlyArray<ReplicaChange.ReplicaChange> = []
  ) =>
    Stream.concat(
      Stream.make({ position, changes: first }),
      records.pipe(
        Stream.map((record) => ReplicaChange.ReplicaChange.cases.Changed.make({ record })),
        Stream.grouped(snapshotBatch),
        Stream.map((changes): ReplicaChange.Batch => ({ position, changes }))
      )
    ).pipe(Stream.filter((batch) => batch.changes.length > 0))

  /** Everything `memberId` may see now, after a reset, at `position`. */
  const reset = (memberId: MemberId.MemberId, position: Entry.Position) =>
    Stream.unwrap(
      Effect.map(replicaQuery.viewerOf(memberId), (viewer) =>
        batchesOf(position, replicaQuery.snapshot(viewer), [ReplicaChange.ReplicaChange.cases.Reset.make({})])
      )
    )

  /** The batches one commit gives `memberId`'s replica. */
  const batchesFor = (memberId: MemberId.MemberId) => (commit: ReplicaCommits.Commit) =>
    Stream.unwrap(
      Effect.gen(function* (): Effect.fn.Return<
        Stream.Stream<ReplicaChange.Batch, CoreError.Denied | ReplicaQuery.Error>,
        ReplicaQuery.Error
      > {
        const access = yield* readAccessChanges(commit.entries, memberId)
        if (access.removed)
          return Stream.fail(
            new CoreError.Denied({ reason: new CoreError.InvalidActor({ memberId, reason: "membership-removed" }) })
          )
        if (access.grantsChanged) return reset(memberId, commit.position)
        // Read after the commit's records, so nothing reaches them that they could no longer see.
        const viewer = yield* replicaQuery.viewerOf(memberId)
        const { cases } = ReplicaChange.ReplicaChange
        const changes: Array<ReplicaChange.ReplicaChange> = [
          ...access.left.map((id) => cases.Dropped.make({ key: ReplicaRecord.Key.cases.Group.make({ id }) })),
          ...commit.records
            .filter((record) => ReplicaVisibility.canSee(viewer, commit.places, record))
            .map((record) => cases.Changed.make({ record })),
          ...access.outcomes
        ]
        // What they still see of a group they left, such as a public team, and all of one they joined.
        const groups = [...access.left, ...access.joined]
        return batchesOf(
          commit.position,
          Stream.fromIterable(groups).pipe(Stream.flatMap((groupId) => replicaQuery.snapshotGroup(viewer, groupId))),
          changes
        )
      })
    )

  const logInterrupted = () => new CoreError.Unavailable({ reason: new CoreError.LogInterrupted() })
  const isDenied = Schema.is(CoreError.Denied)

  const changes = Effect.fn("ReplicaService.changes")(function* (after: Option.Option<Entry.Position>) {
    yield* authorization.require([])
    // Following outlasts the request that opened it, so it names the member.
    const actor = yield* Actor.Actor
    if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
      return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() })
    const memberId = actor.memberId
    const live = yield* replicaCommits.follow
    const through = live.after
    const startsOver = Option.isNone(after) || Option.isNone(through) || after.value > through.value
    const caughtUp = startsOver
      ? reset(
          memberId,
          Option.getOrElse(through, () => Entry.Position.make(0))
        )
      : replicaCommits.read(after, through).pipe(Stream.flatMap(batchesFor(memberId)))
    // Storage that stops following leaves the replica to follow again from where it stands.
    return Stream.concat(caughtUp, live.commits.pipe(Stream.flatMap(batchesFor(memberId)))).pipe(
      Stream.mapError((error) => (isDenied(error) ? error : logInterrupted()))
    )
  }, Operation.report)

  return ReplicaService.of({ changes })
})

/**
 * Provide the replica operations over authorization, the replica's reads, and its shared reader.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReplicaService, make)
