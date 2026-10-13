import { ThreadActivity, ThreadActivityKind, ThreadId } from "@amends-dev/core/thread"
import { expect, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts"

/** A kind at its first version, the same kind once its details changed, and another kind. */
const Noted = ThreadActivityKind.make("test.noted", {
  version: 1,
  details: Schema.Struct({ note: Schema.String }),
  newActivity: false
})
const NotedNext = ThreadActivityKind.make("test.noted", {
  version: 2,
  details: Schema.Struct({ note: Schema.String, by: Schema.String }),
  newActivity: false
})
const Pinged = ThreadActivityKind.make("test.pinged", {
  version: 1,
  details: Schema.Struct({}),
  newActivity: false
})
const common = {
  id: ThreadActivity.ThreadActivityId.make("activity-1"),
  workspaceId: WorkspaceId.WorkspaceId.make("workspace-one"),
  threadId: ThreadId.ThreadId.make("thread-1"),
  sequence: 1,
  occurredAt: DateTime.makeUnsafe("2026-10-10T12:00:00.000Z")
}

it.effect("an activity records its kind's version and reads back only at that version", () =>
  Effect.gen(function* () {
    const recorded = ThreadActivityKind.makeRecordUnsafe(Noted, common, { note: "Ship it" })
    // Without a subject rule the activity is about its thread, and so occurs once per thread.
    expect(recorded).toMatchObject({
      kind: "test.noted",
      version: 1,
      subject: "thread:thread-1",
      occurrence: JSON.stringify(["test.noted", "thread:thread-1"]),
      newActivity: false,
      details: { note: "Ship it" }
    })
    expect(yield* ThreadActivityKind.decode(Noted, recorded)).toMatchObject({
      version: 1,
      details: { note: "Ship it" }
    })
    // The kind's next version, and another kind, read it as a mismatch, not as malformed details.
    expect(yield* Effect.flip(ThreadActivityKind.decode(NotedNext, recorded))).toEqual(
      new ThreadActivityKind.Mismatch({ kind: "test.noted", version: 2, activityId: recorded.id })
    )
    expect(yield* Effect.flip(ThreadActivityKind.decode(Pinged, recorded))).toEqual(
      new ThreadActivityKind.Mismatch({ kind: "test.pinged", version: 1, activityId: recorded.id })
    )
  })
)
