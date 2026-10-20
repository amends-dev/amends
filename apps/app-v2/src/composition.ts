/**
 * How the pages join the app: signing in gives a session to keep and the person's workspaces to
 * pick from; picking one opens it; leaving it goes back to the list.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import type { Appearance } from "./appearance.ts"
import { KeepAppearance, ShowAppearance, SignOut } from "./command.ts"
import { ApplicationDefinition } from "./definition.ts"
import type { ReportedAccountEntry } from "./feature/settings/definition.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

/** The signed-in page as `change` makes it, while the person is signed in; otherwise as it is. */
const atSignedIn = (model: Model, change: (page: SignedIn) => SignedIn): Model =>
  modifyFields(model, { page: (page) => Page.matchOrElse(page, { SignedIn: change }, () => page) })

const foldSignInOutMessage = SignInBlock.OutMessage.match({
  SignedIn: ({ session }) =>
    ApplicationDefinition.step((model: Model) =>
      WorkspacesBinding.init({
        args: [session.account.email],
        toParentModel: (workspaces) =>
          modifyFields(model, {
            page: () => Page.SignedIn({ account: session.account, workspaces, workspace: Option.none() })
          })
      })
    )
})

export const SignInBinding = ApplicationDefinition.bindChild(SignInBlock, {
  read: (model) =>
    Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => Option.some(signIn) }, () => Option.none()),
  write: (model, nextSignIn) =>
    modifyFields(model, {
      page: (page) => Page.matchOrElse(page, { SignedOut: () => Page.SignedOut({ signIn: nextSignIn }) }, () => page)
    }),
  outMessage: { fold: foldSignInOutMessage }
})

/**
 * Go to the sign-in form with the address kept and `notice` over it, if any, and forget the session, the person's
 * stores, and their sync identity.
 */
const signOutWithNotice = (notice: string | undefined) =>
  ApplicationDefinition.step((model: Model) =>
    SignInBinding.init({
      args: [Page.matchOrElse(model.page, { SignedIn: ({ account }) => account.email }, () => ""), notice],
      toParentModel: (signIn) => modifyFields(model, { page: () => Page.SignedOut({ signIn }) }),
      commands: [SignOut()]
    })
  )

/**
 * Signing out leaves the address in the form, and forgets the session, the person's stores, and their sync identity.
 */
export const signOut = signOutWithNotice(undefined)

/** A session the host no longer knows ends as signing out does, and says so over the form. */
export const endSession = signOutWithNotice("Your session has ended. Sign in again.")

const foldWorkspacesOutMessage = WorkspacesBlock.OutMessage.match({
  EndedSession: () => endSession,
  OpenedWorkspace: ({ membership }) =>
    ApplicationDefinition.step((model: Model) =>
      WorkspaceBinding.init({
        key: membership.workspace.id,
        args: [membership.workspace.id, membership.member.id, membership.workspace.name, model.viewport],
        toParentModel: (workspace) =>
          atSignedIn(model, (page) =>
            modifyFields(page, {
              workspace: () => Option.some({ workspaceId: membership.workspace.id, model: workspace })
            })
          )
      })
    )
})

export const WorkspacesBinding = ApplicationDefinition.bindChild(WorkspacesBlock, {
  read: (model) =>
    Page.matchOrElse(model.page, { SignedIn: ({ workspaces }) => Option.some(workspaces) }, () => Option.none()),
  write: (model, nextWorkspaces) =>
    atSignedIn(model, (page) => modifyFields(page, { workspaces: () => nextWorkspaces })),
  outMessage: { fold: foldWorkspacesOutMessage }
})

/** Choose the Appearance: the page shows it and the browser keeps it for the next visit. */
const chooseAppearance = (appearance: Appearance) =>
  ApplicationDefinition.step((model: Model) => ({
    model: modifyFields(model, { appearance: () => appearance }),
    commands: [ShowAppearance({ appearance }), KeepAppearance({ appearance })]
  }))

/** Leave the open workspace for the list of the person's workspaces. */
const closeWorkspace = ApplicationDefinition.step((model: Model) => ({
  model: atSignedIn(model, (page) => modifyFields(page, { workspace: () => Option.none() }))
}))

/**
 * What choosing an entry of the account menu does: an Appearance is shown and kept, another workspace is the list of
 * workspaces, the workspace's settings are the open workspace's to show, and signing out is signing out.
 */
// NOTE: Workspace settings comes back to the workspace page as an operation, not handled where the menu reports it: a
// fold that switches the page's destination takes the page's update past the depth TypeScript instantiates (TS2589).
const chooseAccountEntry = (workspaceId: WorkspaceId.WorkspaceId, entry: ReportedAccountEntry) =>
  Match.value(entry).pipe(
    Match.whenOr("System", "Light", "Dark", chooseAppearance),
    Match.when("SwitchWorkspace", () => closeWorkspace),
    Match.when("WorkspaceSettings", () => WorkspaceBinding.requestWorkspaceSettings(workspaceId)),
    Match.when("SignOut", () => signOut),
    Match.exhaustive
  )

const foldWorkspaceOutMessage = (
  workspaceId: WorkspaceId.WorkspaceId,
  outMessage: typeof WorkspaceBlock.OutMessage.Type
) =>
  WorkspaceBlock.OutMessage.match(outMessage, {
    ClosedWorkspace: () => closeWorkspace,
    ChoseAccountEntry: ({ entry }) => chooseAccountEntry(workspaceId, entry)
  })

export const WorkspaceBinding = ApplicationDefinition.bindChild(WorkspaceBlock, {
  readAll: (model) =>
    Page.matchOrElse(model.page, { SignedIn: ({ workspace }) => Option.toArray(workspace) }, () => []),
  key: (opened) => opened.workspaceId,
  keySchema: WorkspaceId.WorkspaceId,
  read: (opened) => opened.model,
  writeAt: (model, workspaceId, nextWorkspace) =>
    atSignedIn(model, (page) =>
      modifyFields(page, {
        workspace: Option.map((opened) =>
          opened.workspaceId === workspaceId ? { workspaceId, model: nextWorkspace } : opened
        )
      })
    ),
  outMessage: { fold: foldWorkspaceOutMessage }
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [SignInBinding, WorkspacesBinding, WorkspaceBinding]
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
