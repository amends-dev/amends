/**
 * Root navigation: authenticate, resolve membership through the workspace directory, restore the
 * latest URL through page operations, and record destinations reported by the open workspace.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import type { Appearance } from "./appearance.ts"
import { KeepAppearance, ShowAppearance, SignOut, Navigate } from "./command.ts"
import { ApplicationDefinition } from "./definition.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import type { AppAccountEntry } from "./page/workspace/definition.ts"
import { destinationOf } from "./page/workspace/navigation.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"
import { Workspaces } from "./page/workspaces/definition.ts"
import { type Destination, Route, href, home, destinationPath, sameRoute } from "./route.ts"

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

/** The signed-in page as `change` makes it, while the person is signed in; otherwise as it is. */
const atSignedIn = (model: Model, change: (page: SignedIn) => SignedIn): Model =>
  modifyFields(model, { page: (page) => Page.matchOrElse(page, { SignedIn: change }, () => page) })

const foldSignInOutMessage = SignInBlock.OutMessage.match({
  SignedIn: ({ session }) =>
    ApplicationDefinition.makeStep((model: Model) =>
      WorkspacesBinding.init({
        args: [session.account.email],
        toParentModel: (workspaces) =>
          modifyFields(model, {
            page: () => Page.SignedIn({ account: session.account, workspaces, workspace: Option.none() })
          })
      })
    )
})

export const SignInBinding = ApplicationDefinition.makeBinding(SignInBlock, {
  read: (model) =>
    Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => Option.some(signIn) }, () => Option.none()),
  write: (model, nextSignIn) =>
    modifyFields(model, {
      page: (page) => Page.matchOrElse(page, { SignedOut: () => Page.SignedOut({ signIn: nextSignIn }) }, () => page)
    })
}).withOutMessagePolicy({ fold: foldSignInOutMessage })

/**
 * Go to the sign-in form with the address kept and `notice` over it, if any, and forget the session, the person's
 * stores, and their sync identity.
 */
const signOutWithNotice = (notice: string | undefined) =>
  ApplicationDefinition.makeStep((model: Model) =>
    SignInBinding.init({
      args: [Page.matchOrElse(model.page, { SignedIn: ({ account }) => account.email }, () => ""), notice],
      toParentModel: (signIn) =>
        modifyFields(model, {
          page: () => Page.SignedOut({ signIn }),
          route: (route) => (notice === undefined ? Route.Workspaces() : route)
        }),
      commands: [SignOut(), ...(notice === undefined ? [Navigate({ url: "/", replace: true })] : [])]
    })
  )

/**
 * Signing out leaves the address in the form, and forgets the session, the person's stores, and their sync identity.
 */
export const signOut = signOutWithNotice(undefined)

/** A session the host no longer knows ends as signing out does, and says so over the form. */
export const endSession = signOutWithNotice("Your session has ended. Sign in again.")

/** Open only a workspace the directory resolved for this account. */
const openWorkspace = (membership: WorkspaceDirectory.Membership, destination: Destination) =>
  Update.combineSteps([
    ApplicationDefinition.makeStep((model: Model) =>
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
    ),
    WorkspaceBinding.requestDestination(membership.workspace.id, { destination })
  ])

/** Apply the latest URL, including when a directory request started for an older one. */
export const restoreRoute = ApplicationDefinition.makeStep((model: Model) => {
  if (!Route.isAnyOf(["Workspace"])(model.route) || !Page.isAnyOf(["SignedIn"])(model.page))
    return ApplicationDefinition.makeNoopStep()
  const { workspaceId, destination } = model.route
  const opened = model.page.workspace
  if (Option.isSome(opened) && opened.value.workspaceId === workspaceId) {
    return destinationPath(destinationOf(opened.value.model)) === destinationPath(destination)
      ? ApplicationDefinition.makeNoopStep()
      : WorkspaceBinding.requestDestination(workspaceId, { destination })
  }
  return Workspaces.matchOrElse(
    model.page.workspaces.workspaces,
    {
      Loaded: ({ memberships }) => {
        const membership = memberships.find(({ workspace }) => workspace.id === workspaceId)
        return membership === undefined ? ApplicationDefinition.makeNoopStep() : openWorkspace(membership, destination)
      }
    },
    () => ApplicationDefinition.makeNoopStep()
  )
})

