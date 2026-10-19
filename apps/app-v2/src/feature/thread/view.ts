import { ThreadMessage } from "@amends-dev/core/thread"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, errorView, field, sending, submit, textarea } from "../../controls.ts"
import { ReplyBinding, TaskBinding, ThreadComposition, type ThreadViewBuilder, TurnsBinding } from "./composition.ts"
import { authorName, Message, type MessageItem, type Model, typingIn } from "./definition.ts"

const textOf = (message: ThreadMessage.ThreadMessage) =>
  ThreadMessage.Content.match(message.content, { Text: ({ text }) => text, Deleted: () => "This message was deleted." })

/** The thread's title, or its opening message, and the form to change it while the person renames it. */
const titleView = (model: Model, h: ThreadViewBuilder): Html => {
  const title = Option.getOrElse(model.title, () =>
    Option.match(Option.fromUndefinedOr(model.messages.at(0)), {
      onNone: () => "A thread",
      onSome: ({ message }) => textOf(message)
    })
  )
  return Option.match(model.renaming, {
    onNone: () => h.div([], [h.h4([], [title]), button(h, "Rename", Message.ClickedRename())]),
    onSome: (draft) =>
      h.form(
        [h.OnSubmit(Message.SubmittedRename())],
        [
          field(
            h,
            {
              id: "title",
              label: "Title",
              type: "text",
              value: draft,
              onInput: (title) => Message.TypedTitle({ title })
            },
            Option.none()
          ),
          submit(h, "Save"),
          button(h, "Cancel", Message.ClickedCancelRename())
        ]
      )
  })
}

/** The person's part in the thread: following it, or not, and whether a change to that is on its way. */
const followView = (model: Model, h: ThreadViewBuilder): Html =>
  Option.match(model.following, {
    onNone: () => button(h, "Follow", Message.ClickedFollow()),
    onSome: ({ active, pending }) =>
      pending
        ? h.span([], ["Updating…"])
        : active
          ? button(h, "Unfollow", Message.ClickedUnfollow())
          : button(h, "Follow", Message.ClickedFollow())
  })

/** A message, with editing and deleting for the person's own, and the form to change it while they edit it. */
const messageView = ({ message, pending }: MessageItem, model: Model, h: ThreadViewBuilder): Html => {
  const own =
    ThreadMessage.Author.matchOrElse(
      message.author,
      { Member: ({ memberId }) => memberId === model.memberId },
      () => false
    ) && ThreadMessage.Content.matchOrElse(message.content, { Text: () => true }, () => false)
  const editing = Option.filter(model.editing, ({ messageId }) => messageId === message.id)
  const edited = ThreadMessage.Content.matchOrElse(
    message.content,
    { Text: ({ editedAt }) => editedAt !== null },
    () => false
  )
  return h.keyed("li")(
    message.id,
    [],
    [
      h.p(
        [],
        [h.strong([], [authorName(model, message)]), sending(pending, h), edited ? h.span([], [" · edited"]) : h.empty]
      ),
      Option.match(editing, {
        onSome: ({ draft }) =>
          h.form(
            [h.OnSubmit(Message.SubmittedEdit())],
            [
              textarea(h, { id: "edit", label: "Edit", value: draft, onInput: (text) => Message.TypedEdit({ text }) }),
              submit(h, "Save"),
              button(h, "Cancel", Message.ClickedCancelEdit())
            ]
          ),
        onNone: () =>
          h.div(
            [],
            [
              h.p([], [textOf(message)]),
              ...(own && !pending
                ? [
                    button(h, "Edit", Message.ClickedEdit({ messageId: message.id })),
                    button(h, "Delete", Message.ClickedDelete({ messageId: message.id }))
                  ]
                : [])
            ]
          )
      })
    ]
  )
}

/** Who types in the thread now, besides the person. */
const typingView = (names: ReadonlyArray<string>, h: ThreadViewBuilder): Html =>
  names.length === 0
    ? h.empty
    : h.p([h.AriaLive("polite")], [`${names.join(" and ")} ${names.length === 1 ? "is" : "are"} typing…`])

export const view = ThreadComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel("Thread")],
    [
      titleView(model, h),
      followView(model, h),
      h.block(TaskBinding.embedView({ slotId: "task", model: model.task })),
      h.block(TurnsBinding.embedView({ slotId: "turns", model: model.turns })),
      errorView(model.notice, h),
      h.ol(
        [h.AriaLabel("Messages")],
        model.messages.map((item) => messageView(item, model, h))
      ),
      typingView(typingIn(model), h),
      h.block(
        ReplyBinding.embedView({
          slotId: "reply",
          model: model.reply,
          viewInputs: { label: "Reply", submitLabel: "Reply" }
        })
      )
    ]
  )
)
