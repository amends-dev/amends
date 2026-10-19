/**
 * How the pages join the app: signing in gives a session to keep and the person's workspaces to
 * pick from; picking one opens it; leaving it goes back to the list.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { ApplicationDefinition } from "./definition.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

/** The signed-in page as `change` makes it, while the person is signed in; otherwise as it is. */
const atSignedIn = (model: Model, change: (page: SignedIn) => SignedIn): Model => ({
  page: Page.matchOrElse(model.page, { SignedIn: change }, () => model.page)
})

const foldSignInOutMessage = SignInBlock.OutMessage.match({
  SignedIn: ({ session }) =>
    ApplicationDefinition.step(() =>
      WorkspacesBinding.init({
        args: [],
        toParentModel: (workspaces) => ({
          page: Page.SignedIn({ account: session.account, workspaces, workspace: Option.none() })
        })
      })
    )
})

export const SignInBinding = ApplicationDefinition.bindChild(SignInBlock, {
  read: (model) =>
    Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => Option.some(signIn) }, () => Option.none()),
  write: (model, nextSignIn) => ({
    page: Page.matchOrElse(model.page, { SignedOut: () => Page.SignedOut({ signIn: nextSignIn }) }, () => model.page)
  }),
  outMessage: { fold: foldSignInOutMessage }
})

const foldWorkspacesOutMessage = WorkspacesBlock.OutMessage.match({
  OpenedWorkspace: ({ membership }) =>
    ApplicationDefinition.step((model: Model) =>
      WorkspaceBinding.init({
        key: membership.workspace.id,
        args: [membership.workspace.id, membership.member.id, membership.workspace.name],
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
      }))
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
