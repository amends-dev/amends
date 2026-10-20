import type { WorkspaceId } from "@amends-dev/core/workspace"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { CreateWorkspace, LoadWorkspaces } from "./command.ts"
import { DialogBinding, leaveCreating, WorkspacesComposition } from "./composition.ts"
import {
  Creating,
  Message,
  type Model,
  noFormErrors,
  OutMessage,
  Workspaces,
  WorkspacesDefinition
} from "./definition.ts"

type Form = Extract<Creating, { readonly _tag: "Filling" }>

/** The membership of `workspaceId` among `memberships`, when it is one. */
const findMembership = (
  memberships: ReadonlyArray<WorkspaceDirectory.Membership>,
  workspaceId: WorkspaceId.WorkspaceId
) => Option.fromUndefinedOr(memberships.find(({ workspace }) => workspace.id === workspaceId))

/** The form the person is filling, while they are. */
const formIn = (model: Model) =>
  Option.flatMap(
    model.create,
    Creating.matchOrElse({ Filling: (form) => Option.some(form) }, () => Option.none())
  )

/** The request on its way, while one is. */
const requestIn = (model: Model) =>
  Option.flatMap(
    model.create,
    Creating.matchOrElse({ Sending: (request) => Option.some(request) }, () => Option.none())
  )

/** The workspace created, while the listing is read again to open it. */
const openingIn = (model: Model) =>
  Option.flatMap(
    model.create,
    Creating.matchOrElse({ Opening: (opening) => Option.some(opening) }, () => Option.none())
  )

/** The model with the form as `change` makes it, while the person fills one. */
const atForm = (model: Model, change: (form: Form) => Form) =>
  modifyFields(model, { create: Option.map(Creating.matchOrElse({ Filling: change }, (same) => same)) })

/** Ask for a new workspace: no names yet, no request made, and nothing refused. */
const openForm = WorkspacesDefinition.stepFields(() => ({
  create: () => Option.some(Creating.Filling({ name: "", memberName: "", key: Option.none(), errors: noFormErrors }))
}))

/** What `create` becomes when reading the listing again, to open the workspace created, has failed, or starts over. */
const reloadFailedAs = (reloadFailed: boolean) =>
  Option.map(
    Creating.matchOrElse({ Opening: ({ workspace }) => Creating.Opening({ workspace, reloadFailed }) }, (same) => same)
  )

/** Read the listing again, which is under way until it ends. */
const reload = WorkspacesDefinition.step((model: Model) => ({
  model: modifyFields(model, { workspaces: () => Workspaces.Loading(), create: reloadFailedAs(false) }),
  commands: [LoadWorkspaces()]
}))

export const update = WorkspacesComposition.makeUpdate((model, message) =>
  Message.match(message, {
    SucceededLoadWorkspaces: ({ memberships, invitations }) => {
      const listed = modifyFields(model, { workspaces: () => Workspaces.Loaded({ memberships, invitations }) })
      return Option.match(openingIn(model), {
        onNone: () => ({ model: listed }),
        onSome: ({ workspace }) =>
          Update.withOutMessage(
            Update.combine(listed, [leaveCreating, DialogBinding.requestClose()]),
            Option.match(findMembership(memberships, workspace.id), {
              onNone: () => undefined,
              onSome: (membership) => OutMessage.OpenedWorkspace({ membership })
            })
          )
      })
    },
    FailedLoadWorkspaces: ({ error }) => ({
      model: modifyFields(model, { workspaces: () => Workspaces.Failed({ error }), create: reloadFailedAs(true) })
    }),
    ClickedTryAgain: () => reload(model),
    ClickedWorkspace: ({ workspaceId }) =>
      Option.match(
        Workspaces.matchOrElse(
          model.workspaces,
          { Loaded: ({ memberships }) => findMembership(memberships, workspaceId) },
          () => Option.none()
        ),
        {
          onNone: () => ({ model }),
          onSome: (membership) => ({ model, outMessage: OutMessage.OpenedWorkspace({ membership }) })
        }
      ),
    ClickedAccept: () => ({ model }),
    ClickedCreate: () => Update.combine(model, [openForm, DialogBinding.requestOpen()]),
    TypedName: ({ name }) => ({
      model: atForm(model, (form) =>
        Creating.Filling({
          ...form,
          name,
          key: Option.none(),
          errors: modifyFields(form.errors, { name: () => Option.none(), form: () => Option.none() })
        })
      )
    }),
    TypedMemberName: ({ memberName }) => ({
      model: atForm(model, (form) =>
        Creating.Filling({
          ...form,
          memberName,
          key: Option.none(),
          errors: modifyFields(form.errors, { memberName: () => Option.none(), form: () => Option.none() })
        })
      )
    }),
    SubmittedCreate: () =>
      Option.match(formIn(model), {
        onNone: () => ({ model }),
        onSome: ({ name, memberName, key }) => ({
          model: modifyFields(model, { create: () => Option.some(Creating.Sending({ name, memberName, key })) }),
          commands: [CreateWorkspace({ name, memberName, key })]
        })
      }),
    SucceededCreate: ({ workspace }) => ({
      model: Option.isSome(requestIn(model))
        ? modifyFields(model, { create: () => Option.some(Creating.Opening({ workspace, reloadFailed: false })) })
        : model,
      commands: [LoadWorkspaces()]
    }),
    FailedCreate: ({ key, error }) =>
      Option.match(requestIn(model), {
        onNone: () => ({ model }),
        onSome: ({ name, memberName }) => ({
          model: modifyFields(model, {
            create: () => Option.some(Creating.Filling({ name, memberName, key, errors: error }))
          })
        })
      })
  })
)
