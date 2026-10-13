/**
 * A fact event: a fact as the journal recorded it, with the subject, name, version, and provenance
 * it was published with, and the metadata of its log entry. `Header` is what storage keeps beside
 * the encoded payload, `Envelope` the entry as the journal's log reads and writes it, and `Event`
 * and `Type` the decoded event that projections, reactions, and readers receive. `decode` turns an
 * envelope into an event with the fact's versioned definition.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Performer from "../identity/Performer.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Codec from "./Codec.ts"
import * as Commit from "./Commit.ts"
import * as Entry from "./Entry.ts"
import * as Fact from "./Fact.ts"
import type * as Log from "./Log.ts"
import * as Subject from "./Subject.ts"

/**
 * Enough information to locate a particular event in a workspace journal: its workspace, log,
 * commit, and entry. A later event's `causedBy` holds one.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  logId: Entry.LogId,
  commitId: Commit.Id,
  id: Entry.Id
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Reference extends Schema.Schema.Type<typeof Reference> {}

/**
 * Groups a causal workflow across events and commits. `Publication.make` draws a fresh one for each
 * root action and `Publication.withCause` carries it on; it is not an idempotency key.
 *
 * @category schemas
 * @since 0.1.0
 */
export const CorrelationId = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(Schema.brand("EventCorrelationId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type CorrelationId = typeof CorrelationId.Type

/**
 * Immutable context of the domain action; log metadata describes its recording. Every fact event
 * carries it: the workspace, who performed the action, its immediate cause, its correlation, and
 * when it happened. `Publication.Publication` supplies it to each `Journal.publish`, and a cause
 * must belong to the same workspace.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Provenance = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  /** The member, non-member identity, or named system process responsible for the action. */
  performedBy: Performer.Reference,
  /** Null identifies a root action with no upstream event. */
  causedBy: Schema.NullOr(Reference),
  correlationId: CorrelationId,
  /** When the domain action happened, independently of its entry's `recordedAt`. */
  occurredAt: Schema.DateTimeUtcFromString
}).check(
  Schema.makeFilter((value) =>
    value.causedBy === null || value.causedBy.workspaceId === value.workspaceId
      ? undefined
      : "The cause must belong to the same workspace"
  )
)
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Provenance extends Schema.Schema.Type<typeof Provenance> {}

/**
 * Queryable fact metadata, stored separately from the encoded domain payload, so that reads can
 * select facts by subject, name, and version.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Header = Schema.Struct({
  subject: Subject.Subject,
  name: Schema.String,
  version: Schema.Finite,
  provenance: Provenance
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Header extends Schema.Schema.Type<typeof Header> {}

/**
 * A fact event as the journal's log reads and writes it: the header, and the payload's encoded
 * bytes. Only the payload is stored as binary, through `storageCodec`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Envelope = Schema.Struct({ ...Header.fields, payload: Schema.Uint8Array })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Envelope extends Schema.Schema.Type<typeof Envelope> {}

/**
 * The journal log's entry codec: the header goes to storage as `Store.Content.fact` and the
 * payload bytes as they are, preserving the envelope's typed metadata without encoding a second
 * binary wrapper. Each direction copies the bytes.
 *
 * @category utils
 * @since 0.1.0
 */
export const storageCodec: Codec.EntryCodec<typeof Envelope> = {
  encode: Effect.fn("Event.encodeEntry")(function* (input) {
    const { payload, ...fact } = yield* Schema.decodeEffect(Schema.toType(Envelope))(input)
    return { fact, payload: payload.slice() }
  }),
  decode: Effect.fn("Event.decodeEntry")(function* (entry) {
    const fact = yield* Schema.decodeUnknownEffect(Schema.toType(Header))(entry.fact)
    return { ...fact, payload: entry.payload.slice() }
  })
}

/**
 * A fact event does not match the definition it is read or published with: it records another
 * name or version, or a subject other than the one the definition derives, or two definitions
 * registered under one name and version differ in payload schema, subject, or occurrence rule.
 *
 * @category errors
 * @since 0.1.0
 */
export class FactMismatch extends Schema.TaggedError<FactMismatch>()("Event.FactMismatch", {
  name: Schema.String,
  version: Schema.Finite
}) {}

