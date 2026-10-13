import * as Schema from "effect/Schema";

/** How many rows one page may ask for: 1 to 100. */
export const limit = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100));
