/**
 * How each message changes the app: signing in a step at a time, listing and opening workspaces,
 * following the open store, and signing out. A message that comes when the page is past it, such
 * as a code check finishing after the person signed out, changes nothing.
 */

import type * as SignIn from "@amends-dev/gateway/SignIn"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { Update } from "foldkit"
import type * as ManagedResource from "foldkit/managedResource"
import { modifyFields } from "foldkit/struct"
import type * as Browser from "./browser.ts"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "./command.ts"
import type { Flags } from "./flags.ts"
import { Message } from "./message.ts"
import {
  type Model,
  type OpenGroup,
  type Opened,
  type OpenThread,
  Page,
  SignInForm,
  StoreState,
  Workspaces
} from "./model.ts"
import { Dismiss, PostReply, StartThread, type StoreResource } from "./store.ts"

export type UpdateReturn = Update.Return<
  Model,
  Message,
  Layer.Success<typeof Browser.layer> | ManagedResource.ServiceOf<typeof StoreResource>
>

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

/** The open workspace as `change` makes it, while one is open; otherwise nothing. */
const atOpened = (model: Model, change: (opened: Opened) => Opened): UpdateReturn =>
  atSignedIn(model, (page) => modifyFields(page, { opened: Option.map(change) }))

/** The open workspace's store as `change` makes it, while one is open; otherwise nothing. */
const atStore = (model: Model, change: (store: StoreState) => StoreState): UpdateReturn =>
  atOpened(model, (opened) => modifyFields(opened, { store: change }))

/** The open group as `change` makes it, while one is open; otherwise nothing. */
const atGroup = (model: Model, change: (group: OpenGroup) => OpenGroup): UpdateReturn =>
  atOpened(model, (opened) => modifyFields(opened, { group: Option.map(change) }))

/** The open thread as `change` makes it, while one is open; otherwise nothing. */
const atThread = (model: Model, change: (thread: OpenThread) => OpenThread): UpdateReturn =>
  atGroup(model, (group) => modifyFields(group, { thread: Option.map(change) }))

/** The open group, if one is. */
const groupIn = (model: Model): Option.Option<OpenGroup> =>
  Page.matchOrElse(model.page, { SignedIn: ({ opened }) => Option.flatMap(opened, ({ group }) => group) }, () =>
    Option.none()
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
                opened: () =>
                  Option.some({
                    workspace: membership.workspace,
                    memberId: membership.member.id,
                    store: StoreState.Opening(),
                    groups: [],
                    members: [],
                    actions: [],
                    notice: Option.none(),
                    group: Option.none()
                  })
              })
            }
          },
          () => page
        )
      ),
    ClickedAllWorkspaces: () => atSignedIn(model, (page) => modifyFields(page, { opened: () => Option.none() })),
    AcquiredStore: () =>
      atStore(model, (store) => StoreState.matchOrElse(store, { Opening: () => StoreState.Open() }, () => store)),
    ReleasedStore: () => ({ model }),
    FailedAcquireStore: ({ error }) => atStore(model, () => StoreState.Failed({ error })),
    FailedReadStore: ({ error }) => atStore(model, () => StoreState.Failed({ error })),
    GotGroups: ({ groups }) => atOpened(model, (opened) => modifyFields(opened, { groups: () => groups })),
    GotMembers: ({ members }) => atOpened(model, (opened) => modifyFields(opened, { members: () => members })),
    GotActions: ({ actions }) => atOpened(model, (opened) => modifyFields(opened, { actions: () => actions })),
    GotThreads: ({ groupId, threads }) =>
      atGroup(model, (group) => (group.groupId === groupId ? modifyFields(group, { threads: () => threads }) : group)),
    GotMessages: ({ threadId, messages }) =>
      atThread(model, (thread) =>
        thread.threadId === threadId ? modifyFields(thread, { messages: () => messages }) : thread
      ),
    ClickedGroup: ({ groupId }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, {
          group: () => Option.some({ groupId, threads: [], draft: "", thread: Option.none() })
        })
      ),
    ClickedThread: ({ threadId }) =>
      atGroup(model, (group) =>
        modifyFields(group, { thread: () => Option.some({ threadId, messages: [], draft: "" }) })
      ),
    ClickedAllThreads: () => atGroup(model, (group) => modifyFields(group, { thread: () => Option.none() })),
    TypedThread: ({ text }) => atGroup(model, (group) => modifyFields(group, { draft: () => text })),
    SubmittedThread: () =>
      Option.match(groupIn(model), {
        onNone: () => ({ model }),
        onSome: ({ groupId, draft }) => ({
          ...atGroup(model, (group) => modifyFields(group, { draft: () => "" })),
          commands: [StartThread({ groupId, text: draft })]
        })
      }),
    TypedReply: ({ text }) => atThread(model, (thread) => modifyFields(thread, { draft: () => text })),
    SubmittedReply: () =>
      Option.match(
        Option.flatMap(groupIn(model), ({ thread }) => thread),
        {
          onNone: () => ({ model }),
          onSome: ({ threadId, draft }) => ({
            ...atThread(model, (thread) => modifyFields(thread, { draft: () => "" })),
            commands: [PostReply({ threadId, text: draft })]
          })
        }
      ),
    WroteAction: () => atOpened(model, (opened) => modifyFields(opened, { notice: () => Option.none() })),
    FailedWriteAction: ({ error }) =>
      atOpened(model, (opened) => modifyFields(opened, { notice: () => Option.some(error) })),
    ClickedDismiss: ({ key }) => ({ model, commands: [Dismiss({ key })] }),
    CompletedDismiss: () => ({ model }),
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
