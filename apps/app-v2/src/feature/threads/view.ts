import * as Button from "@foldkit/ui/button"
import * as Option from "effect/Option"
import { errorView, sending } from "../../controls.ts"
import { statusLabel } from "../../seen.ts"
import { ComposerBinding, ThreadsComposition } from "./composition.ts"
import { labelOf, Message } from "./definition.ts"

/** The group's threads, and the composer to start one. */
export const view = ThreadsComposition.makeView((model, h) =>
  h.div(
    [],
    [
      errorView(model.notice, h),
      model.threads.length === 0
        ? h.p([], ["No threads yet."])
        : h.ul(
            [h.AriaLabel("Threads")],
            model.threads.map((item) =>
              h.keyed("li")(
                item.thread.id,
                [],
                [
                  Button.view(
                    {
                      onClick: Message.ClickedThread({ threadId: item.thread.id }),
                      toView: (attributes) => h.button(attributes.button, [labelOf(item)])
                    },
                    h
                  ),
                  Option.match(item.task, {
                    onNone: () => h.empty,
                    onSome: (task) => h.span([], [` · ${statusLabel[task.status]}`])
                  }),
                  sending(item.pending, h),
                  item.unread > 0 ? h.span([], [` · ${item.unread} new`]) : h.empty
                ]
              )
            )
          ),
      h.block(
        ComposerBinding.embedView({
          slotId: "composer",
          model: model.composer,
          viewInputs: { label: "Start a thread", submitLabel: "Start" }
        })
      )
    ]
  )
)
