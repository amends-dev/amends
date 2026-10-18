/**
 * How each message changes the app: signing in a step at a time, listing and opening workspaces,
 * following the open store, and signing out. A message that comes when the page is past it, such
 * as a code check finishing after the person signed out, changes nothing.
 */

import type * as SignIn from "@amends-dev/gateway/SignIn"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { Update } from "foldkit"
import { modifyFields } from "foldkit/struct"
import type * as Browser from "./browser.ts"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "./command.ts"
import type { Flags } from "./flags.ts"
import { Message } from "./message.ts"
import { type Model, type Opened, Page, SignInForm, StoreState, Workspaces } from "./model.ts"

export type UpdateReturn = Update.Return<Model, Message, Layer.Success<typeof Browser.layer>>

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

/** Signed out, at an empty sign-in form, or one for `email`. */
const signedOut = (apiUrl: string, email: string): Model => ({
  apiUrl,
  page: Page.SignedOut({ form: SignInForm.EnteringEmail({ email, error: Option.none() }) })
})

/** Signed in as `session`, listing their workspaces. */
const signedIn = (apiUrl: string, session: SignIn.Session): UpdateReturn => ({
  model: { apiUrl, page: Page.SignedIn({ session, workspaces: Workspaces.Loading(), opened: Option.none() }) },
  commands: [LoadWorkspaces({ apiUrl, token: session.token })]
})

/** Start from the session kept from the last visit, or signed out. */
export const init = (flags: Flags): UpdateReturn =>
  Option.match(flags.session, {
    onNone: () => ({ model: signedOut(flags.apiUrl, "") }),
    onSome: (session) => signedIn(flags.apiUrl, session)
  })

/** The sign-in form as `step` makes it, while the person is signed out; otherwise nothing. */
const atForm = (
  model: Model,
  step: (form: SignInForm) => Readonly<{ form: SignInForm; commands?: UpdateReturn["commands"] }> | undefined
): UpdateReturn =>
  Page.matchOrElse(
    model.page,
    {
      SignedOut: ({ form }) => {
        const next = step(form)
        if (next === undefined) return { model }
        return { model: { ...model, page: Page.SignedOut({ form: next.form }) }, commands: next.commands ?? [] }
      }
    },
    () => ({ model })
  )

/** The signed-in page as `change` makes it, while the person is signed in; otherwise nothing. */
const atSignedIn = (model: Model, change: (page: SignedIn) => SignedIn): UpdateReturn =>
  Page.matchOrElse(model.page, { SignedIn: (page) => ({ model: { ...model, page: change(page) } }) }, () => ({
    model
  }))

/** The open workspace's store as `change` makes it, while one is open; otherwise nothing. */
const atStore = (model: Model, change: (store: StoreState) => StoreState): UpdateReturn =>
  atSignedIn(model, (page) =>
    modifyFields(page, {
      opened: Option.map((opened: Opened) => modifyFields(opened, { store: change }))
    })
  )

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    TypedEmail: ({ email }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          { EnteringEmail: ({ error }) => ({ form: SignInForm.EnteringEmail({ email, error }) }) },
          () => undefined
        )
      ),
    SubmittedEmail: () =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            EnteringEmail: ({ email }) => ({
              form: SignInForm.SendingCode({ email }),
              commands: [SendCode({ apiUrl: model.apiUrl, email })]
            })
          },
          () => undefined
        )
      ),
    SucceededSendCode: () =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            SendingCode: ({ email }) => ({ form: SignInForm.EnteringCode({ email, code: "", error: Option.none() }) })
          },
          () => undefined
        )
      ),
    FailedSendCode: ({ error }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          { SendingCode: ({ email }) => ({ form: SignInForm.EnteringEmail({ email, error: Option.some(error) }) }) },
          () => undefined
        )
      ),
    TypedCode: ({ code }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          { EnteringCode: ({ email, error }) => ({ form: SignInForm.EnteringCode({ email, code, error }) }) },
          () => undefined
        )
      ),
    SubmittedCode: () =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            EnteringCode: ({ email, code }) => ({
              form: SignInForm.CheckingCode({ email, code }),
              commands: [CheckCode({ apiUrl: model.apiUrl, email, code })]
            })
          },
          () => undefined
        )
      ),
    SucceededSignIn: ({ session }) =>
      Page.matchOrElse(
        model.page,
        {
          SignedOut: () => {
            const next = signedIn(model.apiUrl, session)
            return { ...next, commands: [SaveSession({ apiUrl: model.apiUrl, session }), ...(next.commands ?? [])] }
          }
        },
        () => ({ model })
      ),
    FailedSignIn: ({ error }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            CheckingCode: ({ email, code }) => ({
              form: SignInForm.EnteringCode({ email, code, error: Option.some(error) })
            })
          },
          () => undefined
        )
      ),
    CompletedSaveSession: () => ({ model }),
    SucceededLoadWorkspaces: ({ memberships }) =>
      atSignedIn(model, (page) => modifyFields(page, { workspaces: () => Workspaces.Loaded({ memberships }) })),
    FailedLoadWorkspaces: ({ error }) =>
      atSignedIn(model, (page) => modifyFields(page, { workspaces: () => Workspaces.Failed({ error }) })),
    ClickedWorkspace: ({ workspaceId }) =>
      atSignedIn(model, (page) =>
        Workspaces.matchOrElse(
          page.workspaces,
          {
            Loaded: ({ memberships }) => {
              const membership = memberships.find(({ workspace }) => workspace.id === workspaceId)
              if (membership === undefined) return page
              return modifyFields(page, {
                opened: () => Option.some({ workspace: membership.workspace, store: StoreState.Opening() })
              })
            }
          },
          () => page
        )
      ),
    ClickedAllWorkspaces: () => atSignedIn(model, (page) => modifyFields(page, { opened: () => Option.none() })),
    AcquiredStore: () =>
      atStore(model, (store) =>
        StoreState.matchOrElse(store, { Opening: () => StoreState.Open({ counts: {} }) }, () => store)
      ),
    ReleasedStore: () => ({ model }),
    FailedAcquireStore: ({ error }) => atStore(model, () => StoreState.Failed({ error })),
    CountedRecords: ({ counts }) =>
      atStore(model, (store) =>
        StoreState.matchOrElse(store, { Open: () => StoreState.Open({ counts }) }, () => store)
      ),
    FailedReadStore: ({ error }) => atStore(model, () => StoreState.Failed({ error })),
    ClickedSignOut: () =>
      Page.matchOrElse(
        model.page,
        {
          SignedIn: ({ session }) => ({
            model: signedOut(model.apiUrl, session.account.email),
            commands: [SignOut({ apiUrl: model.apiUrl, session })]
          })
        },
        () => ({ model })
      ),
    CompletedSignOut: () => ({ model })
  })
