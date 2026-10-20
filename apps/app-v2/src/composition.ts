/**
 * How the pages join the app: signing in gives a session to keep and the person's workspaces to
 * pick from; picking one opens it; leaving it goes back to the list.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { SignOut } from "./command.ts"
import { ApplicationDefinition } from "./definition.ts"
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
        args: [],
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

/** Go to the sign-in form with the address kept and `notice` over it, if any, and forget the session, the person's stores, and their sync identity. */
const signOutWithNotice = (notice: string | undefined) =>
  ApplicationDefinition.step((model: Model) =>
    SignInBinding.init({
      args: [Page.matchOrElse(model.page, { SignedIn: ({ account }) => account.email }, () => ""), notice],
      toParentModel: (signIn) => modifyFields(model, { page: () => Page.SignedOut({ signIn }) }),
      commands: [SignOut()]
    })
  )

/** Signing out leaves the address in the form, and forgets the session, the person's stores, and their sync identity. */
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

const foldWorkspaceOutMessage = (
  _workspaceId: WorkspaceId.WorkspaceId,
  outMessage: typeof WorkspaceBlock.OutMessage.Type
) =>
  WorkspaceBlock.OutMessage.match(outMessage, {
    ClosedWorkspace: () =>
      ApplicationDefinition.step((model: Model) => ({
        model: atSignedIn(model, (page) => modifyFields(page, { workspace: () => Option.none() }))
      })),
    RequestedSignOut: () => signOut
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
