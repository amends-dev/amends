import { expect, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import { Hex } from "effect/encoding";
import { Codec } from "../../src/journal/codec.ts";
import { ThreadMessageFacts } from "../../src/thread/message/facts.ts";
import { TurnLog } from "../../src/turn/log.ts";
import { WorkspaceFacts } from "../../src/workspace/facts.ts";
import { fixtures } from "./codec-fixtures.ts";

const verifyStoredPayload = Effect.fnUntraced(function* <S extends Schema.Constraint>(
  schema: S,
  fixture: { readonly value: unknown; readonly hex: string },
) {
  const codec = Codec.makeForSchema(schema);
  const expected = yield* Schema.decodeUnknownEffect(schema)(fixture.value);
  const bytes = Result.getOrThrow(Hex.decode(fixture.hex));
  expect(yield* codec.decode(bytes)).toEqual(expected);
  expect(Hex.encode(yield* codec.encode(expected))).toBe(fixture.hex);
});

it.effect("preserves workspace initialization bytes written with Effect rc.115", () =>
  verifyStoredPayload(WorkspaceFacts.Initialized.payload, fixtures.workspace),
);

it.effect("preserves message bytes with dates, Unicode, mentions, and a nullable turn", () =>
  verifyStoredPayload(ThreadMessageFacts.Published.payload, fixtures.message),
);

it.effect("preserves checkpoint bytes with transcript variants and provider metadata", () =>
  verifyStoredPayload(TurnLog.Entry, fixtures.checkpoint),
);
