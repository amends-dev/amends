/**
 * What the person sees: signing in, their workspaces, and the open workspace's replica, how many
 * records of each kind it holds, which is all a store shows until the screens come. Markup only:
 * the headless components from `@foldkit/ui` give each control its attributes, and no styles yet.
 */

import * as Button from "@foldkit/ui/button"
import * as Input from "@foldkit/ui/input"
import * as Option from "effect/Option"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { Message } from "./message.ts"
import { type Model, type Opened, Page, SignInForm, StoreState, Workspaces } from "./model.ts"

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

const storeView = ({ workspace, store }: Opened, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel(workspace.name)],
    [
      h.h2([], [workspace.name]),
      Button.view(
        {
          onClick: Message.ClickedAllWorkspaces(),
          toView: (attributes) => h.button(attributes.button, ["All workspaces"])
        },
        h
      ),
      StoreState.match(store, {
        Opening: () => h.p([], ["Opening…"]),
        Failed: ({ error }) => h.p([h.Role("alert")], [error]),
        Open: ({ counts }) =>
          h.dl(
            [h.AriaLabel("Replica")],
            Object.entries(counts).flatMap(([kind, count]) => [h.dt([], [kind]), h.dd([], [String(count)])])
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
      Option.match(opened, { onNone: () => workspacesView(workspaces, h), onSome: (opened) => storeView(opened, h) })
    ]
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "amends",
  body: Page.match(model.page, {
    SignedOut: ({ form }) => h.main([], [signInView(form, h)]),
    SignedIn: (page) => signedInView(page, h)
  })
})
