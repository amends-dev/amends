import { Schema } from "effect";
import { Thread } from "../thread/thread.ts";

/** The outcomes `SignalService` reports that a caller can act on; schemas only, for contracts. */
/** Missing and inaccessible threads share this outcome. */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "SignalService.ThreadNotFound",
  { threadId: Thread.Id },
) {}

export * as SignalErrors from "./errors.ts";
