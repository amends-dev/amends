import { Assignment, Scope } from "@amends-dev/core/authorization"
import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Effect, Predicate, Schema } from "effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import { SyncSchema } from "../src/index.ts"

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
 * An assignment as its schema's check requires, whose scope belongs to its workspace, which random
 * values never meet.
 */
const assignment = Arbitrary.schema(Schema.Struct(Assignment.Assignment.fields)).pipe(
  Arbitrary.map((value) => {
    const scope = Assignment.Source.match(value.source, {
      Role: ({ scope }) => scope,
      Direct: ({ grant }) => grant.scope
    })
    return {
      ...value,
      workspaceId: Scope.Scope.match(scope, {
        Workspace: ({ workspaceId }) => workspaceId,
        Target: ({ target }) => target.workspaceId
      })
    }
  })
)
const { cases } = ReplicaChange.ReplicaChange
/** One commit's batch: a change for a record of `kind`, with every other kind of change. */
const batchOf = (kind: ReplicaRecord.Kind): Arbitrary.Arbitrary<ReplicaChange.Batch> =>
  Arbitrary.all({
    position: Arbitrary.schema(ReplicaChange.Batch.fields.position),
    recordedAt: Arbitrary.schema(ReplicaChange.Batch.fields.recordedAt),
    record:
      kind === "Assignment"
        ? Arbitrary.map(assignment, (value) => ({ _tag: "Assignment" as const, value }))
        : Arbitrary.schema(ReplicaRecord.ReplicaRecord.cases[kind]),
    key: Arbitrary.schema(ReplicaRecord.Key),
    others: Arbitrary.schema(Schema.Array(Schema.Union([cases.Reset, cases.Completed, cases.Rejected])))
  }).pipe(
    Arbitrary.map(({ position, recordedAt, record, key, others }) => ({
      position,
      recordedAt,
      changes: [cases.Changed.make({ record }), cases.Dropped.make({ key }), ...others]
    }))
  )
/**
 * Encode and decode payloads the event accepts and gives back each one unchanged, among those of
 * well-formed Unicode; a lone surrogate comes back as U+FFFD.
 */
const verifyRoundTrip = (event: Event.Any, payloads?: Arbitrary.Arbitrary<unknown>, label = event.tag) => {
  // Every payload's schema needs no services, which `Event.Any` cannot say.
  const payload = event.payload as Schema.Codec<unknown, unknown>
  const binary = event.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>
  const encode = Schema.encodeEffect(binary)
  const decode = Schema.decodeEffect(binary)
  const equivalent = Schema.toEquivalence(payload)
  return Arbitrary.checkEffect(
    (payloads ?? Arbitrary.schema(payload)).pipe(Arbitrary.filter(isWellFormed)),
    (payload) =>
      encode(payload).pipe(
        Effect.flatMap(decode),
        Effect.map((decoded) => equivalent(decoded, payload))
      ),
    { seed: 7, runs: 20 }
  ).pipe(Effect.map((result) => expect(Arbitrary.formatCheckFailure(result), label).toBeUndefined()))
}
const replicaChanged = events.find((event) => event.tag === "ReplicaChanged")!

describe("SyncSchema", () => {
  it("names each event once, so no group's event replaces another's", () => {
    const tags = events.map((event) => event.tag)
    expect(new Set(tags).size).toBe(tags.length)
  })

  it("holds the actions browsers write and the one change the server writes", () => {
    const tags = events.map((event) => event.tag)
    expect(tags.filter((tag) => tag === "ReplicaChanged")).toEqual(["ReplicaChanged"])
    expect(tags).toHaveLength(43)
  })

  it.effect("carries every action's payload through its binary encoding unchanged", () =>
    Effect.forEach(
      events.filter((event) => event.tag !== replicaChanged.tag),
      (event) => verifyRoundTrip(event),
      { discard: true }
    )
  )

  it.effect("carries a commit's changes to every kind of record through the binary encoding unchanged", () =>
    Effect.forEach(
      Object.keys(ReplicaRecord.ReplicaRecord.cases) as ReadonlyArray<ReplicaRecord.Kind>,
      (kind) => verifyRoundTrip(replicaChanged, batchOf(kind), kind),
      { discard: true }
    )
  )
})

describe("ReplicaChanged", () => {
  it("keys each commit's changes by its position, so none are compacted together", () => {
    const batch = (position: number): ReplicaChange.Batch =>
      Schema.decodeSync(ReplicaChange.Batch)({ position, recordedAt: "2026-10-18T12:00:00Z", changes: [] })
    expect(replicaChanged.primaryKey(batch(7))).toBe("7")
    expect(replicaChanged.primaryKey(batch(8))).not.toBe(replicaChanged.primaryKey(batch(7)))
  })
})
