import { describe, expect, it } from "@effect/vitest";
import { Redacted, Schema } from "effect";
import { ConnectionV2 } from "../../src/connection-v2/connection.ts";

const accepts = (schema: Schema.Decoder<unknown>, value: unknown) =>
  Schema.decodeUnknownExit(schema)(value)._tag === "Success";

const create = (fields: Record<string, unknown> = {}) => ({
  integration: "anthropic",
  name: "Work Anthropic",
  settings: {},
  auth: "apiKey",
  apiKey: Redacted.make("sk-key"),
  ...fields,
});

describe("a new connection", () => {
  it("comes with a key exactly when it authenticates with one", () => {
    const { apiKey: _, ...keyless } = create();

    expect(accepts(ConnectionV2.CreateInput, create())).toBe(true);
    expect(accepts(ConnectionV2.CreateInput, { ...keyless, auth: "none" })).toBe(true);
    expect(accepts(ConnectionV2.CreateInput, keyless)).toBe(false);
    expect(accepts(ConnectionV2.CreateInput, create({ auth: "none" }))).toBe(false);
  });

  it("takes settings a form gives: text, numbers, and yes or no, by name", () => {
    const settings = { url: "https://models.example/v1", port: 8080, verbose: true };

    expect(accepts(ConnectionV2.CreateInput, create({ settings }))).toBe(true);
    for (const refused of [
      { url: " https://models.example/v1" },
      { url: "a\u0000b" },
      { url: "x".repeat(2049) },
      { nested: { url: "https://models.example/v1" } },
      { list: ["a"] },
      { nothing: null },
    ]) {
      expect(
        accepts(ConnectionV2.CreateInput, create({ settings: refused })),
        JSON.stringify(refused),
      ).toBe(false);
    }
  });

  it("takes a key without surrounding space, which no error shows", () => {
    const tooLong = Schema.decodeUnknownExit(ConnectionV2.ApiKey)(
      Redacted.make(`sk-${"x".repeat(8192)}`),
    );

    expect(accepts(ConnectionV2.ApiKey, Redacted.make("sk-key"))).toBe(true);
    for (const refused of ["", " sk-key", "sk-key\n", "a\u0000b"]) {
      expect(accepts(ConnectionV2.ApiKey, Redacted.make(refused)), JSON.stringify(refused)).toBe(
        false,
      );
    }
    expect(String(tooLong)).not.toContain("xxxx");
  });
});
