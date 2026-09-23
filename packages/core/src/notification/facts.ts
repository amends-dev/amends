import { Schema } from "effect";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Identity } from "../identity/identity.ts";
import { Notification } from "./notification.ts";

/** Only the recipient learns of their acknowledgment; contact and triage handling stays internal. */
export const Acknowledged = Fact.make("notification.acknowledged", {
  audience: ({ recipient }) =>
    recipient._tag === "Human" || recipient._tag === "Agent"
      ? [Identity.audienceOf(recipient)]
      : [],
  version: 1,
  subject: (payload) => Subject.make("notification", payload.notificationId),
  occurrence: (payload) => [payload.notificationId],
  payload: Schema.Struct({
    workspaceId: Notification.Record.fields.workspaceId,
    notificationId: Notification.Id,
    recipient: Notification.Recipient,
    acknowledgment: Notification.Acknowledgment,
  }).check(
    Schema.makeFilter(
      (payload) =>
        Notification.acceptsAcknowledgment(payload.recipient, payload.acknowledgment.outcome) ||
        "Acknowledgment outcome does not match the recipient",
    ),
  ),
});

export * as NotificationFacts from "./facts.ts";
