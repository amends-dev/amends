import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { Presence } from "@amends-dev/core/presence"
import { BunHttpServer } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Exit, Layer, Queue, Redacted, Scope, Stream } from "effect"
import * as DevelopmentAuthentication from "../src/DevelopmentAuthentication.ts"
import * as LocalHost from "../src/LocalHost.ts"
import * as LocalServer from "../src/LocalServer.ts"
import { client } from "./client.ts"
import { setup } from "./database.ts"

const alice = Identity.HumanId.make("alice")
/** The real routes, gateway, presence relay, and PostgreSQL storage behind a Bun test server. */
const server = (url: string) =>
  LocalServer.serve(
    LocalHost.layer(Redacted.make(url)),
    DevelopmentAuthentication.layer(() => Effect.void),
    { disableLogger: true, disableListenLog: true }
  ).pipe(Layer.provideMerge(BunHttpServer.layerTest))

/** The first of what `seen` holds, from now on, that `holds` accepts, within ten seconds. */
const untilSeen = (
  seen: Queue.Queue<ReadonlyArray<Presence.Present>>,
  holds: (present: ReadonlyArray<Presence.Present>) => boolean
) => {
  const take: Effect.Effect<ReadonlyArray<Presence.Present>> = Effect.filterOrElse(Queue.take(seen), holds, () => take)
  return take.pipe(Effect.timeout("10 seconds"))
}

const { available, withDatabase } = setup()
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("a member following presence over HTTP sees who has the workspace open, who types, and who leaves", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const workspace = yield* (yield* client(alice)).workspaces.create({
          headers: {},
          payload: { name: "Studio", memberName: "alice" }
        })
        const asAlice = yield* client(alice, workspace.id)
        const invitation = yield* asAlice.invitations.issue({
          headers: {},
          payload: {
            email: "bob@example.com",
            expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
            roleId: BuiltinRoles.MemberId
          }
        })
        const bob = yield* (yield* client(invitation.details.recipientId)).workspaces.acceptInvitation({
          params: { workspaceId: workspace.id, invitationId: invitation.details.id },
          payload: { name: "bob" }
        })
        const asBob = yield* client(invitation.details.recipientId, workspace.id)
        const started = yield* asAlice.threads.start({
          params: { groupId: Group.GeneralId },
          headers: {},
          payload: { text: "Plans", mentions: [] }
        })

        /** Follow presence as `follower` until `scope` closes, into a queue of what they see. */
        const follow = Effect.fnUntraced(function* (follower: typeof asAlice, scope: Scope.Scope) {
          const seen = yield* Queue.unbounded<ReadonlyArray<Presence.Present>>()
          yield* Stream.unwrap(follower.presence.watch()).pipe(
            Stream.runForEach((present) => Queue.offer(seen, present)),
            Effect.forkIn(scope)
          )
          return seen
        })
        const members = (present: ReadonlyArray<Presence.Present>) => present.map(({ memberId }) => memberId).toSorted()

        const alicesScope = yield* Scope.make()
        const aliceSees = yield* follow(asAlice, alicesScope)
        yield* untilSeen(aliceSees, (present) => members(present).includes(workspace.ownerMemberId))
        const bobsScope = yield* Scope.make()
        yield* follow(asBob, bobsScope)
        yield* untilSeen(aliceSees, (present) => members(present).length === 2)

        yield* asBob.presence.type({ payload: { threadId: started.thread.id } })
        const typing = yield* untilSeen(aliceSees, (present) => present.some(({ typingIn }) => typingIn !== null))
        expect(typing).toContainEqual({ memberId: bob.id, typingIn: started.thread.id })
        yield* asBob.presence.type({ payload: { threadId: null } })
        yield* untilSeen(aliceSees, (present) => present.every(({ typingIn }) => typingIn === null))

        // Bob closes the workspace: alice sees him go.
        yield* Scope.close(bobsScope, Exit.void)
        yield* untilSeen(aliceSees, (present) => members(present).length === 1)
        yield* Scope.close(alicesScope, Exit.void)
      }).pipe(Effect.scoped, Effect.provide(server(url)))
    )
  )
})
