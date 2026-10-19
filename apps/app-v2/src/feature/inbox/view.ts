import { pane } from "@amends-dev/design/pane"
import { button, errorView } from "../../controls.ts"
import { InboxComposition } from "./composition.ts"
import { describeNotification, Message, waitingNewestFirst } from "./definition.ts"

/** The notifications still waiting for the person, newest first, to open, or to mark seen one or all at once. */
export const view = InboxComposition.makeView((model, h) => {
  const items = waitingNewestFirst(model)
  return pane(h, {
    variant: "main",
    label: "Inbox",
    header: { title: "Inbox", icon: "mark-mail" },
    body: [
      errorView(model.notice, h),
      items.length === 0
        ? h.p([], ["Nothing new."])
        : h.div(
            [],
            [
              button(h, "Mark all seen", Message.ClickedMarkAllSeen()),
              h.ul(
                [h.AriaLabel("Notifications")],
                items.map((item) =>
                  h.keyed("li")(
                    item.notification.id,
                    [],
                    [
                      h.p([], [describeNotification(item, model)]),
                      item.notification.thread === undefined
                        ? h.empty
                        : button(h, "Open", Message.ClickedOpen({ notificationId: item.notification.id })),
                      button(h, "Mark seen", Message.ClickedMarkSeen({ notificationId: item.notification.id }))
                    ]
                  )
                )
              )
            ]
          )
    ]
  })
})
