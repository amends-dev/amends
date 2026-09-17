import { Effect } from "effect";

export { Codec } from "./journal/codec.ts";
export { Commit } from "./journal/commit.ts";
export { Entry } from "./journal/entry.ts";
export { Event } from "./journal/event.ts";
export { Fact } from "./journal/fact.ts";
export { Journal } from "./journal/journal.ts";
export { Log } from "./journal/log.ts";
export { Projection } from "./journal/projection.ts";
export { Store } from "./journal/store.ts";
export { Transaction } from "./journal/transaction.ts";

export const program = Effect.log("amends-v2 is running with Effect.");
