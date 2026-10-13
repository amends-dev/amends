/**
 * How a log entry maps to its `log_entries` row: a fact's subject, name, and version, and its
 * provenance's performer, cause, correlation, and time, each in columns of their own beside the
 * binary payload; an entry of a log without facts leaves them null. The provenance's workspace is
 * the row's, so it is not stored again. `Journal` writes entries with `toColumns` and reads them
 * with `columns` and `decodeRows`.
 *
 * @since 0.1.0
 */

import { Performer } from "@amends-dev/core/identity"
import { Event, Store } from "@amends-dev/core/journal"
import type { WorkspaceId } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { logEntries } from "./internal/schema.ts"

/**
 * The `log_entries` columns a read selects, named as `decodeRows` expects them.
 *
 * @category utils
 * @since 0.1.0
 */
export const columns = {
  id: logEntries.id,
  logId: logEntries.logId,
  position: logEntries.position,
  commitId: logEntries.commitId,
  index: logEntries.entryIndex,
  recordedAt: logEntries.recordedAt,
  payload: logEntries.payload,
  subject: logEntries.subject,
  factName: logEntries.factName,
  factVersion: logEntries.factVersion,
  performerKind: logEntries.performerKind,
  performerMemberId: logEntries.performerMemberId,
  performerIdentityKind: logEntries.performerIdentityKind,
  performerIdentityId: logEntries.performerIdentityId,
  performerSystemId: logEntries.performerSystemId,
  causeLogId: logEntries.causeLogId,
  causeCommitId: logEntries.causeCommitId,
  causeEntryId: logEntries.causeEntryId,
  correlationId: logEntries.correlationId,
  occurredAt: logEntries.occurredAt
}

const headerFields = {
  subject: Schema.NullOr(Event.Header.fields.subject),
  factName: Schema.NullOr(Event.Header.fields.name),
  factVersion: Schema.NullOr(Event.Header.fields.version),
  performerKind: Schema.NullOr(Schema.Literals(["Member", "Identity", "System"])),
  performerMemberId: Schema.NullOr(Schema.String),
  performerIdentityKind: Schema.NullOr(Schema.Literals(["Human", "Agent", "Contact"])),
  performerIdentityId: Schema.NullOr(Schema.String),
  performerSystemId: Schema.NullOr(Schema.String),
  causeLogId: Schema.NullOr(Schema.String),
  causeCommitId: Schema.NullOr(Schema.String),
  causeEntryId: Schema.NullOr(Schema.String),
  correlationId: Schema.NullOr(Schema.String),
  occurredAt: Schema.NullOr(Schema.DateTimeUtcFromDate)
}
const Row = Schema.Struct({
  ...Store.Entry.fields,
  recordedAt: Schema.DateTimeUtcFromDate,
  ...headerFields
}).check(
  Schema.makeFilter((row) => {
    if ((row.factName === null) !== (row.subject === null)) return "Incomplete fact subject"
    if ((row.factName === null) !== (row.factVersion === null)) return "Incomplete fact metadata"
    if ((row.factName === null) !== (row.performerKind === null)) return "Fact attribution is required"
    const empty =
      row.performerMemberId === null &&
      row.performerIdentityKind === null &&
      row.performerIdentityId === null &&
      row.performerSystemId === null
    if (row.performerKind === null)
      return empty &&
        row.correlationId === null &&
        row.occurredAt === null &&
        row.causeLogId === null &&
        row.causeCommitId === null &&
        row.causeEntryId === null
        ? undefined
        : "Incomplete provenance"
    if (row.factName === null || row.correlationId === null || row.occurredAt === null) return "Incomplete provenance"
    if (
      (row.causeLogId === null) !== (row.causeCommitId === null) ||
      (row.causeLogId === null) !== (row.causeEntryId === null)
    )
      return "Incomplete cause"
    if (row.performerKind === "System")
      return row.performerSystemId !== null &&
        row.performerMemberId === null &&
        row.performerIdentityKind === null &&
        row.performerIdentityId === null
        ? undefined
        : "Invalid system performer"
    return row.performerIdentityKind !== null &&
      row.performerIdentityId !== null &&
      row.performerSystemId === null &&
      (row.performerKind === "Member" ? row.performerMemberId !== null : row.performerMemberId === null)
      ? undefined
      : "Invalid identity performer"
  })
)

/**
 * Decode rows selected with `columns` as `Store.Entry` values of `workspaceId`, failing on a row
 * whose fact header is incomplete or whose performer or cause is malformed.
 *
 * @category utils
 * @since 0.1.0
 */
export const decodeRows = Effect.fn("JournalEntry.decodeRows")(function* (
  workspaceId: WorkspaceId.WorkspaceId,
  input: unknown
) {
  const rows = yield* Schema.decodeUnknownEffect(Schema.Array(Row))(input)
  return yield* Effect.forEach(rows, (row) => {
    const identity = { _tag: row.performerIdentityKind, id: row.performerIdentityId }
    return Schema.decodeUnknownEffect(Schema.toType(Store.Entry))({
      id: row.id,
      logId: row.logId,
      position: row.position,
      commitId: row.commitId,
      index: row.index,
      recordedAt: row.recordedAt,
      payload: row.payload.slice(),
      ...(row.factName === null
        ? {}
        : {
            fact: {
              subject: row.subject,
              name: row.factName,
              version: row.factVersion,
              provenance: {
                workspaceId,
                correlationId: row.correlationId,
                occurredAt: row.occurredAt,
                performedBy:
                  row.performerKind === "System"
                    ? { _tag: "System", id: row.performerSystemId }
                    : row.performerKind === "Member"
                      ? { _tag: "Member", memberId: row.performerMemberId, identity }
                      : { _tag: "Identity", identity },
                causedBy:
                  row.causeLogId === null
                    ? null
                    : {
                        workspaceId,
                        logId: row.causeLogId,
                        commitId: row.causeCommitId,
                        id: row.causeEntryId
                      }
              }
            }
          })
    })
  })
})

/**
 * The header columns of an entry's content: its fact's subject, name, version, and provenance, or
 * nulls for content without a fact. Call only after validating the complete content and its
 * workspace binding, since the provenance's workspace is not stored.
 *
 * @category utils
 * @since 0.1.0
 */
export const toColumns = (entry: Store.Content) => {
  const provenance = entry.fact?.provenance
  const performer = provenance?.performedBy
  return {
    subject: entry.fact?.subject ?? null,
    factName: entry.fact?.name ?? null,
    factVersion: entry.fact?.version ?? null,
    performerKind: performer?._tag ?? null,
    performerMemberId: Predicate.isTagged(performer, "Member") ? performer.memberId : null,
    performerIdentityKind:
      performer !== undefined && !Performer.Reference.isAnyOf(["System"])(performer) ? performer.identity._tag : null,
    performerIdentityId:
      performer !== undefined && !Performer.Reference.isAnyOf(["System"])(performer) ? performer.identity.id : null,
    performerSystemId: Predicate.isTagged(performer, "System") ? performer.id : null,
    causeLogId: provenance?.causedBy?.logId ?? null,
    causeCommitId: provenance?.causedBy?.commitId ?? null,
    causeEntryId: provenance?.causedBy?.id ?? null,
    correlationId: provenance?.correlationId ?? null,
    occurredAt: provenance === undefined ? null : DateTime.toDate(provenance.occurredAt)
  }
}
