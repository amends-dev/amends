import { Effect, Schema } from "effect";

/**
 * Construct a decoder for the `record` column of selected rows. Each record is stored
 * as the JSON of its schema's encoded form, so decoding with the schema checks
 * brands, unions, and invariants: what the database holds becomes what core trusts.
 *
 * @category constructors
 */
export const makeRecordDecoder = <A>(codec: Schema.Codec<A, string>) => {
  const rows = Schema.Array(Schema.Struct({ record: codec }));
  const decode: (input: unknown) => Effect.Effect<ReadonlyArray<A>, Schema.SchemaError> = (input) =>
    Effect.map(Schema.decodeUnknownEffect(rows)(input), (decoded) =>
      decoded.map((row) => row.record),
    );
  return decode;
};
