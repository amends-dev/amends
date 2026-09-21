import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { ThreadMessage } from "./message.ts";
export const Published = Fact.make("thread.message.published", {
  version: 1,
  subject: (payload) => Subject.make("thread-message", payload.id),
  occurrence: (payload) => [payload.id],
  payload: ThreadMessage.Record,
});
export * as ThreadMessageFacts from "./facts.ts";