/**
 * A published fact carries the metadata of its underlying log entry, with its subject and
 * provenance, whatever its fact.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Metadata = Schema.Struct({
  ...Entry.Metadata.fields,
  subject: Subject.Subject,
  provenance: Provenance
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Metadata extends Schema.Schema.Type<typeof Metadata> {}

/**
 * A canonical decoded event of any fact, as reactions and causes receive it; consumers use its
 * fact definition to narrow the payload, which is `unknown` here.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Event = Schema.Struct({
  ...Metadata.fields,
  name: Schema.String,
  version: Schema.Finite,
  payload: Schema.Unknown
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Event extends Schema.Schema.Type<typeof Event> {}

/**
 * The decoded event of fact `F`: event metadata with `F`'s literal name and version and its
 * payload type. `Journal.publish` returns one, and projection handlers receive one.
 *
 * @category models
 * @since 0.1.0
 */
export type Type<F extends Fact.Definition> = ReturnType<
  typeof makeSchema<F["name"], F["version"], F["payload"]>
>["Type"]

/**
 * The durable reference that locates `event`, for a later event's `causedBy`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeReference = (event: Event): Reference => ({
  workspaceId: event.provenance.workspaceId,
  logId: event.logId,
  commitId: event.commitId,
  id: event.id
})

/**
 * Own and freeze attribution before sharing it with projections and subscribers: a frozen copy of
 * `value`, its performer's identity and its cause included.
 *
 * @category utils
 * @since 0.1.0
 */
export const snapshotProvenance = (value: Provenance): Provenance => {
  const performedBy = value.performedBy
  return Object.freeze({
    workspaceId: value.workspaceId,
    correlationId: value.correlationId,
    occurredAt: value.occurredAt,
    performedBy: Performer.Reference.match(performedBy, {
      System: (performer): Performer.Reference => Object.freeze({ ...performer }),
      Member: (performer): Performer.Reference =>
        Object.freeze({ ...performer, identity: Object.freeze({ ...performer.identity }) }),
      Identity: (performer): Performer.Reference =>
        Object.freeze({ ...performer, identity: Object.freeze({ ...performer.identity }) })
    }),
    causedBy: value.causedBy === null ? null : Object.freeze({ ...value.causedBy })
  })
}

/**
 * The schema of one fact's decoded events: event metadata with the fact's literal name and
 * version, and its payload schema. Projections check each event they handle against it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeSchema = <
  const Name extends string,
  const Version extends number,
  PayloadSchema extends Schema.Constraint
>(
  fact: Fact.Definition<Name, Version, PayloadSchema>
) =>
  Schema.Struct({
    ...Metadata.fields,
    name: Schema.Literal(fact.name),
    version: Schema.Literal(fact.version),
    payload: fact.payload
  })

/**
 * Decodes a journal entry as an event of `fact`, its matching versioned definition. Fails with
 * `FactMismatch` when the entry records another name or version, or a subject other than the one
 * `fact` derives from the decoded payload. The event's provenance is frozen.
 *
 * @category utils
 * @since 0.1.0
 */
export const decode = Effect.fn("Event.decode")(function* <F extends Fact.Definition>(
  fact: F,
  entry: Log.Entry<Envelope>
) {
  if (entry.payload.name !== fact.name || entry.payload.version !== fact.version) {
    return yield* new FactMismatch({ name: fact.name, version: fact.version })
  }
  const payload = yield* Codec.make(fact).decode(entry.payload.payload)
  const subject = yield* Fact.makeSubject(fact, payload)
  if (entry.payload.subject !== subject) return yield* new FactMismatch({ name: fact.name, version: fact.version })
  const provenance = snapshotProvenance(entry.payload.provenance)
  const event = yield* Schema.decodeUnknownEffect(
    Schema.toType(makeSchema<F["name"], F["version"], F["payload"]>(fact))
  )({ ...entry, subject, provenance, name: fact.name, version: fact.version, payload })
  // Retain the concrete metadata shape even for a generic fact payload schema.
  return Object.assign(event, {
    ...entry,
    subject,
    provenance,
    name: fact.name,
    version: fact.version,
    payload
  })
})
