import { describe, expect, it } from "@effect/vitest"
import { DateTime } from "effect"
import * as Presence from "../../src/presence/Presence.ts"
import * as ThreadId from "../../src/thread/ThreadId.ts"
import * as MemberId from "../../src/workspace/MemberId.ts"
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace")
const ada = MemberId.MemberId.make("ada")
const kai = MemberId.MemberId.make("kai")
const threadId = ThreadId.ThreadId.make("thread")
const { Here, Gone, Typing, StoppedTyping } = Presence.Signal.cases
const at = (seconds: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 18, 12, 0, seconds))
const heard = (signals: ReadonlyArray<readonly [number, Presence.Signal]>) =>
  signals.reduce((state, [seconds, signal]) => Presence.apply(state, signal, at(seconds)), Presence.empty)

describe("Presence", () => {
  it("counts a member present while any connection of theirs is open, and where they type", () => {
    const state = heard([
      [0, Here.make({ workspaceId, memberId: ada, connectionId: "tab-1" })],
      [0, Here.make({ workspaceId, memberId: ada, connectionId: "tab-2" })],
      [1, Here.make({ workspaceId, memberId: kai, connectionId: "tab-3" })],
      [2, Typing.make({ workspaceId, memberId: kai, threadId })],
      [3, Gone.make({ workspaceId, memberId: ada, connectionId: "tab-1" })]
    ])
    expect(Presence.presentOf(state)).toEqual([
      { memberId: ada, typingIn: null },
      { memberId: kai, typingIn: threadId }
    ])
    const left = Presence.apply(
      Presence.apply(state, Gone.make({ workspaceId, memberId: ada, connectionId: "tab-2" }), at(4)),
      StoppedTyping.make({ workspaceId, memberId: kai }),
      at(4)
    )
    expect(Presence.presentOf(left)).toEqual([{ memberId: kai, typingIn: null }])
  })

  it("lets typing and connections lapse unless they are heard again in time", () => {
    const state = heard([
      [0, Here.make({ workspaceId, memberId: ada, connectionId: "tab-1" })],
      [0, Typing.make({ workspaceId, memberId: ada, threadId })],
      [30, Here.make({ workspaceId, memberId: kai, connectionId: "tab-2" })]
    ])
    // Typing lasts six seconds, a connection forty-five.
    expect(Presence.presentOf(Presence.expire(state, at(5)))).toEqual([
      { memberId: ada, typingIn: threadId },
      { memberId: kai, typingIn: null }
    ])
    expect(Presence.presentOf(Presence.expire(state, at(6)))).toEqual([
      { memberId: ada, typingIn: null },
      { memberId: kai, typingIn: null }
    ])
    expect(Presence.presentOf(Presence.expire(state, at(45)))).toEqual([{ memberId: kai, typingIn: null }])
    // A connection heard again lasts from then.
    const renewed = Presence.apply(state, Here.make({ workspaceId, memberId: ada, connectionId: "tab-1" }), at(40))
    expect(Presence.presentOf(Presence.expire(renewed, at(45))).map(({ memberId }) => memberId)).toEqual([ada, kai])
    // Nothing lapsed leaves the state as it was.
    expect(Presence.expire(state, at(1))).toBe(state)
  })
})
