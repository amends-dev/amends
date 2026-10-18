/**
 * What the person sees: signing in, their workspaces, and the open workspace: its groups, a group's
 * threads, and a thread's messages, with what the person started or posted shown at once, marked
 * as sending until the server has it, and what the server refused, with why. Markup only: the
 * headless components from `@foldkit/ui` give each control its attributes, and no styles yet.
 */

import type { Group } from "@amends-dev/core/group"
import { ThreadMessage } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import * as Button from "@foldkit/ui/button"
import * as Input from "@foldkit/ui/input"
import * as Textarea from "@foldkit/ui/textarea"
import * as Option from "effect/Option"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { Message } from "./message.ts"
import {
  type ActionItem,
  type Model,
  type OpenGroup,
  type Opened,
  type OpenThread,
  Page,
  SignInForm,
  StoreState,
  type ThreadItem,
  Workspaces
} from "./model.ts"

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

const errorView = (error: Option.Option<string>, h: HtmlBuilder<Message>): Html =>
  Option.match(error, { onNone: () => h.empty, onSome: (text) => h.p([h.Role("alert")], [text]) })

const field = (
  h: HtmlBuilder<Message>,
  config: Readonly<{ id: string; label: string; type: string; value: string; onInput: (value: string) => Message }>,
  error: Option.Option<string>
) =>
  Input.view(
    {
      id: config.id,
      type: config.type,
      value: config.value,
      onInput: config.onInput,
      isInvalid: Option.isSome(error),
      isAutofocus: true,
      toView: (attributes) =>
        h.div([], [h.label(attributes.label, [config.label]), h.input(attributes.input), errorView(error, h)])
    },
    h
  )

const submit = (h: HtmlBuilder<Message>, label: string) =>
  Button.view({ type: "submit", toView: (attributes) => h.button(attributes.button, [label]) }, h)

const signInView = (form: SignInForm, h: HtmlBuilder<Message>): Html =>
  SignInForm.match(form, {
    EnteringEmail: ({ email, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedEmail())],
        [
          h.h1([], ["Sign in"]),
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: email,
              onInput: (email) => Message.TypedEmail({ email })
            },
            error
          ),
          submit(h, "Send a code")
        ]
      ),
    SendingCode: ({ email }) => h.p([], [`Sending a code to ${email}…`]),
    EnteringCode: ({ email, code, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedCode())],
        [
          h.h1([], ["Sign in"]),
          h.p([], [`Enter the code sent to ${email}.`]),
          field(
            h,
            { id: "code", label: "Code", type: "text", value: code, onInput: (code) => Message.TypedCode({ code }) },
            error
          ),
          submit(h, "Sign in")
        ]
      ),
    CheckingCode: () => h.p([], ["Checking the code…"])
  })

const workspacesView = (workspaces: Workspaces, h: HtmlBuilder<Message>): Html =>
  Workspaces.match(workspaces, {
    Loading: () => h.p([], ["Loading your workspaces…"]),
    Failed: ({ error }) => h.p([h.Role("alert")], [error]),
    Loaded: ({ memberships }) =>
      memberships.length === 0
        ? h.p([], ["You belong to no workspace yet."])
        : h.ul(
            [h.AriaLabel("Workspaces")],
            memberships.map(({ workspace }) =>
              h.keyed("li")(
                workspace.id,
                [],
                [
                  Button.view(
                    {
                      onClick: Message.ClickedWorkspace({ workspaceId: workspace.id }),
                      toView: (attributes) => h.button(attributes.button, [workspace.name])
                    },
                    h
                  )
                ]
              )
            )
          )
  })

const textarea = (
  h: HtmlBuilder<Message>,
  config: Readonly<{ id: string; label: string; value: string; onInput: (value: string) => Message }>
) =>
  Textarea.view(
    {
      id: config.id,
      value: config.value,
      rows: 3,
      onInput: config.onInput,
      toView: (attributes) => h.div([], [h.label(attributes.label, [config.label]), h.textarea(attributes.textarea)])
    },
    h
  )

/** A group's name: a team's own, or a direct group's members by their names here. */
const groupName = (group: Group.Group, members: ReadonlyArray<Member.Member>) =>
  "name" in group
    ? group.name
    : group.memberIds.map((id) => members.find((member) => member.id === id)?.name ?? "Someone").join(", ")

/** Who wrote a message, by their name here. */
const authorName = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>) =>
  ThreadMessage.Author.match(message.author, {
    Member: ({ memberId }) => members.find((member) => member.id === memberId)?.name ?? "Someone",
    Contact: () => "A contact"
  })

const textOf = (message: ThreadMessage.ThreadMessage) =>
  ThreadMessage.Content.match(message.content, { Text: ({ text }) => text, Deleted: () => "This message was deleted." })

/** A thread as its group lists it: its title, or its opening message. */
const threadLabel = ({ thread, opening }: ThreadItem) =>
  thread.title ?? Option.match(opening, { onNone: () => "A thread", onSome: textOf })

const sending = (pending: boolean, h: HtmlBuilder<Message>): Html => (pending ? h.span([], [" · Sending…"]) : h.empty)

