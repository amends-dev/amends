import { Presence, PresenceRelay } from "@amends-dev/core/presence"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Stream } from "effect"
import { PostgresPresenceRelay } from "../src/index.ts"
import { database, setup } from "./support.ts"

const { available, withDatabase } = setup()

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-one")
const otherWorkspaceId = WorkspaceId.WorkspaceId.make("workspace-two")
const memberId = MemberId.MemberId.make("member-one")

/** The relay of a process with a pool of its own over the database at `url`. */
const relayOver = (url: string) =>
  Effect.map(
    Layer.build(PostgresPresenceRelay.layer.pipe(Layer.provide(database(url)))),
    Context.get(PresenceRelay.PresenceRelay)
  )

/** The next signal `signals` gives, within five seconds. */
const next = (signals: Stream.Stream<Presence.Signal>) =>
  Stream.runHead(signals).pipe(Effect.timeout("5 seconds"), Effect.map(Option.getOrThrow))

describe.skipIf(!available)("PostgreSQL", () => {
  it.live("a presence signal one process sends reaches every process following its workspace, its own included", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const one = yield* relayOver(url)
        const two = yield* relayOver(url)
        const heardByOne = yield* one.signals(workspaceId)
        const heardByTwo = yield* two.signals(workspaceId)
        const heardElsewhere = yield* one.signals(otherWorkspaceId)
        const here = Presence.Signal.cases.Here.make({ workspaceId, memberId, connectionId: "tab-1" })
        const typing = Presence.Signal.cases.StoppedTyping.make({ workspaceId: otherWorkspaceId, memberId })
        yield* two.send(here)
        yield* two.send(typing)
        expect(yield* next(heardByOne)).toEqual(here)
        expect(yield* next(heardByTwo)).toEqual(here)
        // Another workspace's follower hears only its own.
        expect(yield* next(heardElsewhere)).toEqual(typing)
      }).pipe(Effect.scoped)
    )
  )
})
