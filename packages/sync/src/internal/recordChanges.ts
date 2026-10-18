import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import type * as Schema from "effect/Schema"

/**
 * Add one kind of record's changes to a group: `<Name>Changed`, the record as it is now, and
 * `<Name>Dropped`, its key once it has left the replica. Both take the record's key, prefixed with
 * the kind's name, as their primary key, so compaction keeps each record's latest change and kinds
 * keyed by the same ID, such as a thread and its task, stay apart.
 */
export const recordChanges = <
  const Name extends string,
  RecordSchema extends Schema.Top,
  const KeyFields extends Schema.Struct.Fields
>(
  name: Name,
  record: RecordSchema,
  key: Schema.Struct<KeyFields>,
  keyOf: (record: Schema.Schema.Type<RecordSchema>) => Schema.Schema.Type<Schema.Struct<KeyFields>>
) => {
  const fields = Object.keys(key.fields)
  const primaryKeyOf = (value: Schema.Schema.Type<Schema.Struct<KeyFields>>) =>
    `${name}:${JSON.stringify(fields.map((field) => (value as Readonly<Record<string, unknown>>)[field]))}`
  return <Events extends Event.Any>(group: EventGroup.EventGroup<Events>) =>
    group
      .add({
        tag: `${name}Changed` as const,
        primaryKey: (value: Schema.Schema.Type<RecordSchema>) => primaryKeyOf(keyOf(value)),
        payload: record
      })
      .add({ tag: `${name}Dropped` as const, primaryKey: primaryKeyOf, payload: key })
}
