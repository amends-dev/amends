import { describe, expect, it } from "@effect/vitest"
import { Crypto, Effect } from "effect"
import * as Group from "../src/group/Group.ts"
import * as GroupId from "../src/group/GroupId.ts"
import * as GroupMembership from "../src/group/GroupMembership.ts"
import * as Actor from "../src/identity/Actor.ts"
import * as Identity from "../src/identity/Identity.ts"
import * as Request from "../src/request/Request.ts"
import * as Thread from "../src/thread/Thread.ts"
import * as ThreadMessage from "../src/thread/ThreadMessage.ts"
import * as MemberId from "../src/workspace/MemberId.ts"
import * as WorkspaceId from "../src/workspace/WorkspaceId.ts"

/** The platform's SHA-256 and random bytes, as a host's cryptography gives them. */
const webCrypto = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.map(
      Effect.promise(() => crypto.subtle.digest(algorithm, new Uint8Array(data))),
      (digest) => new Uint8Array(digest)
    )
})
const workspaceId = WorkspaceId.WorkspaceId.make("workspace-one")
const actorOf = (name: string) =>
  Actor.Actor.of({
    workspaceId,
    memberId: MemberId.MemberId.make(name),
    identity: Identity.MemberReference.cases.Human.make({ id: Identity.HumanId.make(name) })
  })
const alice = actorOf("alice")
const bob = actorOf("bob")
const key = Request.Key.make("request-1")
const team = GroupId.GroupId.make("team")
/** What `program` computes as `actor`'s request `requestKey`, or as no request. */
const as = <A, E>(
  actor: Actor.Actor["Service"],
  requestKey: Request.Key | undefined,
  program: Effect.Effect<A, E, Crypto.Crypto>
) =>
  program.pipe(
    Request.withKey(requestKey),
    Effect.provideService(Actor.Actor, actor),
    Effect.provideService(Crypto.Crypto, webCrypto)
  )

describe("Request", () => {
  it.effect("names what a request creates the same each time, and something new outside one", () =>
    Effect.gen(function* () {
      expect(yield* as(alice, key, Thread.newId(team))).toBe(yield* as(alice, key, Thread.newId(team)))
      expect(yield* as(alice, undefined, Thread.newId(team))).not.toBe(yield* as(alice, undefined, Thread.newId(team)))
    })
  )

  it.effect("tells records apart by their member's request, their kind, and what tells them apart", () =>
    Effect.gen(function* () {
      const thread = yield* as(alice, key, Thread.newId(team))
      const ids = [
        thread,
        yield* as(bob, key, Thread.newId(team)),
        yield* as(alice, Request.Key.make("request-2"), Thread.newId(team)),
        yield* as(alice, key, Thread.newId(GroupId.GroupId.make("other-team"))),
        yield* as(alice, key, ThreadMessage.newId(thread)),
        yield* as(alice, key, GroupMembership.newId(team, alice.memberId)),
        yield* as(alice, key, GroupMembership.newId(team, bob.memberId))
      ]
      expect(new Set(ids).size).toBe(ids.length)
    })
  )

  it.effect("names a direct group by its members alone", () =>
    Effect.gen(function* () {
      const forward = yield* as(alice, key, Group.directId(workspaceId, [alice.memberId, bob.memberId]))
      expect(yield* as(bob, undefined, Group.directId(workspaceId, [bob.memberId, alice.memberId]))).toBe(forward)
    })
  )
})
