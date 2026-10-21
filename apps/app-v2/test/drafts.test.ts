import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { IndexedDb } from "@effect/platform-browser"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as Drafts from "../src/store/Drafts.ts"

/** Run `test` over drafts in a database of their own. */
const withDrafts = <A, E>(test: Effect.Effect<A, E, Drafts.Drafts>, name = `drafts-${crypto.randomUUID()}`) =>
  Effect.provide(test, Drafts.layer(name).pipe(Layer.provide(IndexedDb.layerWindow)))

const reply = Drafts.Place.cases.Reply.make({ threadId: ThreadId.ThreadId.make("thread-1") })
const newThread = Drafts.Place.cases.Thread.make({ groupId: GroupId.GroupId.make("general") })
const withBob = Drafts.Place.cases.Conversation.make({ memberIds: [MemberId.MemberId.make("member-2")] })
const withBobAndScout = Drafts.Place.cases.Conversation.make({
  memberIds: [MemberId.MemberId.make("member-2"), MemberId.MemberId.make("member-3")]
})

describe("Drafts", () => {
  it.effect("keeps a draft for each place, the last one written, until it is emptied", () =>
    Effect.gen(function* () {
      const drafts = yield* Drafts.Drafts
      expect(yield* drafts.get(reply)).toBe("")
      yield* Effect.all([drafts.save(reply, "S"), drafts.save(reply, "So"), drafts.save(reply, "Sounds good")], {
        concurrency: "unbounded"
      })
      yield* drafts.save(newThread, "Plans")
      expect(yield* drafts.get(reply)).toBe("Sounds good")
      expect(yield* drafts.get(newThread)).toBe("Plans")
      yield* drafts.save(reply, "")
      expect(yield* drafts.get(reply)).toBe("")
      expect(yield* drafts.get(newThread)).toBe("Plans")
    }).pipe(withDrafts)
  )

  it.effect("keeps the first message of a conversation not started for the people it is with, and for no others", () =>
    Effect.gen(function* () {
      const drafts = yield* Drafts.Drafts
      yield* drafts.save(withBob, "Got a minute?")
      expect(yield* drafts.get(withBob)).toBe("Got a minute?")
      expect(yield* drafts.get(withBobAndScout)).toBe("")
      yield* drafts.save(withBobAndScout, "Lunch?")
      expect(yield* drafts.get(withBob)).toBe("Got a minute?")
      yield* drafts.save(withBob, "")
      expect(yield* drafts.get(withBob)).toBe("")
      expect(yield* drafts.get(withBobAndScout)).toBe("Lunch?")
    }).pipe(withDrafts)
  )

  it.effect("outlasts the drafts being closed and opened again", () =>
    Effect.gen(function* () {
      const name = `drafts-${crypto.randomUUID()}`
      yield* Effect.flatMap(Drafts.Drafts, (drafts) => drafts.save(reply, "Sounds good")).pipe((test) =>
        withDrafts(test, name)
      )
      expect(
        yield* Effect.flatMap(Drafts.Drafts, (drafts) => drafts.get(reply)).pipe((test) => withDrafts(test, name))
      ).toBe("Sounds good")
    })
  )
})
