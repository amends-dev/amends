import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Schema } from "effect";
import { Codec } from "../../src/journal/codec.ts";
import { Notification } from "../../src/notification/notification.ts";
import { NotificationStore } from "../../src/notification/store.ts";

const wire = {
  id: "notification-one",
  workspaceId: "workspace-one",
  source: { logId: "journal", entryId: "source-entry" },
  recipient: { _tag: "Human", id: "recipient-one", memberId: "member-one" },
  recordedAt: "2026-09-19T12:00:00.000Z",
  state: { _tag: "Pending" },
} as const;
it.effect("a Seen notification keeps its time through the codec, and only a person's can be", () =>
  Effect.gen(function* () {
    const encoded = {
      ...wire,
      state: { _tag: "Seen", seenAt: "2026-09-21T12:00:00.123Z" },
    };
    const record = yield* Schema.decodeUnknownEffect(Notification.Record)(encoded);
    const codec = Codec.makeForSchema(Notification.Record);
    expect(
      yield* Schema.encodeEffect(Notification.Record)(
        yield* codec.decode(yield* codec.encode(record)),
      ),
    ).toEqual(encoded);
    const decode = Schema.decodeUnknownOption(Notification.Record);
    for (const invalid of [
      ...["Agent", "Contact", "Triage"].map((kind) => ({
        ...encoded,
        recipient: { _tag: kind, id: "recipient", memberId: "member-one" },
      })),
      { ...encoded, state: { _tag: "Seen", seenAt: "invalid" } },
      { ...encoded, state: { _tag: "Seen" } },
      { ...encoded, state: { _tag: "Accepted", turnId: "turn", acceptedAt: encoded.state.seenAt } },
    ])
      expect(Option.isNone(decode(invalid))).toBe(true);
  }),
);
it.effect.each(["Human", "Agent", "Contact"] as const)(
  "a %s notification preserves its source, recipient kind, and recorded time through codecs",
  (kind) =>
    Effect.gen(function* () {
      const encoded = {
        ...wire,
        recipient:
          kind === "Contact"
            ? { _tag: kind, id: "recipient-one" }
            : { ...wire.recipient, _tag: kind },
      };
      const codec = Codec.makeForSchema(Notification.Record);
      yield* Effect.gen(function* () {
        const record = yield* Schema.decodeEffect(Notification.Record)(encoded);
        expect(DateTime.formatIso(record.recordedAt)).toBe(wire.recordedAt);
        const restored = yield* codec.decode(yield* codec.encode(record));
        expect(yield* Schema.encodeEffect(Notification.Record)(restored)).toEqual(encoded);
      });
      // People and agents are notified as a membership, which their recipient must name.
      if (kind !== "Contact")
        expect(
          Option.isNone(
            Schema.decodeUnknownOption(Notification.Record)({
              ...encoded,
              recipient: { _tag: kind, id: "recipient-one" },
            }),
          ),
        ).toBe(true);
    }),
);
it("notification decoding rejects malformed references and unsupported recipient or lifecycle states", () => {
  const decode = Schema.decodeUnknownOption(Notification.Record);
  for (const invalid of [
    { ...wire, id: "" },
    { ...wire, workspaceId: "" },
    { ...wire, source: { ...wire.source, logId: "" } },
    { ...wire, source: { ...wire.source, entryId: "" } },
    { ...wire, recipient: { _tag: "Human", id: "" } },
    { ...wire, recipient: { _tag: "Unknown", id: "recipient-one" } },
    { ...wire, state: { _tag: "Unknown" } },
    { ...wire, recordedAt: "not-a-date" },
  ]) {
    expect(Option.isNone(decode(invalid))).toBe(true);
  }
});
it("recipient read options preserve their exclusive boundary and require a positive page size", () => {
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