/** Record a user navigation once; Foldkit's ensuing URL event observes the same route. */
export const navigate = (route: Route, replace = false) =>
  ApplicationDefinition.makeStep((model: Model) => ({
    model: modifyFields(model, { route: () => route }),
    commands: sameRoute(model.route, route) ? [] : [Navigate({ url: href(route), replace })]
  }))

const foldWorkspacesOutMessage = WorkspacesBlock.OutMessage.match({
  EndedSession: () => endSession,
  ListedWorkspaces: () => restoreRoute,
  OpenedWorkspace: ({ membership }) =>
    Update.combineSteps([
      navigate(Route.Workspace({ workspaceId: membership.workspace.id, destination: home() })),
      openWorkspace(membership, home())
    ])
})

export const WorkspacesBinding = ApplicationDefinition.makeBinding(WorkspacesBlock, {
  read: (model) =>
    Page.matchOrElse(model.page, { SignedIn: ({ workspaces }) => Option.some(workspaces) }, () => Option.none()),
  write: (model, nextWorkspaces) =>
    atSignedIn(model, (page) => modifyFields(page, { workspaces: () => nextWorkspaces }))
}).withOutMessagePolicy({ fold: foldWorkspacesOutMessage })

/** Choose the Appearance: the page shows it and the browser keeps it for the next visit. */
const chooseAppearance = (appearance: Appearance) =>
  ApplicationDefinition.makeStep((model: Model) => ({
    model: modifyFields(model, { appearance: () => appearance }),
    commands: [ShowAppearance({ appearance }), KeepAppearance({ appearance })]
  }))

/** Leave the open workspace for the list of the person's workspaces. */
export const closeWorkspace = Update.combineSteps([
  navigate(Route.Workspaces()),
  ApplicationDefinition.makeStep((model: Model) => ({
    model: atSignedIn(model, (page) => modifyFields(page, { workspace: () => Option.none() }))
  }))
])

/**
 * What choosing an entry of the account menu does: an Appearance is shown and kept, another workspace is the list of
 * workspaces, and signing out is signing out.
 */
const chooseAccountEntry = (entry: AppAccountEntry) =>
  Match.value(entry).pipe(
    Match.whenOr("System", "Light", "Dark", chooseAppearance),
    Match.when("SwitchWorkspace", () => closeWorkspace),
    Match.when("SignOut", () => signOut),
    Match.exhaustive
  )

/** A destination changed inside the workspace; automatic resolution replaces its temporary address. */
const recordWorkspaceDestination = (replace: boolean) =>
  ApplicationDefinition.makeStep((model: Model) =>
    Page.matchOrElse(
      model.page,
      {
        SignedIn: ({ workspace }) =>
          Option.match(workspace, {
            onNone: () => ApplicationDefinition.makeNoopStep(),
            onSome: ({ workspaceId, model: workspace }) =>
              navigate(Route.Workspace({ workspaceId, destination: destinationOf(workspace) }), replace)
          })
      },
      () => ApplicationDefinition.makeNoopStep()
    )
  )

/**
 * Leaving a workspace closes it, and an entry of its account menu is acted on.
 */
const foldWorkspaceOutMessage = (
  _workspaceId: WorkspaceId.WorkspaceId,
  outMessage: typeof WorkspaceBlock.OutMessage.Type
) =>
  WorkspaceBlock.OutMessage.match(outMessage, {
    ClosedWorkspace: () => closeWorkspace,
    Navigated: () => recordWorkspaceDestination(false),
    ReplacedDestination: () => recordWorkspaceDestination(true),
    ChoseAccountEntry: ({ entry }) => chooseAccountEntry(entry)
  })

export const WorkspaceBinding = ApplicationDefinition.makeBinding(WorkspaceBlock, {
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
    )
}).withOutMessagePolicy({ fold: foldWorkspaceOutMessage })

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [SignInBinding, WorkspacesBinding, WorkspaceBinding]
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
