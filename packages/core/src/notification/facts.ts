import { Schema } from "effect";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Notification } from "./notification.ts";

export const Acknowledged = Fact.make("notification.acknowledged", {
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