const actionsView = (actions: ReadonlyArray<ActionItem>, notice: Option.Option<string>, h: HtmlBuilder<Message>) => {
  const refused = actions.flatMap((action) =>
    Option.match(action.rejection, { onNone: () => [], onSome: (why) => [{ ...action, why }] })
  )
  return h.div(
    [h.AriaLive("polite")],
    [
      Option.match(notice, { onNone: () => h.empty, onSome: (text) => h.p([h.Role("alert")], [text]) }),
      ...refused.map(({ key, what, text, why }) =>
        h.keyed("div")(
          key,
          [h.Role("alert")],
          [
            h.p([], [`Couldn't ${what}: ${why}`]),
            Option.match(text, { onNone: () => h.empty, onSome: (text) => h.blockquote([], [text]) }),
            Button.view(
              {
                onClick: Message.ClickedDismiss({ key }),
                toView: (attributes) => h.button(attributes.button, ["Dismiss"])
              },
              h
            )
          ]
        )
      )
    ]
  )
}

const threadView = (thread: OpenThread, members: ReadonlyArray<Member.Member>, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel("Thread")],
    [
      Button.view(
        { onClick: Message.ClickedAllThreads(), toView: (attributes) => h.button(attributes.button, ["All threads"]) },
        h
      ),
      h.ol(
        [h.AriaLabel("Messages")],
        thread.messages.map(({ message, pending }) =>
          h.keyed("li")(
            message.id,
            [],
            [h.p([], [h.strong([], [authorName(message, members)]), sending(pending, h)]), h.p([], [textOf(message)])]
          )
        )
      ),
      h.form(
        [h.OnSubmit(Message.SubmittedReply())],
        [
          textarea(h, {
            id: "reply",
            label: "Reply",
            value: thread.draft,
            onInput: (text) => Message.TypedReply({ text })
          }),
          submit(h, "Reply")
        ]
      )
    ]
  )

const groupView = (group: OpenGroup, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const found = opened.groups.find(({ id }) => id === group.groupId)
  return h.section(
    [h.AriaLabel("Group")],
    [
      h.h3([], [found === undefined ? "A group" : groupName(found, opened.members)]),
      Option.match(group.thread, {
        onSome: (thread) => threadView(thread, opened.members, h),
        onNone: () =>
          h.div(
            [],
            [
              group.threads.length === 0
                ? h.p([], ["No threads yet."])
                : h.ul(
                    [h.AriaLabel("Threads")],
                    group.threads.map((item) =>
                      h.keyed("li")(
                        item.thread.id,
                        [],
                        [
                          Button.view(
                            {
                              onClick: Message.ClickedThread({ threadId: item.thread.id }),
                              toView: (attributes) => h.button(attributes.button, [threadLabel(item)])
                            },
                            h
                          ),
                          sending(item.pending, h)
                        ]
                      )
                    )
                  ),
              h.form(
                [h.OnSubmit(Message.SubmittedThread())],
                [
                  textarea(h, {
                    id: "thread",
                    label: "Start a thread",
                    value: group.draft,
                    onInput: (text) => Message.TypedThread({ text })
                  }),
                  submit(h, "Start")
                ]
              )
            ]
          )
      })
    ]
  )
}

const workspaceView = (opened: Opened, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel(opened.workspace.name)],
    [
      h.h2([], [opened.workspace.name]),
      Button.view(
        {
          onClick: Message.ClickedAllWorkspaces(),
          toView: (attributes) => h.button(attributes.button, ["All workspaces"])
        },
        h
      ),
      StoreState.match(opened.store, {
        Opening: () => h.p([], ["Opening…"]),
        Failed: ({ error }) => h.p([h.Role("alert")], [error]),
        Open: () =>
          h.div(
            [],
            [
              actionsView(opened.actions, opened.notice, h),
              h.nav(
                [h.AriaLabel("Groups")],
                [
                  h.ul(
                    [],
                    opened.groups.map((group) =>
                      h.keyed("li")(
                        group.id,
                        [],
                        [
                          Button.view(
                            {
                              onClick: Message.ClickedGroup({ groupId: group.id }),
                              toView: (attributes) => h.button(attributes.button, [groupName(group, opened.members)])
                            },
                            h
                          )
                        ]
                      )
                    )
                  )
                ]
              ),
              Option.match(opened.group, { onNone: () => h.empty, onSome: (group) => groupView(group, opened, h) })
            ]
          )
      })
    ]
  )

const signedInView = ({ session, workspaces, opened }: SignedIn, h: HtmlBuilder<Message>): Html =>
  h.main(
    [],
    [
      h.header(
        [],
        [
          h.p([], [session.account.email]),
          Button.view(
            { onClick: Message.ClickedSignOut(), toView: (attributes) => h.button(attributes.button, ["Sign out"]) },
            h
          )
        ]
      ),
      Option.match(opened, {
        onNone: () => workspacesView(workspaces, h),
        onSome: (opened) => workspaceView(opened, h)
      })
    ]
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "amends",
  body: Page.match(model.page, {
    SignedOut: ({ form }) => h.main([], [signInView(form, h)]),
    SignedIn: (page) => signedInView(page, h)
  })
})
