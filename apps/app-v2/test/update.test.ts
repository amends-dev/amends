import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "../src/command.ts"
import { Message } from "../src/message.ts"
import { type Model, Page, SignInForm, StoreState, Workspaces } from "../src/model.ts"
import { update } from "../src/update.ts"
import { apiUrl, membership, session, signedIn, signedOut } from "./fixtures.ts"

describe("signing in", () => {
  it("an address gets a code, the code a session, and the session the person's workspaces", () => {
    story(
      update,
      given(signedOut),
      message(Message.TypedEmail({ email: "alice@example.com" })),
      message(Message.SubmittedEmail()),
      Command.expectExact(SendCode({ apiUrl, email: "alice@example.com" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      message(Message.TypedCode({ code: "123456" })),
      message(Message.SubmittedCode()),
      Command.expectExact(CheckCode({ apiUrl, email: "alice@example.com", code: "123456" })),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session })),
      Command.expectExact(SaveSession({ apiUrl, session }), LoadWorkspaces({ apiUrl, token: session.token })),
      Command.resolve(SaveSession, Message.CompletedSaveSession()),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedIn({
            session,
            workspaces: Workspaces.Loaded({ memberships: [membership] }),
            opened: Option.none()
          })
        )
      })
    )
  })

  it("a code that cannot be sent, or a code that is wrong, goes back a step with why", () => {
    story(
      update,
      given(signedOut),
      message(Message.TypedEmail({ email: "alice" })),
      message(Message.SubmittedEmail()),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "Enter an email address." })),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedOut({
            form: SignInForm.EnteringEmail({ email: "alice", error: Option.some("Enter an email address.") })
          })
        )
      }),
      message(Message.TypedEmail({ email: "alice@example.com" })),
      message(Message.SubmittedEmail()),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      message(Message.TypedCode({ code: "000000" })),
      message(Message.SubmittedCode()),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "That code is wrong or has expired." })),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedOut({
            form: SignInForm.EnteringCode({
              email: "alice@example.com",
              code: "000000",
              error: Option.some("That code is wrong or has expired.")
            })
          })
        )
      })
    )
  })
})

/** The workspace the person opened, if any. */
const openedIn = (model: Model) =>
  Page.matchOrElse(model.page, { SignedIn: ({ opened }) => opened }, () => Option.none())

describe("a workspace's store", () => {
  it("opens with the workspace, follows its replica, and closes when the person leaves it", () => {
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      model((model) => {
        expect(openedIn(model)).toEqual(Option.some({ workspace: membership.workspace, store: StoreState.Opening() }))
      }),
      message(Message.AcquiredStore()),
      message(Message.CountedRecords({ counts: { Workspace: 1, Member: 1 } })),
      model((model) => {
        expect(openedIn(model)).toEqual(
          Option.some({
            workspace: membership.workspace,
            store: StoreState.Open({ counts: { Workspace: 1, Member: 1 } })
          })
        )
      }),
      message(Message.ClickedAllWorkspaces()),
      model((model) => {
        expect(Page.isAnyOf(["SignedIn"])(model.page)).toBe(true)
        expect(openedIn(model)).toEqual(Option.none())
      })
    )
  })

  it("signing out leaves the address in the form and forgets the session", () => {
    story(
      update,
      given(signedIn),
      message(Message.ClickedSignOut()),
      Command.expectExact(SignOut({ apiUrl, session })),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedOut({ form: SignInForm.EnteringEmail({ email: session.account.email, error: Option.none() }) })
        )
      })
    )
  })
})
