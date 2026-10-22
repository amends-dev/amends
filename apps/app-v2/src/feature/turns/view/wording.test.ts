import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { connectionOf, turnOf } from "../../../../test/fixtures.ts"
import { Entry } from "../activity.ts"
import { Footer, footerOf, summaryOf, wordsOf } from "./wording.ts"

const time = (value: string) => DateTime.makeUnsafe(value)

const accepted = time("2026-10-18T12:02:00Z")

const started = time("2026-10-18T12:02:01Z")

const taken = time("2026-10-18T12:02:02Z")

const finished = time("2026-10-18T12:03:00Z")

describe("what an entry says", () => {
  const words = (entry: Entry) => wordsOf(entry, "Scout")

  it("names the work, in apps/ui's words, for the agent", () => {
    expect(words(Entry.Accepted({ at: accepted }))).toEqual({
      title: "Work accepted",
      text: "Scout picked up the request from this thread."
    })
    expect(words(Entry.Started({ at: started }))).toEqual({
      title: "Turn started",
      text: "Running on the recorded harness, model, and sandbox."
    })
  })

  it("says what an input added: the request and the conversation, one message, or several", () => {
    const added = (messages: number, isFirst: boolean) => words(Entry.Input({ at: taken, messages, isFirst }))

    expect(added(4, true)).toEqual({
      title: "Thread input received",
      text: "The request and prior conversation were added."
    })
    expect(added(1, false).text).toBe("Another message from the thread was added.")
    expect(added(3, false).text).toBe("3 more messages from the thread were added.")
  })

  it("titles a response as the reply when it was posted, and says nothing under it", () => {
    expect(words(Entry.Response({ at: taken, text: "Hi", isPosted: true }))).toEqual({
      title: "Reply recorded",
      text: undefined
    })
    expect(words(Entry.Response({ at: taken, text: "Hi", isPosted: false })).title).toBe("Response recorded")
  })

  it("says that a run was interrupted, and that it tries again when it does", () => {
    expect(words(Entry.Interrupted({ at: taken, reason: "The model stalled.", isRetrying: false }))).toEqual({
      title: "Interrupted",
      text: "The model stalled."
    })
    expect(words(Entry.Interrupted({ at: taken, reason: "The model stalled.", isRetrying: true })).text).toBe(
      "The model stalled. Trying again."
    )
  })

  it("says how the turn ended", () => {
    expect(words(Entry.Replied({ at: finished }))).toEqual({
      title: "Reply posted",
      text: "Turn completed. Open the reply in its thread."
    })
    expect(words(Entry.Finished({ at: finished }))).toEqual({ title: "Turn completed", text: "No reply was posted." })
    expect(words(Entry.Failed({ at: finished, reason: Option.some("The model was unavailable.") }))).toEqual({
      title: "Turn failed",
      text: "The model was unavailable."
    })
    expect(words(Entry.Failed({ at: finished, reason: Option.none() }))).toEqual({
      title: "Turn failed",
      text: undefined
    })
  })

  it("says why a turn stopped: it was asked to, its agent left, or its task changed", () => {
    expect(words(Entry.Stopped({ at: finished, by: "request" }))).toEqual({
      title: "Turn stopped",
      text: "It stopped as asked. Its output stays in this log."
    })
    expect(words(Entry.Stopped({ at: finished, by: "departure" })).text).toBe(
      "Scout stopped taking part in this thread."
    )
    expect(words(Entry.Stopped({ at: finished, by: "task" })).text).toBe(
      "The task no longer asks Scout to work on it. Its output stays in this log."
    )
  })
})

describe("what a turn ran on", () => {
  const anthropic = connectionOf("connection-1", "Anthropic")
  const opencode = connectionOf("connection-2", "opencode")
  const daytona = connectionOf("connection-3", "Daytona")
  const connections = [anthropic, opencode, daytona]
  const where = "Thread in #general"

  const ranOn = (sandbox: { readonly connectionId: string } | null) =>
    turnOf("turn-1", "running", {
      selection: {
        harness: { connectionId: "connection-2" },
        model: { connectionId: "connection-1", id: "claude-sonnet-5" },
        sandbox
      }
    })

  it("is where it works, the model by its connection and its id, the harness, and the sandbox", () => {
    expect(summaryOf(ranOn({ connectionId: "connection-3" }), "working", where, connections)).toEqual([
      { text: "Thread in #general" },
      { text: "Anthropic · claude-sonnet-5", isCode: true },
      { text: "Harness · opencode" },
      { text: "Sandbox · Daytona" }
    ])
  })

  it("says that it has no sandbox, and names a connection that was removed as removed", () => {
    expect(summaryOf(ranOn(null), "working", where, connections).at(-1)).toEqual({ text: "No sandbox" })
    expect(summaryOf(ranOn(null), "working", where, [anthropic])).toEqual([
      { text: "Thread in #general" },
      { text: "Anthropic · claude-sonnet-5", isCode: true },
      { text: "Harness · Removed connection" },
      { text: "No sandbox" }
    ])
  })

  it("says why there is nothing to say before the turn started, by how it stands", () => {
    const unstarted = (state: Parameters<typeof summaryOf>[1]) =>
      summaryOf(turnOf("turn-1", "queued"), state, where, connections)

    expect(unstarted("queued")).toEqual([
      { text: where },
      { text: "The harness, model, and sandbox are recorded when work starts." }
    ])
    expect(unstarted("failed")[1]).toEqual({ text: "This turn failed before execution started." })
    expect(unstarted("stopped")[1]).toEqual({ text: "This turn stopped before execution started." })
  })
})

describe("the line at the foot of a turn's log", () => {
  const facts = { hasNewActivity: false, canRetry: false, hasReply: false }
  const footer = (state: Parameters<typeof footerOf>[0], changes: Partial<typeof facts> = {}) =>
    footerOf(state, { ...facts, ...changes })

  it("says that the log is followed live while the turn works or stops", () => {
    expect(footer("working")).toEqual(Footer.FollowingLive())
    expect(footer("stopping")).toEqual(Footer.FollowingLive())
  })

  it("says that the turn waits to start, and that it finished once it ended", () => {
    expect(footer("queued")).toEqual(Footer.Waiting())
    expect(footer("done")).toEqual(Footer.Finished())
    expect(footer("failed")).toEqual(Footer.Finished())
    expect(footer("stopped")).toEqual(Footer.Finished())
  })

  it("offers the reply of a turn that posted one", () => {
    expect(footer("done", { hasReply: true })).toEqual(Footer.ViewReply())
    expect(footer("failed", { hasReply: true })).toEqual(Footer.Finished())
  })

  it("offers a retry before the rest once the person may direct the agent and the turn may run again", () => {
    expect(footer("failed", { canRetry: true })).toEqual(Footer.RetryTurn())
    expect(footer("done", { canRetry: true, hasReply: true })).toEqual(Footer.RetryTurn())
  })

  it("says that something new is below the view before anything else", () => {
    expect(footer("working", { hasNewActivity: true })).toEqual(Footer.NewActivity())
    expect(footer("failed", { hasNewActivity: true, canRetry: true })).toEqual(Footer.NewActivity())
  })
})
