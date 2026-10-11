import { Effect, Schema } from "effect";
import * as Performer from "../identity/performer.ts";
import * as WorkspaceId from "../workspace/id.ts";
import * as Codec from "./codec.ts";
import * as Commit from "./commit.ts";
import * as Entry from "./entry.ts";
import * as Fact from "./fact.ts";
import type * as Log from "./log.ts";
import * as Subject from "./subject.ts";

/** Enough information to locate a particular event in a workspace journal. */
export const Reference = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  logId: Entry.LogId,
  commitId: Commit.Id,
  id: Entry.Id,
});
export interface Reference extends Schema.Schema.Type<typeof Reference> {}

export const CorrelationId = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(
  Schema.brand("EventCorrelationId"),
);
export type CorrelationId = typeof CorrelationId.Type;

/** Immutable context of the domain action; log metadata describes its recording. */
export const Provenance = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  performedBy: Performer.Reference,
  /** Null identifies a root action with no upstream event. */
  causedBy: Schema.NullOr(Reference),
  correlationId: CorrelationId,
  occurredAt: Schema.DateTimeUtcFromString,
}).check(
  Schema.makeFilter((value) =>
    value.causedBy === null || value.causedBy.workspaceId === value.workspaceId
      ? undefined
      : "The cause must belong to the same workspace",
  ),
);
export interface Provenance extends Schema.Schema.Type<typeof Provenance> {}

/** Queryable fact metadata, stored separately from the encoded domain payload. */
export const Header = Schema.Struct({
  subject: Subject.Value,
  name: Schema.String,
  version: Schema.Finite,
  provenance: Provenance,
});
export interface Header extends Schema.Schema.Type<typeof Header> {}

/** In-memory envelope; only payload is stored as binary by the journal's entry codec. */
export const Envelope = Schema.Struct({ ...Header.fields, payload: Schema.Uint8Array });
export interface Envelope extends Schema.Schema.Type<typeof Envelope> {}

/** Preserve the envelope's typed metadata without encoding a second binary wrapper. */
export const storageCodec: Codec.EntryCodec<typeof Envelope> = {
  encode: Effect.fn("Event.encodeEntry")(function* (input) {
    const { payload, ...fact } = yield* Schema.decodeEffect(Schema.toType(Envelope))(input);
    return { fact, payload: payload.slice() };
  }),
  decode: Effect.fn("Event.decodeEntry")(function* (entry) {
    const fact = yield* Schema.decodeUnknownEffect(Schema.toType(Header))(entry.fact);
    return { ...fact, payload: entry.payload.slice() };
  }),
};

export class FactMismatch extends Schema.TaggedError<FactMismatch>()("Journal.FactMismatch", {
  name: Schema.String,
  version: Schema.Finite,
}) {}

export const Id = Entry.Id;
export type Id = typeof Id.Type;

export const CommitId = Commit.Id;
export type CommitId = typeof CommitId.Type;

/** A published fact carries the metadata of its underlying log entry. */
export const Metadata = Schema.Struct({
  ...Entry.Metadata.fields,
  subject: Subject.Value,
  provenance: Provenance,
});

export interface Metadata extends Schema.Schema.Type<typeof Metadata> {}

/** A canonical decoded event; consumers use its fact definition to narrow the payload. */
export const Record = Schema.Struct({
  ...Metadata.fields,
  name: Schema.String,
  version: Schema.Finite,
  payload: Schema.Unknown,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

export type Type<F extends Fact.Definition> = ReturnType<
  typeof makeSchema<F["name"], F["version"], F["payload"]>
>["Type"];

/** Construct a durable reference to an attributed event. @category constructors */
export const makeReference = (event: Record): Reference => ({
  workspaceId: event.provenance.workspaceId,
  logId: event.logId,
  commitId: event.commitId,
  id: event.id,
});

/** Own and freeze attribution before sharing it with projections and subscribers. */
export const snapshotProvenance = (value: Provenance): Provenance => {
  const performedBy = value.performedBy;
  return Object.freeze({
    workspaceId: value.workspaceId,
    correlationId: value.correlationId,
    occurredAt: value.occurredAt,
    performedBy: Performer.Reference.match(performedBy, {
      System: (performer): Performer.Reference => Object.freeze({ ...performer }),
      Member: (performer): Performer.Reference =>
        Object.freeze({ ...performer, identity: Object.freeze({ ...performer.identity }) }),
      Identity: (performer): Performer.Reference =>
        Object.freeze({ ...performer, identity: Object.freeze({ ...performer.identity }) }),
    }),
    causedBy: value.causedBy === null ? null : Object.freeze({ ...value.causedBy }),
  });
};

/**
 * Construct the event schema for one fact's name, version, and payload contract.
 *
 * @category constructors
 */
export const makeSchema = <
  const Name extends string,
  const Version extends number,
  PayloadSchema extends Schema.Constraint,
>(
  fact: Fact.Definition<Name, Version, PayloadSchema>,
) =>
  Schema.Struct({
    ...Metadata.fields,
    name: Schema.Literal(fact.name),
    version: Schema.Literal(fact.version),
    payload: fact.payload,
  });

/** Decode a recorded fact using its matching versioned definition. */
export const decode = Effect.fn("Event.decode")(function* <F extends Fact.Definition>(
  fact: F,
  entry: Log.Entry<Envelope>,
) {
  if (entry.payload.name !== fact.name || entry.payload.version !== fact.version) {
    return yield* new FactMismatch({ name: fact.name, version: fact.version });
  }
  const payload = yield* Codec.make(fact).decode(entry.payload.payload);
  const subject = yield* Fact.makeSubject(fact, payload);
  if (entry.payload.subject !== subject)
    return yield* new FactMismatch({ name: fact.name, version: fact.version });
  const provenance = snapshotProvenance(entry.payload.provenance);
  const event = yield* Schema.decodeUnknownEffect(
    Schema.toType(makeSchema<F["name"], F["version"], F["payload"]>(fact)),
  )({ ...entry, subject, provenance, name: fact.name, version: fact.version, payload });
  // Retain the concrete metadata shape even for a generic fact payload schema.
  return Object.assign(event, {
    ...entry,
    subject,
    provenance,
    name: fact.name,
    version: fact.version,
    payload,
  });
});
