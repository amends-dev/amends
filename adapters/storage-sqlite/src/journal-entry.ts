import { Event, Store } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Effect, Schema } from "effect";

const provenance = Schema.fromJsonString(Event.Provenance);
const Row = Schema.Struct({
  ...Store.Entry.fields,
  subject: Schema.NullOr(Event.Header.fields.subject),
  factName: Schema.NullOr(Event.Header.fields.name),
  factVersion: Schema.NullOr(Event.Header.fields.version),
  provenance: Schema.NullOr(provenance),
}).check(
  Schema.makeFilter((row) =>
    (row.factName === null) !== (row.subject === null) ||
    (row.factName === null) !== (row.factVersion === null) ||
    (row.factName === null) !== (row.provenance === null)
      ? "Incomplete fact metadata"
      : undefined,
  ),
);

export const decodeRows = Effect.fn("JournalEntry.decodeRows")(function* (
  workspaceId: Workspace.Id,
  input: unknown,
) {
  const rows = yield* Schema.decodeUnknownEffect(Schema.Array(Row))(input);
  return yield* Effect.forEach(
    rows,
    Effect.fnUntraced(function* ({ subject, factName, factVersion, provenance, ...entry }) {
      if (provenance !== null && provenance.workspaceId !== workspaceId)
        return yield* new Store.Failure({
          operation: "read",
          cause: "Fact belongs to another workspace",
        });
      return yield* Schema.decodeUnknownEffect(Schema.toType(Store.Entry))({
        ...entry,
        payload: entry.payload.slice(),
        ...(factName === null
          ? {}
          : {
              fact: {
                subject,
                name: factName,
                version: factVersion,
                provenance,
              },
            }),
      });
    }),
  );
});

export const toColumns = Effect.fn("JournalEntry.toColumns")(function* (entry: Store.Content) {
  return {
    subject: entry.fact?.subject ?? null,
    factName: entry.fact?.name ?? null,
    factVersion: entry.fact?.version ?? null,
    provenance:
      entry.fact === undefined
        ? null
        : yield* Schema.encodeEffect(provenance)(entry.fact.provenance),
  };
});

export * as JournalEntry from "./journal-entry.ts";
