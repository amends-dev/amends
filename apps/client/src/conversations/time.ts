import { DateTime } from "effect";

/** A decoded instant as a JavaScript date, for presentation to format. */
export const toDate = (instant: DateTime.Utc): Date => DateTime.toDateUtc(instant);
