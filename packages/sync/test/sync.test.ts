import { Assignment, Scope } from "@amends-dev/core/authorization"
import { Task } from "@amends-dev/core/task"
import { Thread } from "@amends-dev/core/thread"
import { Invitation } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Effect, Predicate, Schema } from "effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import { SyncSchema, TaskSync, ThreadSync, WorkspaceSync } from "../src/index.ts"

const events = SyncSchema.SyncSchema.groups.flatMap((group) =>
  Object.values((group as EventGroup.EventGroup<Event.Any>).events)
)
/** A UTF-16 surrogate without its pair, which UTF-8, and so the binary encoding, cannot carry. */
const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
/** Whether every string a value holds is well-formed Unicode. */
const isWellFormed = (value: unknown): boolean =>
  Predicate.isString(value)
    ? !loneSurrogate.test(value)
    : Array.isArray(value)
      ? value.every(isWellFormed)
      : !Predicate.isObject(value) ||
        value instanceof Uint8Array ||
        Object.entries(value).every(([key, field]) => isWellFormed(key) && isWellFormed(field))
/**
 * Payloads for the events whose schema checks fields against each other, which random values never
 * meet: an assignment's scope belongs to its workspace.
 */
const payloadsOf: Readonly<Record<string, Arbitrary.Arbitrary<unknown>>> = {
  AssignmentChanged: Arbitrary.schema(Schema.Struct(Assignment.Assignment.fields)).pipe(
    Arbitrary.map((assignment) => {
      const scope = Assignment.Source.match(assignment.source, {
        Role: ({ scope }) => scope,
        Direct: ({ grant }) => grant.scope
      })
      return {
        ...assignment,
        workspaceId: Scope.Scope.match(scope, {
          Workspace: ({ workspaceId }) => workspaceId,
          Target: ({ target }) => target.workspaceId
        })
      }
    })
  )
}
/**
 * Encode and decode payloads the event accepts and gives back each one unchanged, among those of
 * well-formed Unicode; a lone surrogate comes back as U+FFFD.
 */
const verifyRoundTrip = (event: Event.Any) => {
  // Every payload's schema needs no services, which `Event.Any` cannot say.
  const payload = event.payload as Schema.Codec<unknown, unknown>
  const binary = event.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>
  const encode = Schema.encodeEffect(binary)
  const decode = Schema.decodeEffect(binary)
  const equivalent = Schema.toEquivalence(payload)
  return Arbitrary.checkEffect(
    (payloadsOf[event.tag] ?? Arbitrary.schema(payload)).pipe(Arbitrary.filter(isWellFormed)),
    (payload) =>
      encode(payload).pipe(
        Effect.flatMap(decode),
        Effect.map((decoded) => equivalent(decoded, payload))
      ),
    { seed: 7, runs: 20 }
  ).pipe(Effect.map((result) => expect(Arbitrary.formatCheckFailure(result), event.tag).toBeUndefined()))
}
/** The primary key of an event's payload, through the event's own definition. */
const primaryKeyOf = (group: EventGroup.Any, tag: string, payload: unknown) =>
  (group as EventGroup.EventGroup<Event.Any>).events[tag]!.primaryKey(payload)

describe("SyncSchema", () => {
  it("names each event once, so no group's event replaces another's", () => {
    const tags = events.map((event) => event.tag)
    expect(new Set(tags).size).toBe(tags.length)
  })

  it("pairs every Changed with a Dropped of the same kind", () => {
    const tags = new Set(events.map((event) => event.tag))
    const kinds = [...tags].flatMap((tag) => (tag.endsWith("Changed") ? [tag.slice(0, -"Changed".length)] : []))
    expect(kinds.filter((kind) => !tags.has(`${kind}Dropped`))).toEqual([])
  })

  it.effect("carries every event's payload through its binary encoding unchanged", () =>
    Effect.forEach(events, verifyRoundTrip, { discard: true })
  )
})

describe("changes", () => {
  const threadId = "0193e1a2-0000-7000-8000-000000000001"
  const author = { _tag: "Member", memberId: "member" } as const

  it("key a record's change and its drop alike, apart from another kind keyed by the same ID", () => {
    const thread = Schema.decodeSync(Thread.Thread)({
      id: threadId,
      workspaceId: "workspace",
      groupId: "group",
      title: null,
      origin: null,
      createdBy: author,
      createdAt: "2026-10-17T12:00:00Z"
    })
    const task = Schema.decodeSync(Task.Task)({
      threadId,
      workspaceId: "workspace",
      groupId: "group",
      status: "todo",
      priority: "none",
      assignee: null,
      createdBy: author,
      createdAt: "2026-10-17T12:00:00Z"
    })
    const threadKey = primaryKeyOf(ThreadSync.Changes, "ThreadChanged", thread)
    expect(primaryKeyOf(ThreadSync.Changes, "ThreadDropped", { id: threadId })).toBe(threadKey)
    expect(primaryKeyOf(TaskSync.Changes, "TaskDropped", { threadId })).toBe(
      primaryKeyOf(TaskSync.Changes, "TaskChanged", task)
    )
    expect(primaryKeyOf(TaskSync.Changes, "TaskChanged", task)).not.toBe(threadKey)
  })

  it("key an invitation by the ID its details hold", () => {
    const invitation = Schema.decodeSync(Invitation.Invitation)({
      details: {
        id: "invitation",
        workspaceId: "workspace",
        inviterMemberId: "member",
        recipientId: "human",
        roleId: "role",
        expiresAt: "2026-10-24T12:00:00Z",
        issuedAt: "2026-10-17T12:00:00Z"
      },
      state: { _tag: "Pending" }
    })
    expect(primaryKeyOf(WorkspaceSync.Changes, "InvitationChanged", invitation)).toBe(
      primaryKeyOf(WorkspaceSync.Changes, "InvitationDropped", { id: "invitation" })
    )
  })
})
