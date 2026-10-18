/**
 * The facts recorded about notifications beyond the activity that generates them: a person saw
 * one. `NotificationProjection` keeps `NotificationStore` from them, at the time the fact
 * records; reading a thread marks what was pending from it seen through `ReadStateFacts`.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as Notification from "./Notification.ts"

/**
 * A person saw their pending notification. Each is seen once.
 *
 * @category facts
 * @since 0.1.0
 */
export const Seen = Fact.make("notification.seen", {
  version: 1,
  subject: (payload) => Subject.make("notification", payload.notificationId),
  occurrence: (payload) => [payload.notificationId],
  payload: Schema.Struct({ notificationId: Notification.NotificationId })
})
