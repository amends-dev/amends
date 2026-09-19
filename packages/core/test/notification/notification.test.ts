import { expect, test } from "bun:test";
import { DateTime, Effect, Option, Schema } from "effect";
import { Codec } from "../../src/journal/codec.ts";
import { Notification } from "../../src/notification/notification.ts";
import { NotificationStore } from "../../src/notification/store.ts";

const wire = {
  id: "notification-one",
  workspaceId: "workspace-one",
  source: { logId: "journal", entryId: "source-entry" },
  recipient: { _tag: "Human", id: "recipient-one" },
  recordedAt: "2026-09-19T12:00:00.000Z",
  state: { _tag: "Pending" },
} as const;

test.each(["Human", "Agent"] as const)(
  "a %s notification preserves its source, recipient kind, and recorded time through codecs",
  async (kind) => {
    const encoded = { ...wire, recipient: { ...wire.recipient, _tag: kind } };
    const codec = Codec.makeForSchema(Notification.Record);
    await Effect.runPromise(
      Effect.gen(function* () {
        const record = yield* Schema.decodeEffect(Notification.Record)(encoded);
        expect(DateTime.formatIso(record.recordedAt)).toBe(wire.recordedAt);
        const restored = yield* codec.decode(yield* codec.encode(record));
        expect(yield* Schema.encodeEffect(Notification.Record)(restored)).toEqual(encoded);
      }),
    );
  },
);

test("notification decoding rejects malformed references and unsupported recipient or lifecycle states", () => {
  const decode = Schema.decodeUnknownOption(Notification.Record);
  for (const invalid of [
    { ...wire, id: "" },
    { ...wire, workspaceId: "" },
    { ...wire, source: { ...wire.source, logId: "" } },
    { ...wire, source: { ...wire.source, entryId: "" } },
    { ...wire, recipient: { _tag: "Human", id: "" } },
    { ...wire, recipient: { _tag: "Contact", id: "recipient-one" } },
    { ...wire, state: { _tag: "Acknowledged" } },
    { ...wire, recordedAt: "not-a-date" },
  ]) {
    expect(Option.isNone(decode(invalid))).toBe(true);
  }
});

test("recipient read options preserve their exclusive boundary and require a positive page size", () => {
  const encoded = { after: { recordedAt: wire.recordedAt, id: wire.id }, limit: 20 };
  const options = Schema.decodeSync(NotificationStore.ReadOptions)(encoded);
  expect(Schema.encodeSync(NotificationStore.ReadOptions)(options)).toEqual(encoded);
  const decode = Schema.decodeUnknownOption(NotificationStore.ReadOptions);
  for (const invalid of [
    {},
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
    { ...encoded, after: { ...encoded.after, id: "" } },
    { ...encoded, after: { ...encoded.after, recordedAt: "not-a-date" } },
  ]) {
    expect(Option.isNone(decode(invalid))).toBe(true);
  }
});
